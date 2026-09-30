/**
 * A CASCATA DO STT — as pernas de transcrição pelo CUSTO EFETIVO do pedido (B6 da Fase B, 29/09/2026).
 *
 * O QUE HAVIA. Uma perna só: o `sttGerenciado`, a primeira do registro no formato OpenAI. Um 429 ou
 * uma queda do provedor mandava TODA fala para o aparelho (o LLM já tinha reserva desde a Fase 2), e
 * a Cloudflare — declarada no registro desde o B1 — ficava de fora, porque o Workers AI transcreve
 * pela rota nativa com o áudio em base64, e o proxy só sabia o multipart da OpenAI.
 *
 * A ORDEM É O CUSTO DESTE PEDIDO, NÃO A DO REGISTRO. O mínimo faturado muda tudo em clipe curto: a
 * Groq cobra 10 s por pedido (US$ 0,04/h), então uma fala de 3 s custa US$ 0,000111 lá e US$ 0,00005
 * num provedor de US$ 0,06/h que cobra por segundo — o "mais caro" por hora é o mais barato para ela.
 * Num clipe de 30 s o mínimo não pesa e o preço por hora volta a mandar. `ordenarPorCustoEfetivo`
 * faz a conta com o preço e o mínimo DE CADA perna (`custoDeStt`, `minimoFaturadoDoStt`); empate
 * fica com a ordem do registro.
 *
 * OS DOIS FORMATOS (`montarPedidoDeStt`):
 *   - `openai`: o multipart de sempre em `/audio/transcriptions` (`file`, `model`, `language`,
 *     `prompt`, `temperature: 0`, `response_format: verbose_json` — com o recuo para `json` quando o
 *     provedor recusa o formato);
 *   - `cloudflare`: `POST …/ai/run/<modelo>` com `{ audio: <base64>, task, language, initial_prompt }`.
 *     O schema de `@cf/openai/whisper-large-v3-turbo` foi conferido na documentação do Workers AI em
 *     30/09/2026 (developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo): `audio` aceita a
 *     string base64 (ou `{ body, contentType }`); a resposta vem em `{ result }`, com `text`,
 *     `transcription_info.{language,duration}` e `segments` com `avg_logprob`, `no_speech_prob` e
 *     `compression_ratio` — os mesmos sinais que a triagem do `verbose_json` usa (`sttQualidade.ts`).
 *     Não há `temperature` nesse schema. US$ 0,000513 por minuto de áudio (a mesma página).
 *
 * A FALHA DE UMA PERNA PASSA PARA A PRÓXIMA: 429 (fecha o balde dela até o `Retry-After`), 5xx,
 * timeout e rede — e, como no LLM, também o 4xx (chave revogada, modelo aposentado): é quando a
 * reserva salva a legenda. A RETENTATIVA do 5xx (ADR 0007: uma, com espera curta, só com saldo no
 * balde) fica para a ÚLTIMA perna: havendo outra, ela atende na hora — e com uma perna só (o legado,
 * o BYOK) o comportamento é exatamente o de antes.
 *
 * O DISJUNTOR É POR PERNA (`chaveDoProvedor`: base + modelo), como no LLM, e só na chave do DONO:
 * 5xx e rede contam; 4xx (inclusive 429) não — a regra do STT de sempre.
 *
 * A ADMISSÃO. A porta (antes de ler o corpo) admite a primeira perna, na ordem do registro, com
 * saldo — o áudio ainda não foi medido, e sem saber a duração não há ordem de custo. Depois, cada
 * perna da ordem de custo é admitida no balde DELA na hora de ser chamada; a da porta usa o pedido
 * que já tem, e se não chegar a ser chamada (outra, mais barata, atendeu) o pedido volta ao balde.
 */
import { contarAdmissaoRecusada } from '../http/metricas'
import { arquivoDoAudio } from '../lib/duracaoDeAudio'
import { log } from '../lib/logger'
import { custoDeStt } from '../lib/orcamentoDeIa'
import {
  admitirNoBalde,
  ocuparVaga,
  type PlanoDeAdmissao,
  type Recusa,
  registrarLimiteNaAdmissao,
  segundosDoRetryAfter,
  type TicketDeBalde,
} from './admissao'
import { alvoDaPerna } from './cascata'
import { chaveDoProvedor, disjuntorPermite, esperaDaRetentativa, registrarFalha, registrarSucesso } from './disjuntor'
import type { Provedor } from './provedores'
import { endpointDaTranscricao, pernasDaFuncao } from './registroDeProvedores'
import { assertPublicUrl, despachanteSeguro, type InitSeguro } from './ssrf'
import { nomeDoProvedor, type RastroDeIa, registrarLimiteDoProvedor, statusDaTentativa } from './telemetriaDeIa'

