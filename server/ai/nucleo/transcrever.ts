/**
 * TRANSCREVER — o núcleo do STT de nuvem (`POST /api/ai/stt`), sem Express (Fase F).
 *
 * Dois passos, porque o app os separa no tempo: a PORTA (`admitirTranscricao`) roda ANTES de o corpo de
 * até 25 MB ser lido — plano (402), portão (503), configuração (501) e admissão (429 `nuvem_ocupada`:
 * vaga em voo + balde da primeira perna com saldo) —, e a TRANSCRIÇÃO (`transcrever`) roda com o áudio
 * na mão: medição do áudio (415/413), cota de chamada e de segundos no mês e no dia, cascata de pernas
 * (`cascataDeStt.ts`), custo do provedor que respondeu e a limpeza do texto. A API e o MCP chamarão os
 * dois em sequência; o app os chama do middleware e do handler (`server/ai/sttProxy.ts`).
 *
 * DUAS FORMAS DE CHAVE. Sem credencial, a chave do DONO percorre a cascata do registro, na ordem do
 * custo efetivo DESTE áudio (o mínimo de 10 s da Groq manda o clipe curto para quem cobra por segundo),
 * com 429/5xx/timeout passando para a próxima. Com credencial (BYOK, `credencialId`), a chave e o
 * endereço são do usuário: sem cota, sem admissão, sem orçamento — a porta nem roda.
 *
 * QUANTAS TENTATIVAS EXTRAS — UMA, e só em 5xx (ADR 0007), na ÚLTIMA perna (`RETENTATIVAS_DE_STT`): o
 * 429 não repete, fecha o balde até o `Retry-After` e passa para a próxima perna ou volta como 429
 * `nuvem_ocupada`, e o cliente usa o motor local na hora.
 */
import { filtrarAlucinacao } from '../../../src/gateway/alucinacao'
import { credentialsRepo } from '../../db/repositories/credentials'
import { contarDescartesDoStt, observarChamadaDeProvedor } from '../../http/metricas'
import { avaliarAudioFaturavel, duracaoDoAudio, segundosFaturaveis } from '../../lib/duracaoDeAudio'
import { erroDeRota } from '../../lib/erroDeRota'
import { normalizarIdiomaDoWhisper } from '../../lib/idiomaDoWhisper'
import { log } from '../../lib/logger'
import { custoDeStt, minimoFaturadoDoStt, portaoDaNuvem, registrarGastoDeIa } from '../../lib/orcamentoDeIa'
import {
  ContadorIndisponivel,
  estornarSegundosDeStt,
  type ModoDaCota,
  refundManagedCall,
  reservarSegundosDeStt,
  reserveManagedCall,
} from '../../lib/usageQuota'
import { parseOuMotivo, sttHeadersSchema } from '../../validation'
import { planoDeAdmissao } from '../admissao'
import { clienteDesistiu, recusaCancelada } from '../cancelamento'
import {
  type AdmissaoDoStt,
  admitirStt,
  encerrarAdmissaoDoStt,
  ordenarPorCustoEfetivo,
  percorrerCascataDeStt,
  pernasDoStt,
} from '../cascataDeStt'
import { JANELA_ABERTA_MS } from '../disjuntor'
import type { Provedor } from '../provedores'
import { recusaContadorIndisponivel, recusaFranquiaDeAlivioEsgotada, recusaUsoJustoDoDia } from '../reservaDeNuvem'
import { promptDoCabecalho, triarSegmentos } from '../sttQualidade'
import { codigoDeIdioma, nomeDoProvedor } from '../telemetriaDeIa'
import { type ContextoDeIa, recusaDeQuemPede } from './contexto'
import { decisor, type GanchosDoNucleo } from './ganchos'
import { recusaDeErro, type RecusaDeIa, recusaNuvemOcupada, recusaPortaoFechado, recusar } from './recusa'

/** O rótulo de log e de métrica é o da rota do app; a `/v1` terá o dela (change `api-e-mcp`). */
const ROTA = '/api/ai/stt'

/* ─────────────── a PORTA: tudo que é barato, ANTES de ler o corpo ─────────────── */

