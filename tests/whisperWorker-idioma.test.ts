/**
 * "DETECTAR" NO WHISPER LOCAL — o bug relatado na edição estática: vídeo todo em português, idioma
 * de origem em "Detectar", e a legenda saía PRIMEIRO em inglês (depois vinha a tradução para o
 * português).
 *
 * Causa raiz: com "Detectar" o pipeline manda o trecho SEM `language`, e o transformers.js
 * (4.2.0, `models/whisper/modeling_whisper.js` → `_retrieve_init_tokens`) não detecta idioma: loga
 * "No language specified - defaulting to English (en)" e força `<|en|>`. Whisper multilíngue com
 * `<|en|>` sobre áudio em português TRADUZ para inglês. Reproduzido em Node com FLEURS pt:
 * "Alguns cruzeiros mostram Berlim…" → "Some cross-shops show Berlin…".
 *
 * A regra testada aqui: sem dica, o worker DETECTA o idioma pelo áudio (um passo do decoder a partir
 * de `<|startoftranscript|>`, como o `detect_language` do Whisper original) e transcreve NESSE
 * idioma — nunca decodifica um modelo multilíngue sem `language`, nunca com `task: 'translate'`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const LANG_TO_ID = { '<|en|>': 1, '<|pt|>': 2, '<|es|>': 3 }
let logitsDoIdioma = new Float32Array([0, 0, 0, 0])
const decodes: Record<string, unknown>[] = []
const passosDeDeteccao: unknown[] = []

vi.mock('@huggingface/transformers', () => {
  class Tensor {
    constructor(
      public type: string,
      public data: unknown,
      public dims: number[],
    ) {}
  }
  class TextStreamer {
    constructor(_t: unknown, _o: unknown) {}
  }
  const pipeline = vi.fn(async () => {
    const asr = Object.assign(
      async (_pcm: Float32Array, opts: Record<string, unknown>) => {
        decodes.push(opts)
        return {
          text:
            opts.language === 'pt' ? 'Alguns cruzeiros mostram Berlim nos panfletos.' : 'Some cross-shops show Berlin.',
        }
      },
      {
        tokenizer: {},
        processor: async () => ({ input_features: 'mel' }),
        model: Object.assign(
          async (entrada: unknown) => {
            passosDeDeteccao.push(entrada)
            return { logits: { data: logitsDoIdioma, dims: [1, 1, 4] } }
          },
          {
            generation_config: { is_multilingual: true, decoder_start_token_id: 50258, lang_to_id: LANG_TO_ID },
          },
        ),
      },
    )
    return asr
  })
  return { env: { backends: { onnx: { wasm: {} } } }, pipeline, TextStreamer, Tensor }
})
vi.mock('../src/gateway/modelManifest', () => ({ registrarModeloBaixado: vi.fn() }))
vi.mock('../src/gateway/adapters/transformersEnv', () => ({ configureModelDelivery: vi.fn() }))

let postadas: Record<string, unknown>[] = []
let onmessage: (e: MessageEvent) => Promise<void>

beforeEach(async () => {
  postadas = []
  decodes.length = 0
  passosDeDeteccao.length = 0
  const falsoSelf: Record<string, unknown> = {
    navigator: {},
    postMessage: (m: Record<string, unknown>) => postadas.push(m),
  }
  vi.stubGlobal('self', falsoSelf)
  vi.resetModules()
  await import('../src/gateway/adapters/whisperWorker')
  onmessage = falsoSelf.onmessage as typeof onmessage
})
afterEach(() => vi.unstubAllGlobals())

const transcrever = async (language?: string) => {
  await onmessage({
    data: {
      type: 'transcribe',
      id: 'x',
      pcm: new Float32Array(16000 * 4),
      language,
      model: 'onnx-community/whisper-base',
    },
  } as MessageEvent)
  const decodesReais = decodes.filter((d) => d.max_new_tokens !== 8) // tira o warmup
  return { decode: decodesReais.at(-1)!, resultado: postadas.find((m) => m.type === 'result') }
}

describe('whisperWorker sem dica de idioma ("Detectar")', () => {
  it('áudio em português: detecta pt e transcreve EM PORTUGUÊS (nunca decodifica sem language)', async () => {
    logitsDoIdioma = new Float32Array([0, 0.5, 6, 1]) // pt domina entre os tokens de idioma
    const { decode, resultado } = await transcrever(undefined)
    expect(passosDeDeteccao).toHaveLength(1)
    expect(decode.language).toBe('pt')
    expect(decode.task).toBe('transcribe')
    expect(resultado?.text).toMatch(/cruzeiros/)
    // O idioma MEDIDO volta ao chamador, com a confiança da detecção.
    expect(resultado?.language).toBe('pt')
    expect(resultado?.confiancaDoIdioma as number).toBeGreaterThan(0.9)
  })

  it('áudio em espanhol: transcreve em espanhol', async () => {
    logitsDoIdioma = new Float32Array([0, 1, 1, 7])
    const { decode, resultado } = await transcrever('')
    expect(decode.language).toBe('es')
    expect(resultado?.language).toBe('es')
  })

  it('com dica: obedece a dica, não gasta o passo de detecção e não ecoa a dica como medição', async () => {
    const { decode, resultado } = await transcrever('pt')
    expect(passosDeDeteccao).toHaveLength(0)
    expect(decode.language).toBe('pt')
    expect(decode.task).toBe('transcribe')
    expect(resultado?.language).toBeUndefined()
  })

  it('nunca pede tradução ao Whisper', async () => {
    logitsDoIdioma = new Float32Array([0, 9, 0, 0])
    await transcrever(undefined)
    await transcrever('en')
    for (const d of decodes) expect(d.task ?? 'transcribe').toBe('transcribe')
  })
})