/** O teto de UMA tentativa ao provedor — o de sempre do STT. */
export const TIMEOUT_DO_STT_MS = 30_000

/**
 * Quantas tentativas EXTRAS a ÚLTIMA perna faz — UMA, e só em 5xx (ADR 0007). O 429 não repete: ele
 * fecha o balde até o `Retry-After`. Timeout também não: pode ter sido processado — e cobrado.
 */
export const RETENTATIVAS_DE_STT = 1

/** As pernas de STT que o proxy sabe chamar: com a chave no ambiente e um endpoint conhecido. */
export function pernasDoStt(env: NodeJS.ProcessEnv = process.env): Provedor[] {
  return pernasDaFuncao('stt', {}, env).filter((p) => Boolean(p.apiKey) && endpointDaTranscricao(p) !== null)
}

/**
 * O custo DESTE pedido nesta perna, em US$: a duração arredondada para cima (ninguém fatura fração a
 * nosso favor) elevada ao mínimo faturado da perna, pelo preço dela. É a mesma conta do orçamento
 * (`custoDeStt`), e por isso um mínimo não declarado vale os 10 s — o erro para mais.
 */
export function custoEfetivoDaPerna(p: Provedor, segundos: number): number {
  const s = Number.isFinite(segundos) && segundos > 0 ? Math.ceil(segundos) : 0
  return custoDeStt(p.model, s, { fornecedor: p.fornecedor, preco: p.preco })
}

/** As pernas da mais barata para a mais cara PARA ESTE ÁUDIO; empate fica com a ordem do registro. */
export function ordenarPorCustoEfetivo(pernas: Provedor[], segundos: number): Provedor[] {
  return pernas
    .map((perna, i) => ({ perna, i, custo: custoEfetivoDaPerna(perna, segundos) }))
    .sort((a, b) => a.custo - b.custo || a.i - b.i)
    .map((x) => x.perna)
}

/* ─────────────────────────── o pedido e a resposta ─────────────────────────── */

export type FormatoDaResposta = 'verbose_json' | 'json'

export interface OpcoesDoPedidoDeStt {
  idioma?: string
  prompt?: string | null
  /** Só no formato `openai`: `verbose_json` traz idioma e segmentos; `json` é o recuo. */
  formato: FormatoDaResposta
}

/**
 * O PEDIDO DE UMA TENTATIVA. Um por tentativa: `FormData` é de uso único e o `AbortSignal.timeout`
 * conta a partir daqui. `redirect: 'manual'` e o `despachanteSeguro` (IP conferido na CONEXÃO, contra
 * DNS rebinding) valem para os dois formatos — auditoria de segurança de 26/09/2026.
 */
export function montarPedidoDeStt(
  perna: Provedor,
  audio: Buffer,
  o: OpcoesDoPedidoDeStt,
): { url: string; init: InitSeguro } {
  const url = endpointDaTranscricao(perna)
  if (!url) throw new Error(`perna de STT sem endpoint conhecido (${perna.formato ?? 'openai'})`)
  const autorizacao = { Authorization: 'Bearer ' + (perna.apiKey ?? '') }
  const comum = {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_DO_STT_MS),
    redirect: 'manual' as const,
    dispatcher: despachanteSeguro,
  }
  if (perna.formato === 'cloudflare') {
    const corpo = {
      audio: audio.toString('base64'),
      task: 'transcribe',
      ...(o.idioma ? { language: o.idioma } : {}),
      ...(o.prompt ? { initial_prompt: o.prompt } : {}),
    }
    return {
      url,
      init: { ...comum, headers: { ...autorizacao, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) },
    } as { url: string; init: InitSeguro }
  }
  /* O tipo do arquivo sai dos magic bytes: Ogg Opus vai como `audio.ogg`, o resto como `audio.wav`. */
  const arquivo = arquivoDoAudio(audio)
  const f = new FormData()
  f.append('file', new Blob([audio], { type: arquivo.tipo }), arquivo.nome)
  f.append('model', perna.model)
  if (o.idioma) f.append('language', o.idioma)
  if (o.prompt) f.append('prompt', o.prompt)
  /* TEMPERATURA ZERO: decode guloso, o mesmo áudio dá o mesmo texto. */
  f.append('temperature', '0')
  f.append('response_format', o.formato)
  return { url, init: { ...comum, headers: autorizacao, body: f } } as { url: string; init: InitSeguro }
}