/** A porta da chave do DONO, aberta: o que a transcrição precisa saber de quem pede. */
export interface PortaGerenciadaDoStt {
  byok: false
  /** O plano da assinatura (`free|premium|selfhost`, matriz v2) — rótulo da métrica de custo por plano. */
  planoDaAssinatura: string
  /** B6: as pernas de STT da chave do DONO, na ordem do registro (a transcrição reordena pelo custo). */
  pernas: Provedor[]
  /** A vaga em voo e o pedido no balde da primeira perna com saldo. */
  admissao: AdmissaoDoStt
  /** De que franquia saem a chamada e os segundos: a do plano, ou a da nuvem de alívio (A10). */
  modo: ModoDaCota
  /** O custo entregue na franquia de quem abriu a porta (pool gratuito, alívio; na API, a chave). */
  registrarCusto?: (usd: number) => Promise<void>
}

/** BYOK passa direto (a chave e o limite são do usuário); a gerenciada traz a admissão. */
export type PortaDoStt = { byok: true } | PortaGerenciadaDoStt

/** Solta a vaga em voo e, se a perna da porta não foi chamada, devolve o pedido ao balde. Idempotente. */
export function fecharPortaDoStt(p: PortaDoStt): void {
  encerrarAdmissaoDoStt(p.byok === true ? undefined : p.admissao)
}

/**
 * As checagens BARATAS do STT gerenciado, em ordem de custo: plano (402), portão global (503),
 * configuração (501) e admissão (429 `nuvem_ocupada`). A cota do usuário NÃO é reservada aqui: ela
 * depende da DURAÇÃO do áudio, que só o corpo diz. Quem abre a porta a fecha (`fecharPortaDoStt`) —
 * `transcrever` também a fecha, no fim.
 */
export async function admitirTranscricao(
  ctx: Omit<ContextoDeIa, 'rastro' | 'flagLigada'>,
): Promise<{ ok: true; porta: PortaGerenciadaDoStt } | RecusaDeIa> {
  const quem = recusaDeQuemPede(ctx)
  if (quem) return quem
  const plano = ctx.entitlements
  /* A NUVEM DE ALÍVIO (A10): a conta Grátis que aceitou a oferta e passou pelas travas dela usa o STT
     gerenciado pela franquia do alívio — o entitlement do plano continua falso, e é por isso que ele
     não é consultado para ela. */
  const alivio = ctx.modo === 'alivio'
  if (!plano.managedCloudStt && !alivio)
    return recusar(402, { error: 'STT de nuvem gerenciada requer um plano pago', entitlement: 'managedCloudStt' })
  // Chave de emergência e orçamento global do mês (orcamentoDeIa.ts), antes de qualquer cota.
  const portao = await portaoDaNuvem()
  if (!portao.ok) return recusaPortaoFechado(portao)
  /* As pernas saem do registro (`pernasDoStt`; no legado, o `sttGerenciadoDoEnv`), a MESMA fonte que
     responde `GET /api/ai/stt/available` (B0 da Fase B). */
  const pernas = pernasDoStt()
  if (pernas.length === 0)
    return recusar(501, { error: 'STT de nuvem não configurado: defina GROQ_API_KEY no servidor (.env)' })
  // O teste de 14 dias (C6) tem o Premium nos entitlements, mas entra na faixa grátis.
  const faixa = planoDeAdmissao(plano.plan, alivio, ctx.emTeste)
  const admissao = admitirStt(pernas, { userId: ctx.userId, plano: faixa })
  if (admissao.ok === false) return recusaNuvemOcupada(admissao.recusa)
  return {
    ok: true,
    porta: {
      byok: false,
      planoDaAssinatura: plano.plan,
      pernas,
      admissao: admissao.admissao,
      modo: ctx.modo,
      ...(ctx.registrarCusto ? { registrarCusto: ctx.registrarCusto } : {}),
    },
  }
}

/* ─────────────── a TRANSCRIÇÃO: com o áudio na mão ─────────────── */

