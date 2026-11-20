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
 *
 * PELO OPENROUTER (change `voz-natural-openrouter`, 17/11/2026): o Kokoro 82M (o padrão, o mais barato) e o MAI-Voice
 * 2.1 Flash (a voz `boa`, desligada por padrão) pelo MESMO `POST <base>/audio/speech`, com a chave `OPENROUTER_API_KEY`
 * que o app já usa. Todo pedido a uma base do OpenRouter leva `provider: { zdr: true, data_collection: "deny" }` (o
 * `order`/`only`/`ignore` não valem para a voz lá, docs "Text-to-Speech", 17/11/2026), e só os modelos com endpoint de
 * retenção zero CONFERIDO (`VOZES_COM_RETENCAO_ZERO_NO_OPENROUTER`) viram perna. Nos dois a voz escolhe o idioma: a
 * voz sai de `vozesPorIdioma`, e uma voz pedida de outro idioma cai na do idioma da fala.
 */
import type { NivelDeVoz } from '../../src/core/planos'
import { comTempoLimite } from './cancelamento'
import { ehBaseDoOpenRouter, VOZES_COM_RETENCAO_ZERO_NO_OPENROUTER } from './parametrosDoProvedor'
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
  /* O OpenRouter: um a três áudios de referência para imitar a voz (docs "Voice Cloning"). */
  'input_references',
]

