/**
 * Proxy de STT (chokepoint de segredos, espelha a transcrição do desktop). O
 * navegador POST áudio WAV bruto (`req.body` é Buffer) ao header `x-credential-id`;
 * o server resolve a credencial → segredo + baseUrl, valida SSRF, e encaminha ao
 * Whisper de nuvem (OpenAI-compatible `/audio/transcriptions`). A chave NUNCA
 * chega ao cliente.
 *
 * DESDE O B6 DA FASE B a chave do DONO percorre uma CASCATA (`cascataDeStt.ts`): as pernas de STT
 * do registro, na ordem do custo efetivo DESTE áudio (o mínimo de 10 s da Groq manda o clipe curto
 * para quem cobra por segundo), nos formatos OpenAI multipart e Cloudflare base64, com 429/5xx/timeout
 * passando para a próxima. No legado (uma perna) e no BYOK, o comportamento é o de antes.
 */
import type { NextFunction, Request, Response } from 'express'

import { filtrarAlucinacao } from '../../src/gateway/alucinacao'
import { credentialsRepo } from '../db/repositories/credentials'
import { contarDescartesDoStt, observarChamadaDeProvedor } from '../http/metricas'
import { abrirPortaGratuita, type PortaGratuita } from '../lib/convidado'
import { avaliarAudioFaturavel, duracaoDoAudio, segundosFaturaveis } from '../lib/duracaoDeAudio'
import { getEntitlements } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { normalizarIdiomaDoWhisper } from '../lib/idiomaDoWhisper'
import { log } from '../lib/logger'
import {
  custoDeStt,
  minimoFaturadoDoStt,
  portaoDaNuvem,
  registrarGastoDeIa,
  responderPortaoFechado,
} from '../lib/orcamentoDeIa'
import { responderErro } from '../lib/respostaDeErro'
import {
  ContadorIndisponivel,
  estornarSegundosDeStt,
  type ModoDaCota,
  refundManagedCall,
  reservarSegundosDeStt,
  reserveManagedCall,
} from '../lib/usageQuota'
import { parseOr400, sttHeadersSchema } from '../validation'
import { type PlanoDeAdmissao, planoDeAdmissao, responderNuvemOcupada } from './admissao'
import {
  type AdmissaoDoStt,
  admitirStt,
  encerrarAdmissaoDoStt,
  ordenarPorCustoEfetivo,
  percorrerCascataDeStt,
  pernasDoStt,
} from './cascataDeStt'
import { JANELA_ABERTA_MS } from './disjuntor'
import type { Provedor } from './provedores'
import {
  responderContadorIndisponivel,
  responderFranquiaDeAlivioEsgotada,
  responderUsoJustoDoDia,
} from './reservaDeNuvem'
import { promptDoCabecalho, triarSegmentos } from './sttQualidade'
import { abrirRastro, codigoDeIdioma, nomeDoProvedor, type RastroDeIa } from './telemetriaDeIa'

/*
 * QUANTAS TENTATIVAS EXTRAS — UMA, e só em 5xx (ADR 0007). Mora em `cascataDeStt.ts`
 * (`RETENTATIVAS_DE_STT`), e desde o B6 vale para a ÚLTIMA perna: havendo outra, ela atende na hora.
 *
 * Eram duas, e valiam também para o 429: cada limite de taxa do provedor virava TRÊS pedidos, no
 * exato momento em que ele pedia para diminuir o ritmo, e o `Retry-After` era ignorado. Agora o 429
 * não repete — ele fecha o balde da admissão até o `Retry-After` e passa para a próxima perna ou volta
 * ao cliente como 429 `nuvem_ocupada`, e o cliente usa o motor local na hora.
 */

/* ─────────────── a PORTA do STT: tudo que é barato, ANTES de ler o corpo ─────────────── */

/*
 * O STT gerenciado — a chave do DONO — é lido na porta para o 501 sair ANTES de o corpo de 25 MB ser
 * lido. As pernas saem do registro (`pernasDoStt`; no legado, o `sttGerenciadoDoEnv` de
 * `server/lib/config.ts`), a MESMA fonte que responde `GET /api/ai/stt/available` (B0 da Fase B):
 * eram duas, e discordavam — a disponibilidade dizia 200 com só `LLM_API_KEY` configurada, e esta
 * porta respondia 501.
 */