/** O pedido como chegou: o áudio e os campos crus — validados aqui, no mesmo ponto de sempre. */
export interface PedidoDeTranscricao {
  audio: Buffer | undefined
  /** BYOK: o id da credencial do usuário (no app, `x-credential-id`). */
  credencialId?: string
  /** O modelo pedido (`x-model`): só vale no BYOK; na chave do DONO quem decide é o registro. */
  modelo?: string
  /** O idioma da fala (`x-language`), se quem pede sabe. */
  idioma?: string
  /** A última frase confirmada, codificada (`x-stt-prompt`) — o `prompt` do Whisper. */
  prompt?: string
}

/** O texto limpo e o idioma que o PROVEDOR identificou (vazio = não informou; nunca inventado). */
export interface TranscricaoEntregue {
  ok: true
  texto: string
  idioma: string
}

export type ResultadoDaTranscricao = TranscricaoEntregue | RecusaDeIa

/** Quem transcreve: o BYOK não resolve plano, então a transcrição só precisa de identidade e rastro. */
export type QuemTranscreve = Pick<
  ContextoDeIa,
  'userId' | 'requestId' | 'rastro' | 'canal' | 'perfilProtegido' | 'sinal'
>

export async function transcrever(
  ctx: QuemTranscreve,
  porta: PortaDoStt,
  pedido: PedidoDeTranscricao,
  ganchos?: GanchosDoNucleo<ResultadoDaTranscricao>,
): Promise<ResultadoDaTranscricao> {
  const decidir = decisor(ganchos)
  return decidir(await transcreverComAPorta(ctx, porta, pedido, decidir))
}