/** A resposta de STT na forma do `verbose_json` da OpenAI — o que o resto do proxy já sabe ler. */
export interface RespostaDeStt {
  text?: unknown
  language?: unknown
  duration?: unknown
  segments?: unknown
}

/** Normaliza: a Cloudflare embrulha em `{ result }` e põe idioma e duração em `transcription_info`. */
export function lerRespostaDeStt(formato: Provedor['formato'], json: unknown): RespostaDeStt {
  if (formato === 'cloudflare') {
    const bruto = (json ?? {}) as { result?: Record<string, unknown> }
    const r = (bruto.result ?? bruto) as {
      text?: unknown
      segments?: unknown
      transcription_info?: { language?: unknown; duration?: unknown }
    }
    return {
      text: r.text,
      language: r.transcription_info?.language,
      duration: r.transcription_info?.duration,
      segments: r.segments,
    }
  }
  return (json ?? {}) as RespostaDeStt
}

/* ─────────────────────────── a admissão ─────────────────────────── */

/** A admissão da porta: a vaga em voo do usuário e o pedido no balde de UMA perna. */
export interface AdmissaoDoStt {
  plano: PlanoDeAdmissao
  /** A perna cujo balde já tem o pedido. */
  perna: Provedor
  ticket: TicketDeBalde
  liberar: () => void
  /** A perna da porta chegou a ser chamada? Se não, o pedido volta ao balde no encerramento. */
  chamada: boolean
  encerrada: boolean
}

/**
 * VAGA EM VOO + a primeira perna (na ordem do registro) com saldo. Perna sem saldo é pulada, como no
 * LLM (`admitirCascata`); a recusa conta UMA vez, com a menor espera entre as pernas.
 */
export function admitirStt(
  pernas: Provedor[],
  p: { userId: string; plano: PlanoDeAdmissao },
): { ok: true; admissao: AdmissaoDoStt } | { ok: false; recusa: Recusa } {
  const liberar = ocuparVaga(p.userId, 'stt')
  if (!liberar) {
    contarAdmissaoRecusada('em_voo', p.plano)
    return { ok: false, recusa: { motivo: 'em_voo', retryAfterS: 1 } }
  }
  let recusa: Recusa | null = null
  for (const perna of pernas) {
    const r = admitirNoBalde({ tipo: 'stt', ...alvoDaPerna(perna), plano: p.plano, silenciosa: true })
    if (r.ok === true) {
      return {
        ok: true,
        admissao: { plano: p.plano, perna, ticket: r.ticket, liberar, chamada: false, encerrada: false },
      }
    }
    if (!recusa || r.recusa.retryAfterS < recusa.retryAfterS) recusa = r.recusa
  }
  liberar()
  const final = recusa ?? { motivo: 'minuto' as const, retryAfterS: 1 }
  contarAdmissaoRecusada(final.motivo, p.plano)
  return { ok: false, recusa: final }
}

/** Solta a vaga e, se a perna da porta não foi chamada, devolve o pedido ao balde. Idempotente. */
export function encerrarAdmissaoDoStt(a: AdmissaoDoStt | null | undefined): void {
  if (!a || a.encerrada) return
  a.encerrada = true
  if (!a.chamada) a.ticket.devolver()
  a.liberar()
}

/* ─────────────────────────── percorrer ─────────────────────────── */

export interface PedidoDeStt {
  audio: Buffer
  idioma?: string
  prompt?: string | null
}

export interface ContextoDaCascataDeStt {
  requestId?: string
  rastro: RastroDeIa
  /** BYOK: a chave e o endereço são do usuário — sem disjuntor, sem admissão, rótulo `byok`. */
  byok: boolean
  /** A admissão da porta (chave do DONO). */
  admissao?: AdmissaoDoStt
}

/** Por que a cascata não entregou — o proxy traduz cada uma na resposta de sempre. */
export type FalhaDoStt =
  /** Toda perna chamada respondeu 429: 429 `nuvem_ocupada` com a menor espera. */
  | { tipo: 'limitado'; retryAfterS: number }
  /** Nenhuma perna chamada, por disjuntor aberto: 503 `provedor_em_disjuntor`. */
  | { tipo: 'disjuntor' }
  /** Nenhuma perna chamada, por falta de saldo nos baldes: 429 `nuvem_ocupada`. */
  | { tipo: 'sem_saldo'; recusa: Recusa }
  /** A última falha foi HTTP: 502 `provedor_indisponivel`, com o corpo do terceiro só no log. */
  | { tipo: 'http'; status: number; texto: string }
  /** A última falha foi exceção (rede, timeout, destino bloqueado, JSON ilegível): o proxy relança. */
  | { tipo: 'excecao'; erro: unknown }