/** O que a porta decidiu, do middleware até o handler. */
interface PortaDoStt {
  byok: boolean
  plano?: PlanoDeAdmissao
  /** O plano da assinatura (`free|premium|selfhost`, matriz v2) — rótulo da métrica de custo por plano. */
  planoDaAssinatura?: string
  /** B6: as pernas de STT da chave do DONO, na ordem do registro (o handler reordena pelo custo). */
  pernas?: Provedor[]
  /** A vaga em voo e o pedido no balde da primeira perna com saldo. */
  admissao?: AdmissaoDoStt
  /** Fase 7: as travas de convidado/free (pool do dia, tetos por id e por IP). */
  gratuita?: PortaGratuita
  /** De que franquia saem a chamada e os segundos: a do plano, ou a da nuvem de alívio (A10). */
  modo?: ModoDaCota
}

const portas = new WeakMap<Request, PortaDoStt>()

/** Solta a vaga em voo e, se a perna da porta não foi chamada, devolve o pedido ao balde. Idempotente. */
function fecharPorta(p: PortaDoStt): void {
  encerrarAdmissaoDoStt(p.admissao)
}

/**
 * As checagens BARATAS do STT gerenciado, em ordem de custo: plano (402), portão global (503),
 * configuração (501) e admissão (429 `nuvem_ocupada`: vaga em voo do usuário + balde da primeira
 * perna com saldo). Devolve `null` quando JÁ RESPONDEU. BYOK passa direto: a chave e o limite são
 * do usuário.
 *
 * A cota do usuário NÃO é reservada aqui: ela depende da DURAÇÃO do áudio, que só o corpo diz.
 */
async function abrirPortaDoStt(req: Request, res: Response): Promise<PortaDoStt | null> {
  if (req.header('x-credential-id')) return { byok: true }
  // SaaS Fatia 1b — STT de nuvem GERENCIADA (chave do DONO) exige o entitlement. BYOK e o STT local
  // (no navegador) passam livres: só o caminho que gasta a chave do serviço é gateado.
  /* Fase 7: convidado (flag, limite por IP, tetos) e pool gratuito do dia — antes do entitlement,
     porque é a porta que diz ao convidado POR QUE não pode (`exige_conta`, `limite_de_convidados`). */
  const gratuita = await abrirPortaGratuita(req, res, 'stt')
  if (!gratuita) return null
  const plano = getEntitlements(gratuita.plano)
  /* A NUVEM DE ALÍVIO (A10): a conta Grátis que aceitou a oferta e passou pelas travas dela
     (`nuvemDeAlivio.ts`) usa o STT gerenciado pela franquia do alívio — o entitlement do plano
     continua falso, e é por isso que ele não é consultado aqui. */
  const alivio = gratuita.alivio === true
  if (!plano.managedCloudStt && !alivio) {
    res.status(402).json({ error: 'STT de nuvem gerenciada requer um plano pago', entitlement: 'managedCloudStt' })
    return null
  }
  // Chave de emergência e orçamento global do mês (orcamentoDeIa.ts), antes de qualquer cota.
  const portao = await portaoDaNuvem()
  if (!portao.ok) {
    responderPortaoFechado(res, portao)
    return null
  }
  const pernas = pernasDoStt()
  if (pernas.length === 0) {
    res.status(501).json({ error: 'STT de nuvem não configurado: defina GROQ_API_KEY no servidor (.env)' })
    return null
  }
  // O teste de 14 dias (C6) tem o Premium nos entitlements, mas entra na faixa grátis.
  const faixa = planoDeAdmissao(plano.plan, alivio, gratuita.teste === true)
  const admissao = admitirStt(pernas, { userId: req.userId, plano: faixa })
  if (admissao.ok === false) {
    responderNuvemOcupada(res, admissao.recusa)
    return null
  }
  return {
    byok: false,
    plano: faixa,
    planoDaAssinatura: plano.plan,
    pernas,
    admissao: admissao.admissao,
    gratuita,
    modo: alivio ? 'alivio' : 'plano',
  }
}

