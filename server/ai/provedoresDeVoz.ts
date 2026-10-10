/**
 * OS PROVEDORES DA VOZ NATURAL (E4 da Fase E) — quem sabe falar com cada modelo de TTS do modo
 * intérprete, e o que NUNCA vai no pedido.
 *
 * QUEM ATENDE vem do registro (`registroDeProvedores.ts`, função `tts`, na ordem da cascata); COMO
 * chamar cada modelo, deste catálogo. Um modelo declarado que o catálogo não conhece recebe o pedido
 * mínimo do formato (texto e modelo), sem voz nem idioma — nunca um campo inventado.
 *
 * O PADRÃO: Chatterbox Multilingual (Resemble AI, MIT) na DeepInfra, pelo endpoint compatível com a
 * OpenAI (`POST <base>/audio/speech`, a MESMA base `…/v1/openai` do LLM): 23 idiomas com o português,
 * US$ 1,00 por 1M de caracteres (deepinfra.com, 30/09/2026 — ~US$ 0,05 por hora de voz), retenção
 * zero declarada pela DeepInfra. As OPÇÕES declaráveis: Qwen3-TTS na DeepInfra (US$ 20/1M, 10 idiomas,
 * vozes prontas) e Chirp 3 HD no Google Cloud Text-to-Speech (US$ 30/1M, formato `google-tts` — não é a
 * API do Gemini, que o app nunca usa).
 *
 * A CONFERIR PELA SONDA DE CONTRATO (`scripts/eval-fala/bancada/sondar-contratos.mjs`) ANTES DE LIGAR A
 * FLAG, porque a página da DeepInfra não publica o esquema do `/audio/speech` por modelo: o nome do
 * campo do idioma do Chatterbox (`extra_body.language`, o "Language" da página do modelo) e o tipo da
 * resposta (bytes crus, ou JSON com o áudio em base64 — `lerAudioDaVoz` aceita os dois).
 *
 * SEM CLONAGEM DE VOZ, POR CONSTRUÇÃO. Os três modelos aceitam uma amostra de áudio para imitar uma voz
 * (`audio_prompt`, `voice_id` de uma voz criada, `reference_audio`…). Nada disso passa: o corpo de cada
 * formato é montado só com as chaves de `CHAVES_PERMITIDAS`, conferido antes do envio
 * (`conferirSemClonagem`), a voz é um NOME da lista fechada de vozes prontas do modelo (o Chatterbox não
 * tem: vai sem campo de voz nenhum), e a rota recusa o pedido que traga um campo de clonagem
 * (`ttsProxy.ts`). O teste `sem clonagem` cobre as três camadas.
 */
import { comTempoLimite } from './cancelamento'
import { pernasDaFuncao, type Provedor } from './registroDeProvedores'
import { despachanteSeguro, type InitSeguro } from './ssrf'

/** O teto de UMA tentativa ao provedor: a fila de fala do cliente espera até 6 s e cai na voz do aparelho. */
export const TIMEOUT_DA_VOZ_MS = 12_000
/** O maior áudio aceito de volta: 600 caracteres em MP3 dão ~40 s (~650 KB); 4 MB é folga, não convite. */
export const TETO_DE_BYTES_DA_VOZ = 4 * 1024 * 1024

/**
 * Os NOMES de campo que carregam áudio de referência ou uma voz criada a partir dele — a clonagem. O
 * corpo que sai daqui nunca os tem (há uma lista de permitidas), e a rota recusa o pedido que os traga.
 */
export const CAMPOS_DE_CLONAGEM: readonly string[] = [
  'audio',
  'audio_prompt',
  'audio_prompt_path',
  'audioPrompt',
  'clone',
  'prompt_audio',
  'ref_audio',
  'ref_text',
  'reference',
  'reference_audio',
  'referenceAudio',
  'speaker',
  'speaker_wav',
  'voice_clone',
  'voice_id',
  'voiceId',
  'voice_sample',
]