export interface ModeloDeVoz {
  /** Idiomas (ISO-639-1) que o modelo fala. */
  idiomas: readonly string[]
  /** Vozes PRONTAS do modelo (nomes do provedor), a primeira é a padrão. Vazia = sem campo de voz. */
  vozes: readonly string[]
  /**
   * Como o idioma vai no pedido: no `extra_body.language`, em nada (o modelo detecta), no do Google, ou pela VOZ
   * (Kokoro e MAI-Voice: cada voz é de um idioma, `vozesPorIdioma`).
   */
  idiomaNoPedido: 'extra_body' | 'automatico' | 'google' | 'voz'
  /**
   * As vozes PRONTAS de cada idioma (chave: o BCP-47 `pt-BR` ou a base `pt`), a primeira é a padrão. Quando existe,
   * manda sobre `vozes`: a voz pedida só vale se é do idioma da fala.
   */
  vozesPorIdioma?: Readonly<Record<string, readonly string[]>>
  /** O id da voz é `<região>-<voz><sufixo>` (MAI-Voice: `pt-BR-Luana:MAI-Voice-2.1-Flash`). */
  sufixoDaVoz?: string
  /** A voz `boa` (planos v3): só os planos com `nivelDeVoz: 'boa'` a usam. Ausente = a `basica`. */
  nivel?: 'boa'
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
  /* KOKORO 82M (Apache-2.0) pelo OpenRouter, o PADRÃO da voz paga (17/11/2026): US$ 0,62/1M na DeepInfra e US$ 4/1M
     na Together, os dois com retenção zero (`/api/v1/endpoints/zdr`). As vozes são as de `supported_voices` do
     `/api/v1/models?output_modalities=speech`; a letra inicial diz o idioma (p = pt-BR, a = en-US, e = es…). Sem
     velocidade: o OpenRouter não garante o `speed` fora da OpenAI (um provedor pode responder 400). */
  'hexgrad/kokoro-82m': {
    idiomas: ['en', 'es', 'fr', 'hi', 'it', 'ja', 'pt', 'zh'],
    vozes: [],
    vozesPorIdioma: {
      pt: ['pf_dora', 'pm_alex'],
      'en-GB': ['bf_emma', 'bm_george'],
      en: ['af_heart', 'am_michael'],
      es: ['ef_dora', 'em_alex'],
      fr: ['ff_siwis'],
      hi: ['hf_alpha', 'hm_omega'],
      it: ['if_sara', 'im_nicola'],
      ja: ['jf_alpha', 'jm_kumo'],
      zh: ['zf_xiaoxiao', 'zm_yunxi'],
    },
    idiomaNoPedido: 'voz',
    velocidade: false,
  },
  /* MAI-VOICE 2.1 FLASH (Microsoft, na Azure) pelo OpenRouter, a voz BOA: US$ 15/1M, retenção zero. DESLIGADA por
     padrão (não está nos `ops/ia-provedores*.json`): no pior caso deixa a margem do plano de nível boa negativa
     (`openspec/changes/voz-natural-openrouter/design.md`). O id da voz é `<região>-<voz>:MAI-Voice-2.1-Flash`, e a
     região da voz é o idioma da síntese. As nativas primeiro; Grant e Harper são as multilíngues. */
  'microsoft/mai-voice-2.1-flash': {
    idiomas: [
      'cs',
      'da',
      'de',
      'en',
      'es',
      'fi',
      'fr',
      'hi',
      'hu',
      'id',
      'it',
      'ko',
      'nb',
      'nl',
      'pl',
      'pt',
      'ro',
      'ru',
      'sv',
      'th',
      'tr',
      'vi',
      'zh',
    ],
    vozes: [],
    vozesPorIdioma: {
      'pt-BR': ['Luana', 'Pedro', 'Caio', 'Rafael', 'Grant', 'Harper'],
      'pt-PT': ['Rui', 'Grant', 'Harper'],
      'en-US': ['Harper', 'Ethan', 'Olivia', 'Jasper', 'Iris', 'Sage', 'Grant'],
      'en-GB': ['Emily', 'Harry'],
      'en-AU': ['Isla'],
      'en-IN': ['Priya', 'Dhruv'],
      'es-ES': ['Marta'],
      'es-MX': ['Valeria', 'Alejo', 'Grant', 'Harper'],
      'cs-CZ': ['Grant', 'Harper'],
      'da-DK': ['Grant', 'Harper'],
      'de-DE': ['Mia', 'Klaus', 'Grant', 'Harper'],
      'fi-FI': ['Grant', 'Harper'],
      'fr-FR': ['Soleil', 'Marc', 'Grant', 'Harper'],
      'hi-IN': ['Kavya', 'Arjun', 'Priya', 'Dhruv', 'Grant', 'Harper'],
      'hu-HU': ['Lilla', 'Bence', 'Reka', 'Levente', 'Grant', 'Harper'],
      'id-ID': ['Grant', 'Harper'],
      'it-IT': ['Rosa', 'Luca', 'Grant', 'Harper'],
      'ko-KR': ['Haena', 'Junho', 'Grant', 'Harper'],
      'nb-NO': ['Grant', 'Harper'],
      'nl-NL': ['Sander', 'Grant', 'Harper'],
      'pl-PL': ['Grant', 'Harper'],
      'ro-RO': ['Elena', 'Andrei', 'Ioana', 'Radu', 'Grant', 'Harper'],
      'ru-RU': ['Masha', 'Lev', 'Grant', 'Harper'],
      'sv-SE': ['Grant', 'Harper'],
      'th-TH': ['Krit', 'Nattapong', 'Grant', 'Harper'],
      'tr-TR': ['Elif', 'Aydin', 'Grant', 'Harper'],
      'vi-VN': ['Grant', 'Harper'],
      'zh-CN': ['Lan', 'Mei', 'Bo', 'Wei', 'Grant', 'Harper'],
    },
    sufixoDaVoz: ':MAI-Voice-2.1-Flash',
    idiomaNoPedido: 'voz',
    velocidade: false,
    nivel: 'boa',
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

/**
 * As vozes do idioma no catálogo por idioma: o BCP-47 exato (`pt-PT`), a base (`pt`) ou a primeira região da língua
 * (`zh` → `zh-CN`, quando o pedido veio `cmn-CN`). Devolve a chave achada: no MAI ela é a região do id da voz.
 */
function vozesDoIdioma(
  porIdioma: Readonly<Record<string, readonly string[]>>,
  idioma: string,
  bcp47: string,
): { chave: string; vozes: readonly string[] } | null {
  const base = idioma.split('-')[0].toLowerCase()
  const chave =
    [bcp47, base].find((c) => Object.hasOwn(porIdioma, c)) ??
    Object.keys(porIdioma).find((c) => c.toLowerCase().startsWith(`${base}-`))
  return chave ? { chave, vozes: porIdioma[chave] } : null
}

/**
 * A voz pronta que vai no pedido: a pedida, se é da lista do modelo (do IDIOMA da fala, quando o modelo tem vozes por
 * idioma); senão a padrão dele (ou nenhuma). No MAI-Voice, o id inteiro (`pt-BR-Luana:MAI-Voice-2.1-Flash`).
 */
export function vozDoModelo(modelo: string, pedida?: string, idioma = '', bcp47 = idioma): string | undefined {
  const m = MODELOS_DE_VOZ[modelo]
  if (m?.vozesPorIdioma) {
    const achadas = vozesDoIdioma(m.vozesPorIdioma, idioma, bcp47)
    if (!achadas) return undefined
    const voz = pedida && achadas.vozes.includes(pedida) ? pedida : achadas.vozes[0]
    return m.sufixoDaVoz ? `${achadas.chave}-${voz}${m.sufixoDaVoz}` : voz
  }
  const vozes = m?.vozes ?? []
  if (pedida && vozes.includes(pedida)) return pedida
  return vozes[0]
}

/** A perna fala este idioma? Modelo fora do catálogo: o registro é quem responde por ele. */
export function falaOIdioma(perna: Pick<Provedor, 'model'>, idioma: string): boolean {
  const m = MODELOS_DE_VOZ[perna.model]
  return !m || m.idiomas.includes(idioma)
}

/**
 * A voz do OpenRouter só com RETENÇÃO ZERO CONFERIDA: o modelo tem de estar na lista de quem tem endpoint ZDR
 * (`VOZES_COM_RETENCAO_ZERO_NO_OPENROUTER`). O `zdr: true` do pedido já faz o OpenRouter recusar o que não tem; a
 * lista recusa antes, aqui, e o registro recusa na validação.
 */
export const vozComRetencaoZero = (p: Pick<Provedor, 'base' | 'model'>): boolean =>
  !ehBaseDoOpenRouter(p.base) || VOZES_COM_RETENCAO_ZERO_NO_OPENROUTER.has(p.model)

/** As pernas da voz natural com a chave no ambiente (o registro já exclui o Gemini). */
export function pernasDeVoz(env: NodeJS.ProcessEnv = process.env): Provedor[] {
  return pernasDaFuncao('tts', {}, env).filter((p) => Boolean(p.apiKey) && vozComRetencaoZero(p))
}

/**
 * As pernas que o NÍVEL DE VOZ do plano pode usar, na ordem do registro: a voz `boa` (MAI-Voice) só para quem tem o
 * nível `boa`; a `basica` para os dois; o `aparelho` não chega à nuvem.
 */
export function pernasDoNivelDeVoz<P extends Pick<Provedor, 'model'>>(pernas: P[], nivel: NivelDeVoz): P[] {
  if (nivel === 'aparelho') return []
  return pernas.filter((p) => MODELOS_DE_VOZ[p.model]?.nivel !== 'boa' || nivel === 'boa')
}

/** As chaves que cada formato manda — e SÓ elas (ver `conferirSemClonagem`). `true` = valor; objeto = aninhado. */
type Forma = { [chave: string]: true | Forma }
export const CHAVES_PERMITIDAS: Readonly<Record<'openai' | 'google-tts', Forma>> = {
  openai: {
    model: true,
    input: true,
    response_format: true,
    voice: true,
    speed: true,
    extra_body: { language: true },
    /* Só no OpenRouter: a política de dados, e nada de `options` (é por ele que entra parâmetro de provedor). */
    provider: { zdr: true, data_collection: true },
  },
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

/** A política de dados de TODO pedido de voz ao OpenRouter: só endpoint de retenção zero, sem coleta. */
export const PROVIDER_DA_VOZ_NO_OPENROUTER = { zdr: true, data_collection: 'deny' } as const

/** O corpo do pedido, só com o que o formato e o modelo aceitam. */
export function corpoDoPedidoDeVoz(
  perna: Pick<Provedor, 'model' | 'formato'> & { base?: string },
  pedido: PedidoDeVoz,
): unknown {
  const m = MODELOS_DE_VOZ[perna.model]
  const voz = vozDoModelo(perna.model, pedido.voz, pedido.idioma, pedido.bcp47)
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
    ...(perna.base && ehBaseDoOpenRouter(perna.base) ? { provider: { ...PROVIDER_DA_VOZ_NO_OPENROUTER } } : {}),
  }
}

/**
 * RETENÇÃO ZERO OU NADA: o pedido a uma base do OpenRouter sem `provider.zdr: true` e `data_collection: "deny"` não
 * sai (lança: é defeito nosso), nem o de um modelo fora da lista conferida.
 */
function conferirRetencaoZero(perna: Pick<Provedor, 'base' | 'model'>, corpo: unknown): void {
  if (!ehBaseDoOpenRouter(perna.base)) return
  if (!vozComRetencaoZero(perna)) throw new Error(`voz do OpenRouter sem retenção zero conferida: ${perna.model}`)
  const provider = (corpo as { provider?: { zdr?: unknown; data_collection?: unknown } }).provider
  if (provider?.zdr !== true || provider.data_collection !== 'deny')
    throw new Error('pedido de voz ao OpenRouter sem provider.zdr: true')
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
  conferirRetencaoZero(perna, corpo)
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