/**
 * MIDDLEWARE montado ANTES do `express.raw()` em `server/routes/ai.ts` (fase 2, §2.3): o corpo de
 * até 25 MB só é lido por quem passou pelo plano, pelo portão, pela configuração e pela admissão.
 * Antes o `raw()` lia tudo e SÓ DEPOIS vinham o 402 e o 501 — memória gasta para recusar.
 *
 * A vaga em voo é solta no `close` da resposta além do `finally` do handler: se o `raw()` recusar o
 * corpo (413) o handler nem roda, e a vaga ficaria presa para sempre.
 */
export async function portaDoStt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const porta = await abrirPortaDoStt(req, res)
    if (!porta) return
    portas.set(req, porta)
    res.on('close', () => fecharPorta(porta))
    next()
  } catch (err) {
    if (err instanceof ContadorIndisponivel) {
      if (!res.headersSent) responderContadorIndisponivel(res)
      return
    }
    if (!res.headersSent) res.status(502).json({ error: erroDeRota(err, { status: 502, event: 'stt_route_error' }) })
  }
}

/**
 * POST /api/ai/stt/transcribe (OpenAI-compatible Whisper) — embrulhado no rastro de telemetria
 * (`telemetriaDeIa.ts`): um rastro por requisição, uma geração por tentativa ao provedor, com os
 * segundos de áudio REAIS e os FATURADOS lado a lado. A diferença entre os dois é o mínimo de 10 s
 * da Groq, e é ela que diz se vale juntar falas curtas antes de mandar.
 */
export async function sttTranscribeProxy(req: Request, res: Response): Promise<void> {
  const rastro = abrirRastro(req, 'stt')
  try {
    await transcrever(req, res, rastro)
  } finally {
    rastro.encerrar(res.statusCode)
  }
}