export interface ModeloDeVoz {
  /** Idiomas (ISO-639-1) que o modelo fala. */
  idiomas: readonly string[]
  /** Vozes PRONTAS do modelo (nomes do provedor), a primeira é a padrão. Vazia = sem campo de voz. */
  vozes: readonly string[]
  /** Como o idioma vai no pedido: no `extra_body.language`, em nada (o modelo detecta) ou no do Google. */
  idiomaNoPedido: 'extra_body' | 'automatico' | 'google'
  /** O modelo aceita a velocidade (`speed`/`speakingRate`). */
  velocidade: boolean
  /** Opção declarável, não o padrão. */
  opcao?: true
}

/**
 * O CATÁLOGO. Os idiomas são os das páginas dos modelos (30/09/2026); as vozes do Chirp 3 HD são
 * algumas das prontas do Google (o nome final é `<idioma>-Chirp3-HD-<voz>`).
 */
export const MODELOS_DE_VOZ: Readonly<Record<string, ModeloDeVoz>> = {
  'ResembleAI/chatterbox-multilingual': {
    idiomas: [
      'ar',
      'da',
      'de',
      'el',
      'en',
      'es',
      'fi',
      'fr',
      'he',
      'hi',
      'it',
      'ja',
      'ko',
      'ms',
      'nl',
      'no',
      'pl',
      'pt',
      'ru',
      'sv',
      'sw',
      'tr',
      'zh',
    ],
    vozes: [],
    idiomaNoPedido: 'extra_body',
    velocidade: false,
  },
  'Qwen/Qwen3-TTS': {
    idiomas: ['en', 'zh', 'ja', 'ko', 'de', 'fr', 'ru', 'es', 'it', 'pt'],
    vozes: ['Vivian', 'Serena', 'Uncle_Fu', 'Dylan', 'Eric', 'Ryan', 'Aiden', 'Ono_Anna', 'Sohee'],
    idiomaNoPedido: 'automatico',
    velocidade: true,
    opcao: true,
  },
  'chirp3-hd': {
    idiomas: [
      'ar',
      'de',
      'en',
      'es',
      'fr',
      'hi',
      'id',
      'it',
      'ja',
      'ko',
      'nl',
      'pl',
      'pt',
      'ru',
      'th',
      'tr',
      'vi',
      'zh',
    ],
    vozes: ['Kore', 'Charon', 'Aoede', 'Puck', 'Leda', 'Orus'],
    idiomaNoPedido: 'google',
    velocidade: true,
    opcao: true,
  },
}

/** O modelo da voz natural que o `.env.production.example` e o `docs/LANCAMENTO.md` sugerem. */
export const MODELO_DE_VOZ_PADRAO = 'ResembleAI/chatterbox-multilingual'

/** O que a rota pede a uma perna: o texto, o idioma (base e BCP-47), a voz pronta e a velocidade. */
export interface PedidoDeVoz {
  texto: string
  /** ISO-639-1 (`pt`). */
  idioma: string
  /** BCP-47 (`pt-BR`) — o do Google. */
  bcp47: string
  voz?: string
  velocidade?: number
}

/**
 * A região padrão de cada idioma quando o pedido traz só a base — o `languageCode` do Google (o
 * mandarim é `cmn-CN`; o árabe, `ar-XA`). O Chatterbox e o Qwen3 usam só a base.
 */
const REGIAO_PADRAO_DA_VOZ: Readonly<Record<string, string>> = {
  ar: 'ar-XA',
  de: 'de-DE',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  hi: 'hi-IN',
  id: 'id-ID',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  nl: 'nl-NL',
  pl: 'pl-PL',
  pt: 'pt-BR',
  ru: 'ru-RU',
  th: 'th-TH',
  tr: 'tr-TR',
  vi: 'vi-VN',
  zh: 'cmn-CN',
}

/** `pt-PT` fica `pt-PT`; `pt` vira `pt-BR`. */
export function bcp47DaVoz(idioma: string): string {
  if (idioma.includes('-')) return idioma
  return REGIAO_PADRAO_DA_VOZ[idioma] ?? idioma
}