export type ResultadoDaCascataDeStt =
  | {
      ok: true
      perna: Provedor
      resposta: RespostaDeStt
      status: number
      /** Início da PRIMEIRA tentativa na perna que respondeu (a latência dela inclui a retentativa). */
      inicioDaPerna: number
      /** Início da tentativa que respondeu — o da geração no Langfuse. */
      inicioDaTentativa: number
    }
  | { ok: false; falha: FalhaDoStt }

/** O resultado de uma tentativa: a resposta, ou a exceção (nunca lança). */
type Tentativa = { r: Response; erro?: undefined; inicio: number } | { r?: undefined; erro: unknown; inicio: number }

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Percorre as pernas NA ORDEM DADA (quem chama já ordenou pelo custo). Nunca lança: a exceção da
 * última perna volta como falha `excecao`, e o proxy decide (relança para o 502 de sempre).
 */
export async function percorrerCascataDeStt(
  pernas: Provedor[],
  pedido: PedidoDeStt,
  ctx: ContextoDaCascataDeStt,
): Promise<ResultadoDaCascataDeStt> {
  const adm = ctx.admissao
  let chamadas = 0
  let limitadas = 0
  let menorEspera = Infinity
  let ultima: FalhaDoStt | null = null
  let pulouPorDisjuntor = false
  let semSaldo: Recusa | null = null

  for (let k = 0; k < pernas.length; k++) {
    const perna = pernas[k]
    const ultimaPerna = k === pernas.length - 1
    const provedor = ctx.byok ? 'byok' : nomeDoProvedor(perna.base)

    /* A ADMISSÃO DA PERNA: a da porta já tem o pedido; as outras pedem ao balde DELAS agora —
       sem saldo, pula sem abrir socket. */
    let ticket: TicketDeBalde | null = null
    if (adm && perna !== adm.perna) {
      const r = admitirNoBalde({ tipo: 'stt', ...alvoDaPerna(perna), plano: adm.plano })
      if (r.ok === false) {
        if (!semSaldo || r.recusa.retryAfterS < semSaldo.retryAfterS) semSaldo = r.recusa
        continue
      }
      ticket = r.ticket
    }

    /* O DISJUNTOR ANTES DA CHAMADA, só na chave do DONO: aberto, a perna é pulada sem socket. */
    const chave = ctx.byok ? null : chaveDoProvedor(perna)
    if (chave && !disjuntorPermite(chave)) {
      ticket?.devolver()
      pulouPorDisjuntor = true
      log('warn', {
        event: 'stt_provedor_em_disjuntor',
        route: '/api/ai/stt',
        provider: perna.rotulo,
        requestId: ctx.requestId,
      })
      continue
    }

    /* ANTI-SSRF POR PERNA — no BYOK é o endereço que o usuário cadastrou; na chave do DONO, o do
       registro. O IP é conferido de novo na CONEXÃO (`despachanteSeguro`, contra DNS rebinding). */
    try {
      await assertPublicUrl(perna.base)
    } catch (erro) {
      ticket?.devolver()
      ultima = { tipo: 'excecao', erro }
      continue
    }

    if (adm && perna === adm.perna) adm.chamada = true
    chamadas += 1
    const inicioDaPerna = Date.now()
    let t = await tentativaComDisjuntor(perna, pedido, ctx, provedor, chave)
    /* 5xx repete UMA vez, com espera curta, só na ÚLTIMA perna (havendo outra, ela atende na hora),
       e só com saldo no balde para o repique — a retentativa também é um pedido contra a conta. */
    for (let n = 1; ultimaPerna && n <= RETENTATIVAS_DE_STT && t.r && t.r.status >= 500 && t.r.status < 600; n++) {
      if (adm) {
        const repique = admitirNoBalde({ tipo: 'stt', ...alvoDaPerna(perna), plano: adm.plano })
        if (repique.ok === false) break
      }
      if (chave && !disjuntorPermite(chave)) break
      const espera = esperaDaRetentativa(n)
      log('warn', {
        event: 'stt_retentativa',
        route: '/api/ai/stt',
        status: t.r.status,
        error: `tentativa ${n} de ${RETENTATIVAS_DE_STT} após ${espera} ms`,
        requestId: ctx.requestId,
      })
      await esperar(espera)
      t = await tentativaComDisjuntor(perna, pedido, ctx, provedor, chave)
    }

    if (t.erro !== undefined || !t.r) {
      ultima = { tipo: 'excecao', erro: t.erro }
      if (!ultimaPerna) logFalhaDaPerna(perna, 0, String((t.erro as Error)?.message ?? t.erro), ctx.requestId)
      continue
    }
    const r = t.r
    if (r.ok) {
      let json: unknown
      try {
        json = await r.json()
      } catch (erro) {
        ultima = { tipo: 'excecao', erro }
        continue
      }
      return {
        ok: true,
        perna,
        resposta: lerRespostaDeStt(perna.formato, json),
        status: r.status,
        inicioDaPerna,
        inicioDaTentativa: t.inicio,
      }
    }
    if (r.status === 429) {
      /* O 429 fecha o balde da perna até o `Retry-After` dela: a próxima fala nem tenta. */
      const doProvedor = segundosDoRetryAfter(r.headers?.get?.('retry-after'))
      const espera = ctx.byok
        ? (doProvedor ?? 1)
        : registrarLimiteNaAdmissao('stt', provedor, perna.model, doProvedor, Date.now(), alvoDaPerna(perna))
      await r.text().catch(() => '')
      limitadas += 1
      menorEspera = Math.min(menorEspera, espera)
      ultima = { tipo: 'http', status: 429, texto: '' }
      continue
    }
    const texto = await r.text().catch(() => '')
    ultima = { tipo: 'http', status: r.status, texto }
    if (!ultimaPerna) logFalhaDaPerna(perna, r.status, texto, ctx.requestId)
  }

  if (chamadas === 0) {
    if (ultima?.tipo === 'excecao') return { ok: false, falha: ultima }
    /* Disjuntor aberto em alguma perna diz mais que o balde vazio de outra: o provedor está fora. */
    if (semSaldo && !pulouPorDisjuntor) return { ok: false, falha: { tipo: 'sem_saldo', recusa: semSaldo } }
    return { ok: false, falha: { tipo: 'disjuntor' } }
  }
  if (limitadas === chamadas) return { ok: false, falha: { tipo: 'limitado', retryAfterS: menorEspera } }
  /* Com perna chamada, `ultima` sempre existe (quem não entrega deixa a falha): o `??` é só o tipo. */
  return { ok: false, falha: ultima ?? { tipo: 'disjuntor' } }
}