async function transcrever(req: Request, res: Response, rastro: RastroDeIa): Promise<void> {
  // Reserva pendente de quota gerenciada. Só o ramo da chave do DONO reserva; BYOK não.
  let reservaPendente = false
  /** Segundos reservados nesta requisição (0 = nenhum). Precisa ser estornado junto da chamada. */
  let segundosReservados = 0
  /** A janela do dia em que os segundos caíram (uso justo, matriz v2): o estorno volta para ela. */
  let diaDaReserva: string | null = null
  /* A porta normalmente já rodou no middleware (antes do `raw()`); chamada direta ao handler — os
     testes, e qualquer montagem sem o middleware — passa por ela aqui. */
  let porta: PortaDoStt | undefined = portas.get(req)
  /** A franquia desta requisição (A10): a do plano ou a do alívio. As duas reservas e os estornos seguem ela. */
  let modo: ModoDaCota = 'plano'
  try {
    if (!porta) {
      porta = (await abrirPortaDoStt(req, res)) ?? undefined
      if (!porta) return
    }
    modo = porta.modo ?? 'plano'
    const audioBuffer = req.body as Buffer | undefined
    if (!audioBuffer || !audioBuffer.length) {
      res.status(400).json({ error: 'corpo de áudio vazio' })
      return
    }

    // Duas formas de resolver a chave:
    //  (a) x-credential-id → credencial POR USUÁRIO (cifrada no DB) — modo BYO-key.
    //  (b) SEM credencial → chave do DONO no servidor (as pernas do registro). É o modo padrão
    //      "distribuível em escala": o usuário não precisa de chave nenhuma, o app só funciona.
    const credentialId = req.header('x-credential-id')
    /** BYOK: a credencial do usuário. */
    let byok: { baseUrl: string | null; secret: string | null; defaultModel: string | null } | null = null
    /** Chave do DONO: as pernas, na ordem do custo DESTE áudio. */
    let pernas: Provedor[] = []
    /** Ramo da chave do DONO: o cliente não escolhe o modelo nem a duração cobrada (P0-2/P0-3). */
    let pagoPeloApp = false

    if (credentialId) {
      rastro.anotar({ byok: true })
      byok = await credentialsRepo.getSecret(req.userId, credentialId)
    } else {
      // Plano, portão, configuração e admissão já passaram na porta (`abrirPortaDoStt`).
      pagoPeloApp = true
      /* P0-2 (auditoria de prontidão, 25/09/2026): o áudio é MEDIDO antes de qualquer reserva. Antes,
         um corpo ilegível era cobrado como 10 s e seguia para o provedor, e a duração saía do
         `byteRate` que o próprio cliente escreve no cabeçalho — 13 min declarados como 1 s. Agora a
         taxa é derivada dos campos do `fmt `, o incoerente é 415 e o que passa do teto por requisição
         é 413. Recusar (em vez de cobrar pelo pior caso) não quebra o cliente legítimo: ele SEMPRE
         manda Ogg Opus mono (`src/gateway/audio/opusDoStt.ts`) ou, sem WebCodecs, WAV PCM 16 bits
         mono (`src/gateway/audio/wav.ts`). No Ogg, o granule final é conferido contra as amostras
         dos pacotes — a mesma regra de coerência do `fmt ` (ver `duracaoDoOggOpus`). Antes da
         reserva de propósito: recusa não toca contador, então não há o que estornar. */
      const avaliacao = avaliarAudioFaturavel(audioBuffer)
      if (avaliacao.ok === false) {
        responderErro(res, avaliacao.status, avaliacao.error, avaliacao.code)
        return
      }
      // Fair-use: RESERVA antes de chamar o provedor (P0-1 — conferir antes e contabilizar
      // depois deixava N requisições simultâneas passarem pelo mesmo teto). BYOK/local não
      // chegam aqui, então só o uso da chave do DONO consome quota.
      if (!(await reserveManagedCall(req.userId, modo))) {
        if (modo === 'alivio') responderFranquiaDeAlivioEsgotada(res)
        else res.status(402).json({ error: 'limite mensal do plano atingido', code: 'quota_exceeded' })
        return
      }
      reservaPendente = true
      /* TETO DE ÁUDIO, ao lado do de fair-use. O provedor cobra por DURAÇÃO, então contar chamadas
         não limita gasto: uma chamada pode ser 1 segundo ou 25 MB.

         A COTA DO ASSINANTE É A DURAÇÃO REAL (24/09/2026). Até aqui reservávamos
         `segundosFaturaveis` — o mínimo de 10 s que a Groq cobra por requisição —, e com falas de
         ~6 s o plano que promete 15 h entregava ~9 h de fala. O mínimo é custo do DONO: ele entra
         no orçamento global, logo abaixo, e não na cota de quem paga o plano. */
      segundosReservados = avaliacao.segundosDoUsuario
      /* O MÊS E DEPOIS O DIA (uso justo, matriz v2): passou do dia, 429 `uso_justo_do_dia` — a
         legenda segue no aparelho e ninguém vende nada a quem já assina. A chamada reservada acima
         cai no `finally`, como em toda recusa. */
      const reservaDeSegundos = await reservarSegundosDeStt(req.userId, segundosReservados, modo)
      if (reservaDeSegundos.cabe === false) {
        segundosReservados = 0
        if (modo === 'alivio') responderFranquiaDeAlivioEsgotada(res)
        else if (reservaDeSegundos.recusa === 'dia') await responderUsoJustoDoDia(res, req.userId)
        else res.status(402).json({ error: 'limite mensal de áudio do plano atingido', code: 'quota_exceeded' })
        return
      }
      diaDaReserva = reservaDeSegundos.dia
      /* B6: a ORDEM DAS PERNAS é o custo deste áudio — com o mínimo faturado de cada uma. */
      pernas = ordenarPorCustoEfetivo(porta.pernas ?? [], duracaoDoAudio(audioBuffer) ?? avaliacao.segundosDoUsuario)
    }

    if (byok) {
      if (!byok.baseUrl) {
        res.status(400).json({ error: 'credencial sem baseUrl' })
        return
      }
      if (!byok.secret) {
        res.status(400).json({ error: 'credencial sem segredo' })
        return
      }
      /* O anti-SSRF do endereço do usuário é o da cascata (`assertPublicUrl` perna a perna, com o
         `fetch` pelo `despachanteSeguro` logo depois) — o mesmo das pernas da chave do DONO. */
    }

    /* ACHADO DA FASE 4: `x-model` e `x-language` iam do cabeçalho para dentro do `FormData` do
       provedor sem validação nenhuma — o cabeçalho escolhia (e pagava) o modelo, e o idioma
       entrava verbatim no campo `language`. Agora os dois passam por schema de formato e tamanho;
       fora do formato é 400 aqui, antes de qualquer chamada externa. */
    const cabecalhos = parseOr400(
      sttHeadersSchema,
      {
        'x-model': req.header('x-model'),
        'x-language': req.header('x-language'),
      },
      res,
    )
    if (!cabecalhos) return

    /* P0-3 (auditoria de prontidão): na chave do DONO, `x-model` é IGNORADO — quem decide é o
       registro (cada perna tem o modelo dela). O schema acima só garante o FORMATO do nome; nada
       impedia trocar o turbo pelo modelo cheio (2,8× o preço por hora de áudio). No BYOK a chave e a
       conta são do usuário: ele escolhe livremente. */
    if (byok) {
      pernas = [
        {
          rotulo: 'byok',
          base: byok.baseUrl as string,
          apiKey: byok.secret,
          model: cabecalhos['x-model'] || byok.defaultModel || 'whisper-large-v3-turbo',
          formato: 'openai',
        },
      ]
    }
    const lang = cabecalhos['x-language']
    /* O CONTEXTO DA FALA ANTERIOR, como `prompt` do Whisper. Sem ele cada enunciado de ~6 s é
       decodificado do zero: nome próprio muda de grafia de uma fala para a outra, e em áudio curto
       o idioma oscila. O cliente manda a última frase confirmada; `promptDoCabecalho` decodifica,
       limpa e corta — e ignora em silêncio o que não decodifica. */
    const prompt = promptDoCabecalho(req.header('x-stt-prompt'))
    rastro.anotar({ parDeIdiomas: codigoDeIdioma(lang) })

    /* A CASCATA (`cascataDeStt.ts`): perna a perna, com admissão, disjuntor e medição. Pedimos
       `verbose_json` PARA NÃO JOGAR FORA O IDIOMA: o Whisper identifica o idioma a partir do ÁUDIO,
       dentro do decode, e pedindo `json` recebíamos só o texto — foi assim que uma sessão inteira em
       espanhol apareceu rotulada como inglês. No BYOK a URL é escolha do usuário: a telemetria usa o
       rótulo fixo `byok`, nunca o host. */
    const resultado = await percorrerCascataDeStt(
      pernas,
      { audio: audioBuffer, idioma: lang, prompt },
      { requestId: req.requestId, rastro, byok: !pagoPeloApp, admissao: porta.admissao },
    )

    if (resultado.ok === false) {
      const falha = resultado.falha
      /* O DISJUNTOR (ADR 0007): com os provedores fora do ar, cada fala pagava 30 s de timeout antes
         de o cliente cair no local. Aberto, a resposta é imediata: 503 com `Retry-After`, e o
         cliente religa a nuvem sozinho depois. */
      if (falha.tipo === 'disjuntor') {
        res.setHeader?.('Retry-After', String(Math.ceil(JANELA_ABERTA_MS / 1000)))
        responderErro(
          res,
          503,
          'transcrição de nuvem indisponível agora; o app segue com o motor local',
          'provedor_em_disjuntor',
        )
        return
      }
      /* 429 DO PROVEDOR (todas as pernas chamadas) ou balde vazio em todas: 429 `nuvem_ocupada` —
         antes virava 502, e o cliente tratava limite de taxa como defeito. */
      if (falha.tipo === 'limitado') {
        responderNuvemOcupada(res, { motivo: 'provedor_limitou', retryAfterS: falha.retryAfterS })
        return
      }
      if (falha.tipo === 'sem_saldo') {
        responderNuvemOcupada(res, falha.recusa)
        return
      }
      if (falha.tipo === 'excecao') throw falha.erro
      /* O CORPO DO TERCEIRO NÃO É PARA O CLIENTE (achado da Fase 4). O que o provedor escreve num
         erro não é contrato nosso: pode trazer nome de modelo interno, id de organização, host ou
         trecho do pedido. O cliente precisa saber que falhou e poder CITAR o `requestId`; o texto
         do upstream fica no log estruturado, que é onde alguém investiga. */
      log('error', {
        event: 'stt_upstream_erro',
        route: '/api/ai/stt',
        status: falha.status,
        error: falha.texto.slice(0, 300),
        requestId: req.requestId,
      })
      responderErro(
        res,
        502,
        req.requestId ? `transcrição indisponível (req: ${req.requestId})` : 'transcrição indisponível',
        'provedor_indisponivel',
      )
      return
    }

    const { perna, resposta: j } = resultado
    const gerenciado = segundosReservados > 0
    // Consumada. Antes daqui havia um `recordManagedCall` incondicional, que contabilizava
    // TAMBÉM o caminho BYOK — uso da chave do próprio usuário descontava da quota gerenciada.
    reservaPendente = false
    /* Só o caminho da chave do DONO entra no orçamento global; BYOK é conta do próprio usuário. E
       aqui o número é o que o PROVEDOR QUE RESPONDEU fatura (`segundosFaturaveis`, com o mínimo DELE
       — 10 s na Groq, zero em quem cobra por segundo; B2 e B6 da Fase B), não o que saiu da cota do
       assinante: o orçamento existe para bater com a fatura. */
    const fornecedor = nomeDoProvedor(perna.base)
    const quemCobra = pagoPeloApp ? { fornecedor, preco: perna.preco } : {}
    const faturados = segundosFaturaveis(audioBuffer, minimoFaturadoDoStt(perna.model, quemCobra))
    const custoUsd = gerenciado ? custoDeStt(perna.model, faturados, quemCobra) : undefined
    if (custoUsd !== undefined) {
      await registrarGastoDeIa(custoUsd, { userId: req.userId, plano: porta.planoDaAssinatura })
      await porta.gratuita?.registrarCusto(custoUsd)
    }
    segundosReservados = 0 // consumados junto com a chamada: nada a estornar
    observarChamadaDeProvedor({
      provedor: gerenciado ? perna.rotulo : 'byok',
      funcao: 'stt',
      ms: Date.now() - resultado.inicioDaPerna,
      custoUsd,
      fornecedor: gerenciado ? fornecedor : 'byok',
      modelo: gerenciado ? perna.model : 'byok',
    })

    // `language` vazio = o provedor não informou (ou caímos no `json`): o cliente volta ao
    // detector de texto. Nunca inventamos um código aqui.
    const idioma = normalizarIdiomaDoWhisper(j.language)
    const limpeza = limparTranscricao(j, audioBuffer, lang || idioma, req.requestId)
    /* A GERAÇÃO QUE ENTREGOU. `filtrado-vazio` separa "o provedor não ouviu nada" de "o provedor
       inventou e o filtro cortou" — a segunda é custo pago por alucinação, e é o número que diz se o
       VAD do cliente está mandando silêncio demais. Os segundos REAIS são a duração do áudio; os
       FATURADOS têm o mínimo por requisição do provedor. */
    const segundosReais = duracaoDoAudio(audioBuffer) ?? (typeof j.duration === 'number' ? j.duration : 0)
    rastro.anotar({
      parDeIdiomas: codigoDeIdioma(lang || idioma),
      segmentosDescartados: limpeza.descartados,
    })
    rastro.tentativa({
      inicio: resultado.inicioDaTentativa,
      fim: Date.now(),
      provedor: pagoPeloApp ? fornecedor : 'byok',
      modelo: perna.model,
      status: limpeza.esvaziado ? 'filtrado-vazio' : 'ok',
      uso: {
        audio_seconds: Math.round(segundosReais * 100) / 100,
        audio_seconds_billed: faturados,
      },
      custoUsd,
      metadados: {
        statusHttp: resultado.status,
        semFala: limpeza.semFala,
        repeticao: limpeza.repeticao,
        alucinacao: limpeza.alucinacao,
      },
      ...(rastro.conteudoPermitido ? { saida: limpeza.texto } : {}),
    })
    res.json({ text: limpeza.texto, language: idioma })
  } catch (err) {
    /* A cota falha FECHADA (Fase 2 do lançamento): contador fora do ar é 503 com motivo, e o
       roteador de STT do cliente cai no Whisper local. */
    if (err instanceof ContadorIndisponivel) {
      if (!res.headersSent) responderContadorIndisponivel(res)
      return
    }
    if (!res.headersSent) res.status(502).json({ error: erroDeRota(err, { status: 502, event: 'stt_route_error' }) })
  } finally {
    if (porta) fecharPorta(porta)
    // As duas reservas caem juntas: cobrar segundos por uma transcrição que não aconteceu é o
    // mesmo defeito que cobrar a chamada.
    if (reservaPendente) await refundManagedCall(req.userId, modo)
    if (segundosReservados > 0) await estornarSegundosDeStt(req.userId, segundosReservados, modo, diaDaReserva)
  }
}