/** A voz pronta que vai no pedido: a pedida, se é da lista do modelo; senão a padrão dele (ou nenhuma). */
export function vozDoModelo(modelo: string, pedida?: string): string | undefined {
  const vozes = MODELOS_DE_VOZ[modelo]?.vozes ?? []
  if (pedida && vozes.includes(pedida)) return pedida
  return vozes[0]
}

/** A perna fala este idioma? Modelo fora do catálogo: o registro é quem responde por ele. */
export function falaOIdioma(perna: Pick<Provedor, 'model'>, idioma: string): boolean {
  const m = MODELOS_DE_VOZ[perna.model]
  return !m || m.idiomas.includes(idioma)
}

/** As pernas da voz natural com a chave no ambiente (o registro já exclui o Gemini). */
export function pernasDeVoz(env: NodeJS.ProcessEnv = process.env): Provedor[] {
  return pernasDaFuncao('tts', {}, env).filter((p) => Boolean(p.apiKey))
}

/** As chaves que cada formato manda — e SÓ elas (ver `conferirSemClonagem`). `true` = valor; objeto = aninhado. */
type Forma = { [chave: string]: true | Forma }
export const CHAVES_PERMITIDAS: Readonly<Record<'openai' | 'google-tts', Forma>> = {
  openai: { model: true, input: true, response_format: true, voice: true, speed: true, extra_body: { language: true } },
  'google-tts': {
    input: { text: true },
    voice: { languageCode: true, name: true },
    audioConfig: { audioEncoding: true, speakingRate: true },
  },
}

/**
 * A GARANTIA DE QUE NENHUM ÁUDIO DE REFERÊNCIA SAI: toda chave do corpo está na forma permitida do
 * formato, e nenhuma é um campo de clonagem. Lança — um corpo fora disso é defeito nosso, e o pedido
 * não sai.
 */
export function conferirSemClonagem(corpo: unknown, forma: Forma, caminho = ''): void {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return
  for (const [chave, valor] of Object.entries(corpo as Record<string, unknown>)) {
    const aqui = caminho ? `${caminho}.${chave}` : chave
    if (CAMPOS_DE_CLONAGEM.includes(chave)) throw new Error(`campo de clonagem de voz no pedido: ${aqui}`)
    const permitida = forma[chave]
    if (!permitida) throw new Error(`campo fora do pedido da voz: ${aqui}`)
    if (permitida !== true) conferirSemClonagem(valor, permitida, aqui)
  }
}

/** O endpoint da perna, ou `null` quando o formato não é de voz. */
export function endpointDaVoz(p: Pick<Provedor, 'base' | 'formato'>): string | null {
  const base = p.base.replace(/\/+$/, '')
  const formato = p.formato ?? 'openai'
  if (formato === 'openai') return `${base}/audio/speech`
  if (formato === 'google-tts') return `${base}/text:synthesize`
  return null
}

/** O corpo do pedido, só com o que o formato e o modelo aceitam. */
export function corpoDoPedidoDeVoz(perna: Pick<Provedor, 'model' | 'formato'>, pedido: PedidoDeVoz): unknown {
  const m = MODELOS_DE_VOZ[perna.model]
  const voz = vozDoModelo(perna.model, pedido.voz)
  const velocidade = m?.velocidade && pedido.velocidade && pedido.velocidade !== 1 ? pedido.velocidade : undefined
  if ((perna.formato ?? 'openai') === 'google-tts') {
    return {
      input: { text: pedido.texto },
      voice: {
        languageCode: pedido.bcp47,
        ...(voz ? { name: `${pedido.bcp47}-Chirp3-HD-${voz}` } : {}),
      },
      audioConfig: { audioEncoding: 'MP3', ...(velocidade ? { speakingRate: velocidade } : {}) },
    }
  }
  return {
    model: perna.model,
    input: pedido.texto,
    response_format: 'mp3',
    ...(voz ? { voice: voz } : {}),
    ...(velocidade ? { speed: velocidade } : {}),
    ...(m?.idiomaNoPedido === 'extra_body' ? { extra_body: { language: pedido.idioma } } : {}),
  }
}

