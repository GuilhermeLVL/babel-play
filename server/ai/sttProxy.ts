/**
 * Proxy de STT (chokepoint de segredos, espelha a transcrição do desktop). O
 * navegador POST áudio WAV bruto (`req.body` é Buffer) ao header `x-credential-id`;
 * o server resolve a credencial → segredo + baseUrl, valida SSRF, e encaminha ao
 * Whisper de nuvem (OpenAI-compatible `/audio/transcriptions`). A chave NUNCA
 * chega ao cliente.
 */
import type { Request, Response } from 'express'

import { filtrarAlucinacao } from '../../src/gateway/alucinacao'
import { credentialsRepo } from '../db/repositories/credentials'
import { contarDescartesDoStt, observarChamadaDeProvedor } from '../http/metricas'
import { avaliarAudioFaturavel, duracaoDoWav, segundosFaturaveis } from '../lib/duracaoDeAudio'
import { hasEntitlement } from '../lib/entitlements'
import { erroDeRota } from '../lib/erroDeRota'
import { normalizarIdiomaDoWhisper } from '../lib/idiomaDoWhisper'
import { log } from '../lib/logger'
import { custoDeStt, portaoDaNuvem, registrarGastoDeIa, responderPortaoFechado } from '../lib/orcamentoDeIa'
import { responderErro } from '../lib/respostaDeErro'
import {
  ContadorIndisponivel,
  estornarSegundosDeStt,
  refundManagedCall,
  reservarSegundosDeStt,
  reserveManagedCall,
} from '../lib/usageQuota'
import { parseOr400, sttHeadersSchema } from '../validation'
import { deveRetentar, esperaDaRetentativa } from './disjuntor'
import { responderContadorIndisponivel } from './reservaDeNuvem'
import { assertPublicUrl } from './ssrf'
import { promptDoCabecalho, triarSegmentos } from './sttQualidade'
import {
  abrirRastro,
  codigoDeIdioma,
  nomeDoProvedor,
  type RastroDeIa,
  registrarLimiteDoProvedor,
  statusDaTentativa,
} from './telemetriaDeIa'

/**
 * Quantas tentativas EXTRAS o STT faz. Duas, e o porquê do número está no bloco que as usa: cada
 * tentativa carrega 30 s de timeout próprio, então o teto de espera é o que limita, não a
 * insistência.
 */