/** A perna que falhou e não era a última: o log diz qual, com o corpo do terceiro cortado. */
function logFalhaDaPerna(perna: Provedor, status: number, texto: string, requestId?: string): void {
  log('warn', {
    event: 'stt_provedor_falhou',
    route: '/api/ai/stt',
    provider: perna.rotulo,
    status,
    error: texto.slice(0, 120),
    requestId,
  })
}

/**
 * UMA tentativa completa contra a perna, MEDIDA (a que falha vira geração aqui; a que dá certo, no
 * proxy, depois do texto) e alimentando o disjuntor (5xx e rede contam; 4xx, inclusive 429, não).
 * No formato `openai`, quando o provedor RECUSA o `verbose_json` (4xx que não é 429), repete em
 * `json` — degrada para o comportamento antigo (sem idioma) em vez de quebrar quem usa outro
 * provedor. O 429 fica fora: limite de taxa não é desacordo sobre formato.
 */
async function tentativaComDisjuntor(
  perna: Provedor,
  pedido: PedidoDeStt,
  ctx: ContextoDaCascataDeStt,
  provedor: string,
  chave: string | null,
): Promise<Tentativa> {
  const inicio = Date.now()
  const enviar = (formato: FormatoDaResposta) => {
    const p = montarPedidoDeStt(perna, pedido.audio, { idioma: pedido.idioma, prompt: pedido.prompt, formato })
    return fetch(p.url, p.init)
  }
  try {
    let r = await enviar('verbose_json')
    if (perna.formato !== 'cloudflare' && !r.ok && r.status >= 400 && r.status < 500 && r.status !== 429)
      r = await enviar('json')
    if (r.status === 429) registrarLimiteDoProvedor(provedor, ctx.byok ? 'byok' : perna.model)
    if (!r.ok) {
      ctx.rastro.tentativa({
        inicio,
        fim: Date.now(),
        provedor,
        modelo: perna.model,
        status: statusDaTentativa(r.status),
        metadados: { statusHttp: r.status },
      })
    }
    if (chave) {
      if (r.ok) registrarSucesso(chave)
      else if (r.status >= 500) registrarFalha(chave, r.status)
    }
    return { r, inicio }
  } catch (erro) {
    ctx.rastro.tentativa({
      inicio,
      fim: Date.now(),
      provedor,
      modelo: perna.model,
      status: statusDaTentativa(0, String((erro as Error)?.name ?? '') + String((erro as Error)?.message ?? erro)),
    })
    if (chave) registrarFalha(chave, 0)
    return { erro: erro ?? new Error('falha sem causa'), inicio }
  }
}