/**
 * O PEDIDO DE UMA TENTATIVA: corpo conferido (sem clonagem), timeout desta tentativa, `redirect:
 * 'manual'` e o `despachanteSeguro` (IP conferido na CONEXÃO), como o STT. A chave vai no cabeçalho —
 * `Bearer` no formato OpenAI, `X-Goog-Api-Key` no Google — e nunca na URL.
 */
export function montarPedidoDeVoz(
  perna: Provedor,
  pedido: PedidoDeVoz,
  /** Quem pediu desistiu (`cancelamento.ts`): aborta a tentativa junto com o relógio dela. */
  sinal?: AbortSignal,
): { url: string; init: InitSeguro } {
  const url = endpointDaVoz(perna)
  if (!url) throw new Error(`perna de voz sem endpoint conhecido (${perna.formato ?? 'openai'})`)
  const formato = perna.formato === 'google-tts' ? 'google-tts' : 'openai'
  const corpo = corpoDoPedidoDeVoz(perna, pedido)
  conferirSemClonagem(corpo, CHAVES_PERMITIDAS[formato])
  const autorizacao: Record<string, string> =
    formato === 'google-tts'
      ? { 'X-Goog-Api-Key': perna.apiKey ?? '' }
      : { Authorization: 'Bearer ' + (perna.apiKey ?? '') }
  return {
    url,
    init: {
      method: 'POST',
      headers: { ...autorizacao, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: comTempoLimite(TIMEOUT_DA_VOZ_MS, sinal),
      redirect: 'manual',
      dispatcher: despachanteSeguro,
    } as InitSeguro,
  }
}

/** O áudio que voltou: bytes e tipo, ou `null` quando a resposta não é áudio utilizável. */
export interface AudioDaVoz {
  bytes: Buffer
  tipo: string
}

/** `data:audio/mpeg;base64,…` ou base64 cru → bytes. */
function deBase64(v: string): Buffer | null {
  const cru = v.startsWith('data:') ? v.slice(v.indexOf(',') + 1) : v
  if (!/^[A-Za-z0-9+/=\s]+$/.test(cru)) return null
  const b = Buffer.from(cru, 'base64')
  return b.length ? b : null
}

const tipoDoDataUrl = (v: string): string | null => /^data:(audio\/[a-z0-9.+-]+)[;,]/i.exec(v)?.[1] ?? null

/**
 * Lê a resposta 2xx da perna. OpenAI: os bytes crus (`audio/*`); se vier JSON com `audio` em base64 (a
 * rota nativa da DeepInfra embrulha assim), também serve. Google: `audioContent` em base64 (MP3). Acima
 * de `TETO_DE_BYTES_DA_VOZ`, ou sem áudio, `null`.
 */
export async function lerAudioDaVoz(perna: Pick<Provedor, 'formato'>, r: Response): Promise<AudioDaVoz | null> {
  const tipo = (r.headers?.get?.('content-type') ?? '').split(';')[0].trim().toLowerCase()
  let audio: AudioDaVoz | null = null
  if (perna.formato !== 'google-tts' && (tipo.startsWith('audio/') || tipo === 'application/octet-stream')) {
    const bytes = Buffer.from(await r.arrayBuffer())
    audio = bytes.length ? { bytes, tipo: tipo.startsWith('audio/') ? tipo : 'audio/mpeg' } : null
  } else {
    const json = (await r.json().catch(() => null)) as { audio?: unknown; audioContent?: unknown } | null
    const campo = perna.formato === 'google-tts' ? json?.audioContent : json?.audio
    if (typeof campo === 'string') {
      const bytes = deBase64(campo)
      audio = bytes ? { bytes, tipo: tipoDoDataUrl(campo) ?? 'audio/mpeg' } : null
    }
  }
  if (!audio || audio.bytes.length > TETO_DE_BYTES_DA_VOZ) return null
  return audio
}