const RETENTATIVAS_DE_STT = 2

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
  try {
    const audioBuffer = req.body as Buffer | undefined
    if (!audioBuffer || !audioBuffer.length) {
      res.status(400).json({ error: 'corpo de áudio vazio' })
      return
    }

    // Duas formas de resolver a chave:
    //  (a) x-credential-id → credencial POR USUÁRIO (cifrada no DB) — modo BYO-key.
    //  (b) SEM credencial → chave do DONO no servidor (env GROQ_API_KEY). É o modo padrão
    //      "distribuível em escala": o usuário não precisa de chave nenhuma, o app só funciona.
    const credentialId = req.header('x-credential-id')
    let baseUrl: string | null
    let secret: string | null
    let defaultModel: string | null
    /** Ramo da chave do DONO: o cliente não escolhe o modelo nem a duração cobrada (P0-2/P0-3). */
    let pagoPeloApp = false

    if (credentialId) {
      rastro.anotar({ byok: true })
      ;({ baseUrl, secret, defaultModel } = await credentialsRepo.getSecret(req.userId, credentialId))
    } else {
      // SaaS Fatia 1b — STT de nuvem GERENCIADA (chave do DONO) exige o entitlement. BYOK (ramo `if`)
      // e o STT local (no navegador) passam livres: só o caminho que gasta a chave do serviço é gateado.
      if (!(await hasEntitlement(req.userId, 'managedCloudStt'))) {
        res.status(402).json({ error: 'STT de nuvem gerenciada requer um plano pago', entitlement: 'managedCloudStt' })
        return
      }
      // Chave de emergência e orçamento global do mês (orcamentoDeIa.ts), antes de qualquer cota.
      const portao = await portaoDaNuvem()
      if (!portao.ok) {
        responderPortaoFechado(res, portao)
        return
      }
      pagoPeloApp = true
      /* P0-2 (auditoria de prontidão, 25/09/2026): o áudio é MEDIDO antes de qualquer reserva. Antes,
         um corpo ilegível era cobrado como 10 s e seguia para o provedor, e a duração saía do
         `byteRate` que o próprio cliente escreve no cabeçalho — 13 min declarados como 1 s. Agora a
         taxa é derivada dos campos do `fmt `, o incoerente é 415 e o que passa do teto por requisição
         é 413. Recusar (em vez de cobrar pelo pior caso) não quebra o cliente legítimo: ele SEMPRE
         manda WAV PCM 16 bits mono (`src/gateway/audio/wav.ts`). Antes da reserva de propósito:
         recusa não toca contador, então não há o que estornar. */
      const avaliacao = avaliarAudioFaturavel(audioBuffer)
      if (avaliacao.ok === false) {
        responderErro(res, avaliacao.status, avaliacao.error, avaliacao.code)
        return
      }
      // Fair-use: RESERVA antes de chamar o provedor (P0-1 — conferir antes e contabilizar
      // depois deixava N requisições simultâneas passarem pelo mesmo teto). BYOK/local não
      // chegam aqui, então só o uso da chave do DONO consome quota.
      if (!(await reserveManagedCall(req.userId))) {
        res.status(402).json({ error: 'limite mensal do plano atingido', code: 'quota_exceeded' })
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
      if (!(await reservarSegundosDeStt(req.userId, segundosReservados))) {
        segundosReservados = 0
        res.status(402).json({ error: 'limite mensal de áudio do plano atingido', code: 'quota_exceeded' })
        return
      }
      secret = process.env.GROQ_API_KEY ?? process.env.STT_API_KEY ?? null
      baseUrl = process.env.GROQ_BASE_URL ?? process.env.STT_BASE_URL ?? 'https://api.groq.com/openai/v1'
      defaultModel = process.env.STT_MODEL ?? 'whisper-large-v3-turbo'
      if (!secret) {
        res.status(501).json({ error: 'STT de nuvem não configurado: defina GROQ_API_KEY no servidor (.env)' })
        return
      }
    }

    if (!baseUrl) {
      res.status(400).json({ error: 'credencial sem baseUrl' })
      return
    }
    if (!secret) {
      res.status(400).json({ error: 'credencial sem segredo' })
      return
    }
    await assertPublicUrl(baseUrl) // anti-SSRF

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

    /* P0-3 (auditoria de prontidão): na chave do DONO, `x-model` é IGNORADO. O schema acima só
       garante o FORMATO do nome — o cliente ainda escolhia qual modelo a conta do app pagava, e
       nada impedia trocar o turbo pelo modelo cheio (2,8× o preço por hora de áudio). Quem decide é
       o `STT_MODEL` do servidor. No BYOK a chave e a conta são do usuário: ele escolhe livremente. */
    const model = pagoPeloApp
      ? defaultModel || 'whisper-large-v3-turbo'
      : cabecalhos['x-model'] || defaultModel || 'whisper-large-v3-turbo'
    const lang = cabecalhos['x-language']
    /* O CONTEXTO DA FALA ANTERIOR, como `prompt` do Whisper. Sem ele cada enunciado de ~6 s é
       decodificado do zero: nome próprio muda de grafia de uma fala para a outra, e em áudio curto
       o idioma oscila. O cliente manda a última frase confirmada; `promptDoCabecalho` decodifica,
       limpa e corta — e ignora em silêncio o que não decodifica. */
    const prompt = promptDoCabecalho(req.header('x-stt-prompt'))
    const endpoint = baseUrl.replace(/\/+$/, '') + '/audio/transcriptions'

    /* PEDIMOS `verbose_json` PARA NÃO JOGAR FORA O IDIOMA.
       O Whisper identifica o idioma a partir do ÁUDIO, dentro do decode. Pedindo `json` recebíamos
       só o texto, e o cliente reconstruía o idioma passando esse texto por um detector de
       palavras-função — que não tem sinal em fala curta. Foi assim que uma sessão inteira em
       espanhol apareceu rotulada como inglês. `verbose_json` traz `language` no MESMO custo de API.

       FormData é de uso único (o corpo é consumido no envio), então cada tentativa monta a sua. */
    const montarForm = (formato: 'verbose_json' | 'json'): FormData => {
      const f = new FormData()
      f.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav')
      f.append('model', model)
      if (lang) f.append('language', lang)
      if (prompt) f.append('prompt', prompt)
      /* TEMPERATURA ZERO: decode guloso, o mesmo áudio dá o mesmo texto. Sem o campo, o provedor
         escolhe — e amostragem em transcrição só serve para variar a grafia da mesma fala. */
      f.append('temperature', '0')
      f.append('response_format', formato)
      return f
    }
    // Sem anotação de retorno: neste arquivo `Response` é o da Express (importado acima), não o
    // do fetch. Deixar o TypeScript inferir evita a colisão de nomes.
    const enviar = (formato: 'verbose_json' | 'json') =>
      fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + secret },
        body: montarForm(formato),
        signal: AbortSignal.timeout(30_000),
      })

    /**
     * UMA tentativa completa contra o provedor.
     *
     * Nem todo endpoint OpenAI-compatible implementa `verbose_json`. Quando ele RECUSA o formato
     * (4xx), repetimos em `json` — degrada para o comportamento antigo (sem idioma) em vez de
     * quebrar a transcrição de quem usa outro provedor. Erro 5xx não é sobre o formato: não repete.
     *
     * O 429 SAIU DESSA REGRA (Fase 5). Ele é 4xx e caía aqui, então um limite de taxa disparava um
     * reenvio IMEDIATO do mesmo áudio em outro formato — dois pedidos recusados em vez de um, no
     * exato momento em que o provedor está pedindo para diminuir o ritmo. Limite de taxa não é
     * desacordo sobre formato; quem cuida dele é a retentativa com espera, logo abaixo.
     */
    const umaTentativa = async () => {
      const r = await enviar('verbose_json')
      if (!r.ok && r.status >= 400 && r.status < 500 && r.status !== 429) return await enviar('json')
      return r
    }

    /**
     * RETENTATIVA COM ESPERA CRESCENTE — e só aqui, não na tradução (Fase 5).
     *
     * A diferença entre os dois proxies é que a tradução TEM cascata (`cascataDeNuvem`): um 429
     * do primário já cai na reserva, e insistir antes disso só somaria espera ao caminho em que
     * alguém aguarda legenda na tela. O STT não tem para onde cair — sem reserva configurada, um
     * 429 momentâneo do provedor simplesmente perdia a fala do usuário, e o áudio de um enunciado
     * não volta.
     *
     * DUAS tentativas extras, com 500 ms e 1.500 ms de espera. O teto é o custo: cada tentativa tem
     * 30 s de timeout próprio, e três delas no pior caso somam 92 s — muito além do que qualquer
     * cliente espera, mas o pior caso aqui exige 429/5xx nas três, que é indisponibilidade real.
     * `deveRetentar` explica por que o TIMEOUT ficou de fora (a requisição pode ter sido processada
     * e cobrada do outro lado).
     */
    /* O NOME DO PROVEDOR PARA A TELEMETRIA. No BYOK a URL é escolha do usuário: vai o rótulo fixo
       `byok`, nunca o host. O modelo do BYOK também vira `byok` no CONTADOR de 429 (Prometheus não
       aguenta uma série por nome que o usuário digitou); na geração do Langfuse ele vai como é. */
    const byok = Boolean(credentialId)
    const provedorTelemetria = byok ? 'byok' : nomeDoProvedor(baseUrl)
    rastro.anotar({ parDeIdiomas: codigoDeIdioma(lang) })

    /** Uma tentativa medida: a que falha vira geração aqui; a que dá certo, depois do texto. */
    let inicioDaTentativa = Date.now()
    const tentativaMedida = async () => {
      inicioDaTentativa = Date.now()
      try {
        const r = await umaTentativa()
        if (r.status === 429) registrarLimiteDoProvedor(provedorTelemetria, byok ? 'byok' : model)
        if (!r.ok)
          rastro.tentativa({
            inicio: inicioDaTentativa,
            fim: Date.now(),
            provedor: provedorTelemetria,
            modelo: model,
            status: statusDaTentativa(r.status),
            metadados: { statusHttp: r.status },
          })
        return r
      } catch (err) {
        rastro.tentativa({
          inicio: inicioDaTentativa,
          fim: Date.now(),
          provedor: provedorTelemetria,
          modelo: model,
          status: statusDaTentativa(0, String((err as Error)?.name ?? '') + String((err as Error)?.message ?? err)),
        })
        throw err
      }
    }

    const inicioDoProvedor = Date.now()
    let upstream = await tentativaMedida()
    for (let n = 1; n <= RETENTATIVAS_DE_STT && deveRetentar(upstream.status); n++) {
      const espera = esperaDaRetentativa(n)
      log('warn', {
        event: 'stt_retentativa',
        route: '/api/ai/stt',
        status: upstream.status,
        error: `tentativa ${n} de ${RETENTATIVAS_DE_STT} após ${espera} ms`,
        requestId: req.requestId,
      })
      await new Promise((r) => setTimeout(r, espera))
      upstream = await tentativaMedida()
    }

    if (!upstream.ok) {
      /* O CORPO DO TERCEIRO NÃO É PARA O CLIENTE (achado da Fase 4). Até aqui, 160 caracteres da
         resposta do provedor eram ecoados dentro de `error` — e o que o provedor escreve num erro
         não é contrato nosso: pode trazer nome de modelo interno, id de organização, host ou
         trecho do pedido. O cliente precisa saber que falhou e poder CITAR o `requestId`; o texto
         do upstream fica no log estruturado, que é onde alguém investiga. */
      const text = await upstream.text().catch(() => '')
      log('error', {
        event: 'stt_upstream_erro',
        route: '/api/ai/stt',
        status: upstream.status,
        error: text.slice(0, 300),
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

    const j = await upstream.json()
    const gerenciado = segundosReservados > 0
    // Consumada. Antes daqui havia um `recordManagedCall` incondicional, que contabilizava
    // TAMBÉM o caminho BYOK — uso da chave do próprio usuário descontava da quota gerenciada.
    reservaPendente = false
    /* Só o caminho da chave do DONO entra no orçamento global; BYOK é conta do próprio usuário. E
       aqui o número é o que o PROVEDOR fatura (`segundosFaturaveis`, com o mínimo de 10 s), não o
       que saiu da cota do assinante: o orçamento existe para bater com a fatura. */
    const custoUsd = gerenciado ? custoDeStt(model, segundosFaturaveis(audioBuffer)) : undefined
    if (custoUsd !== undefined) await registrarGastoDeIa(custoUsd)
    segundosReservados = 0 // consumados junto com a chamada: nada a estornar
    observarChamadaDeProvedor({
      provedor: gerenciado ? 'stt-gerenciado' : 'byok',
      funcao: 'stt',
      ms: Date.now() - inicioDoProvedor,
      custoUsd,
    })

    // `language` vazio = o provedor não informou (ou caímos no `json`): o cliente volta ao
    // detector de texto. Nunca inventamos um código aqui.
    const idioma = normalizarIdiomaDoWhisper(j.language)
    const limpeza = limparTranscricao(j, audioBuffer, lang || idioma, req.requestId)
    /* A GERAÇÃO QUE ENTREGOU. `filtrado-vazio` separa "o provedor não ouviu nada" de "o provedor
       inventou e o filtro cortou" — a segunda é custo pago por alucinação, e é o número que diz se o
       VAD do cliente está mandando silêncio demais. Os segundos REAIS são a duração do WAV; os
       FATURADOS têm o mínimo por requisição do provedor. */
    const segundosReais = duracaoDoWav(audioBuffer) ?? (typeof j.duration === 'number' ? j.duration : 0)
    rastro.anotar({
      parDeIdiomas: codigoDeIdioma(lang || idioma),
      segmentosDescartados: limpeza.descartados,
    })
    rastro.tentativa({
      inicio: inicioDaTentativa,
      fim: Date.now(),
      provedor: provedorTelemetria,
      modelo: model,
      status: limpeza.esvaziado ? 'filtrado-vazio' : 'ok',
      uso: {
        audio_seconds: Math.round(segundosReais * 100) / 100,
        audio_seconds_billed: segundosFaturaveis(audioBuffer),
      },
      custoUsd,
      metadados: {
        statusHttp: upstream.status,
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
    // As duas reservas caem juntas: cobrar segundos por uma transcrição que não aconteceu é o
    // mesmo defeito que cobrar a chamada.
    if (reservaPendente) await refundManagedCall(req.userId)
    if (segundosReservados > 0) await estornarSegundosDeStt(req.userId, segundosReservados)
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
  const duracao = duracaoDoWav(audio) ?? (typeof j.duration === 'number' ? j.duration : 0)
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