async function transcreverComAPorta(
  ctx: QuemTranscreve,
  porta: PortaDoStt,
  pedido: PedidoDeTranscricao,
  decidir: (r: ResultadoDaTranscricao) => ResultadoDaTranscricao,
): Promise<ResultadoDaTranscricao> {
  const { rastro, userId, requestId } = ctx
  const gerida = porta.byok === true ? null : porta
  // Reserva pendente de quota gerenciada. Só o ramo da chave do DONO reserva; BYOK não.
  let reservaPendente = false
  /** Segundos reservados nesta requisição (0 = nenhum). Precisa ser estornado junto da chamada. */
  let segundosReservados = 0
  /** A janela do dia em que os segundos caíram (uso justo, matriz v2): o estorno volta para ela. */
  let diaDaReserva: string | null = null
  /** A franquia desta requisição (A10): a do plano ou a do alívio. As duas reservas e os estornos seguem ela. */
  const modo: ModoDaCota = gerida?.modo ?? 'plano'
  try {
    const quem = recusaDeQuemPede(ctx)
    if (quem) return decidir(quem)
    const audioBuffer = pedido.audio
    if (!audioBuffer || !audioBuffer.length) return decidir(recusar(400, { error: 'corpo de áudio vazio' }))

    // Duas formas de resolver a chave:
    //  (a) credencial → POR USUÁRIO (cifrada no DB) — modo BYO-key.
    //  (b) SEM credencial → chave do DONO no servidor (as pernas do registro). É o modo padrão
    //      "distribuível em escala": o usuário não precisa de chave nenhuma, o app só funciona.
    const credentialId = pedido.credencialId
    /** BYOK: a credencial do usuário. */
    let byok: { baseUrl: string | null; secret: string | null; defaultModel: string | null } | null = null
    /** Chave do DONO: as pernas, na ordem do custo DESTE áudio. */
    let pernas: Provedor[] = []
    /** Ramo da chave do DONO: quem pede não escolhe o modelo nem a duração cobrada (P0-2/P0-3). */
    let pagoPeloApp = false

    if (credentialId) {
      rastro.anotar({ byok: true })
      byok = await credentialsRepo.getSecret(userId, credentialId)
    } else {
      // Plano, portão, configuração e admissão já passaram na porta (`admitirTranscricao`).
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
      if (avaliacao.ok === false) return decidir(recusaDeErro(avaliacao.status, avaliacao.error, avaliacao.code))
      /* Quem pediu já foi embora (`cancelamento.ts`): nem reserva. */
      if (clienteDesistiu(ctx.sinal)) return decidir(recusaCancelada())
      // Fair-use: RESERVA antes de chamar o provedor (P0-1 — conferir antes e contabilizar
      // depois deixava N requisições simultâneas passarem pelo mesmo teto). BYOK/local não
      // chegam aqui, então só o uso da chave do DONO consome quota.
      if (!(await reserveManagedCall(userId, modo))) {
        if (modo === 'alivio') return decidir(recusaFranquiaDeAlivioEsgotada())
        return decidir(recusar(402, { error: 'limite mensal do plano atingido', code: 'quota_exceeded' }))
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
      const reservaDeSegundos = await reservarSegundosDeStt(userId, segundosReservados, modo)
      if (reservaDeSegundos.cabe === false) {
        segundosReservados = 0
        if (modo === 'alivio') return decidir(recusaFranquiaDeAlivioEsgotada())
        if (reservaDeSegundos.recusa === 'dia') return decidir(await recusaUsoJustoDoDia(userId))
        return decidir(recusar(402, { error: 'limite mensal de áudio do plano atingido', code: 'quota_exceeded' }))
      }
      diaDaReserva = reservaDeSegundos.dia
      /* B6: a ORDEM DAS PERNAS é o custo deste áudio — com o mínimo faturado de cada uma. */
      pernas = ordenarPorCustoEfetivo(gerida?.pernas ?? [], duracaoDoAudio(audioBuffer) ?? avaliacao.segundosDoUsuario)
    }

    if (byok) {
      if (!byok.baseUrl) return decidir(recusar(400, { error: 'credencial sem baseUrl' }))
      if (!byok.secret) return decidir(recusar(400, { error: 'credencial sem segredo' }))
      /* O anti-SSRF do endereço do usuário é o da cascata (`assertPublicUrl` perna a perna, com o
         `fetch` pelo `despachanteSeguro` logo depois) — o mesmo das pernas da chave do DONO. */
    }

    /* ACHADO DA FASE 4: `x-model` e `x-language` iam do cabeçalho para dentro do `FormData` do
       provedor sem validação nenhuma — o cabeçalho escolhia (e pagava) o modelo, e o idioma
       entrava verbatim no campo `language`. Agora os dois passam por schema de formato e tamanho;
       fora do formato é 400 aqui, antes de qualquer chamada externa. */
    const cabecalhos = parseOuMotivo(sttHeadersSchema, { 'x-model': pedido.modelo, 'x-language': pedido.idioma })
    if (cabecalhos.ok === false) return decidir(recusar(400, { error: cabecalhos.error }))

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
          model: cabecalhos.data['x-model'] || byok.defaultModel || 'whisper-large-v3-turbo',
          formato: 'openai',
        },
      ]
    }
    const lang = cabecalhos.data['x-language']
    /* O CONTEXTO DA FALA ANTERIOR, como `prompt` do Whisper. Sem ele cada enunciado de ~6 s é
       decodificado do zero: nome próprio muda de grafia de uma fala para a outra, e em áudio curto
       o idioma oscila. O cliente manda a última frase confirmada; `promptDoCabecalho` decodifica,
       limpa e corta — e ignora em silêncio o que não decodifica. */
    const prompt = promptDoCabecalho(pedido.prompt)
    rastro.anotar({ parDeIdiomas: codigoDeIdioma(lang) })

    /* A CASCATA (`cascataDeStt.ts`): perna a perna, com admissão, disjuntor e medição. Pedimos
       `verbose_json` PARA NÃO JOGAR FORA O IDIOMA: o Whisper identifica o idioma a partir do ÁUDIO,
       dentro do decode, e pedindo `json` recebíamos só o texto — foi assim que uma sessão inteira em
       espanhol apareceu rotulada como inglês. No BYOK a URL é escolha do usuário: a telemetria usa o
       rótulo fixo `byok`, nunca o host. */
    const resultado = await percorrerCascataDeStt(
      pernas,
      { audio: audioBuffer, idioma: lang, prompt },
      { requestId, rastro, byok: !pagoPeloApp, admissao: gerida?.admissao, sinal: ctx.sinal },
    )

    if (resultado.ok === false) {
      const falha = resultado.falha
      /* QUEM PEDIU DESISTIU (auditoria de 10/10/2026, A7): a tentativa foi abortada e nenhuma outra
         perna foi chamada. A chamada e os segundos reservados voltam no `finally`, como em toda
         saída sem transcrição. */
      if (falha.tipo === 'cancelado') {
        log('info', { event: 'stt_cancelado', route: ROTA, status: 499, requestId })
        return decidir(recusaCancelada())
      }
      /* O DISJUNTOR (ADR 0007): com os provedores fora do ar, cada fala pagava 30 s de timeout antes
         de o cliente cair no local. Aberto, a resposta é imediata: 503 com `Retry-After`, e o
         cliente religa a nuvem sozinho depois. */
      if (falha.tipo === 'disjuntor')
        return decidir(
          recusaDeErro(
            503,
            'transcrição de nuvem indisponível agora; o app segue com o motor local',
            'provedor_em_disjuntor',
            undefined,
            Math.ceil(JANELA_ABERTA_MS / 1000),
          ),
        )
      /* 429 DO PROVEDOR (todas as pernas chamadas) ou balde vazio em todas: 429 `nuvem_ocupada` —
         antes virava 502, e o cliente tratava limite de taxa como defeito. */
      if (falha.tipo === 'limitado')
        return decidir(recusaNuvemOcupada({ motivo: 'provedor_limitou', retryAfterS: falha.retryAfterS }))
      if (falha.tipo === 'sem_saldo') return decidir(recusaNuvemOcupada(falha.recusa))
      if (falha.tipo === 'excecao') throw falha.erro
      /* O CORPO DO TERCEIRO NÃO É PARA O CLIENTE (achado da Fase 4). O que o provedor escreve num
         erro não é contrato nosso: pode trazer nome de modelo interno, id de organização, host ou
         trecho do pedido. Quem pede precisa saber que falhou e poder CITAR o `requestId`; o texto
         do upstream fica no log estruturado, que é onde alguém investiga. */
      log('error', {
        event: 'stt_upstream_erro',
        route: ROTA,
        status: falha.status,
        error: falha.texto.slice(0, 300),
        requestId,
      })
      return decidir(
        recusaDeErro(
          502,
          requestId ? `transcrição indisponível (req: ${requestId})` : 'transcrição indisponível',
          'provedor_indisponivel',
        ),
      )
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
      await registrarGastoDeIa(custoUsd, { userId, plano: gerida?.planoDaAssinatura })
      await gerida?.registrarCusto?.(custoUsd)
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
    const limpeza = limparTranscricao(j, audioBuffer, lang || idioma, requestId)
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
    return decidir({ ok: true, texto: limpeza.texto, idioma })
  } catch (err) {
    /* A cota falha FECHADA (Fase 2 do lançamento): contador fora do ar é 503 com motivo, e o
       roteador de STT do cliente cai no Whisper local. */
    if (err instanceof ContadorIndisponivel) return decidir(recusaContadorIndisponivel())
    return decidir(recusar(502, { error: erroDeRota(err, { status: 502, event: 'stt_route_error' }) }))
  } finally {
    fecharPortaDoStt(porta)
    // As duas reservas caem juntas: cobrar segundos por uma transcrição que não aconteceu é o
    // mesmo defeito que cobrar a chamada.
    if (reservaPendente) await refundManagedCall(userId, modo)
    if (segundosReservados > 0) await estornarSegundosDeStt(userId, segundosReservados, modo, diaDaReserva)
  }
}

/**
 * O TEXTO QUE VOLTA — triado por segmento e passado pelo filtro de alucinação.
 *
 * Duas camadas, na ordem em que a informação existe:
 *   1. `triarSegmentos` usa os sinais POR SEGMENTO do `verbose_json` (silêncio com baixa confiança,
 *      laço de repetição) e remonta o texto com o que ficou. Resposta em `json` não tem segmentos e
 *      pula esta camada;
 *   2. `filtrarAlucinacao` — o MESMO filtro do Whisper local (`src/gateway/alucinacao.ts`, puro e
 *      isomórfico) — corta o que sabidamente não é fala: créditos de legenda, "obrigado por
 *      assistir", texto rápido demais para a duração do áudio.
 *
 * Texto esvaziado volta como `''` com sucesso: o cliente já trata final vazio (é o que o Whisper local
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
      route: ROTA,
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