/**
 * O TEXTO QUE VOLTA AO CLIENTE — triado por segmento e passado pelo filtro de alucinação.
 *
 * Duas camadas, na ordem em que a informação existe:
 *   1. `triarSegmentos` usa os sinais POR SEGMENTO do `verbose_json` (silêncio com baixa confiança,
 *      laço de repetição) e remonta o texto com o que ficou. Resposta em `json` não tem segmentos e
 *      pula esta camada;
 *   2. `filtrarAlucinacao` — o MESMO filtro do Whisper local (`src/gateway/alucinacao.ts`, puro e
 *      isomórfico) — corta o que sabidamente não é fala: créditos de legenda, "obrigado por
 *      assistir", texto rápido demais para a duração do áudio.
 *
 * Texto esvaziado volta como `''` com 200: o cliente já trata final vazio (é o que o Whisper local
 * produz no silêncio). O log conta QUANTOS e POR QUÊ, nunca o quê.
 */
function limparTranscricao(
  j: { text?: unknown; segments?: unknown; duration?: unknown },
  audio: Buffer,
  idioma: string | undefined,
  requestId: string | undefined,
): LimpezaDaTranscricao {
  const bruto = typeof j.text === 'string' ? j.text : ''
  const triagem = triarSegmentos(j.segments)
  const triado = triagem ? triagem.texto : bruto
  const duracao = duracaoDoAudio(audio) ?? (typeof j.duration === 'number' ? j.duration : 0)
  const filtrado = filtrarAlucinacao(triado, duracao, idioma || undefined)
  const alucinacao = triado.trim() && !filtrado ? 1 : 0

  const semFala = triagem?.semFala ?? 0
  const repeticao = triagem?.repeticao ?? 0
  if (semFala + repeticao + alucinacao > 0) {
    contarDescartesDoStt('sem_fala', semFala)
    contarDescartesDoStt('repeticao', repeticao)
    contarDescartesDoStt('alucinacao', alucinacao)
    log('info', {
      event: 'stt_segmentos_descartados',
      route: '/api/ai/stt',
      total: triagem?.total ?? 0,
      semFala,
      repeticao,
      alucinacao,
      requestId,
    })
  }
  return {
    texto: filtrado,
    semFala,
    repeticao,
    alucinacao,
    descartados: semFala + repeticao + alucinacao,
    /* Havia texto do provedor e nada sobrou: o filtro cortou tudo. */
    esvaziado: bruto.trim() !== '' && filtrado.trim() === '',
  }
}

/** O texto limpo e as contagens do que saiu — as contagens vão para métrica, log e telemetria. */
interface LimpezaDaTranscricao {
  texto: string
  semFala: number
  repeticao: number
  alucinacao: number
  descartados: number
  esvaziado: boolean
}
