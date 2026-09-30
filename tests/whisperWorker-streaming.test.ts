/**
 * O STREAMING DO DECODE NÃO VIRA UMA MENSAGEM POR TOKEN ("Grátis sem travar", A1).
 *
 * Cada `update` que o worker posta vira um `setSpeechSegments` e um render da tela da captura. O
 * decode solta dezenas de tokens por segundo; postar um a um afogava a thread principal justo no
 * aparelho que já está no limite. O limitador deixa sair ~8 por segundo (borda de ataque: a primeira
 * palavra na hora) e SEMPRE descarrega o texto inteiro antes do `result`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TOKENS = 200
/** Ritmo do decode falso: 200 tokens em 1 s. */
const PASSO_MS = 5

vi.mock('@huggingface/transformers', () => {
  class Tensor {}
  class TextStreamer {
    callback_function: (t: string) => void
    constructor(_t: unknown, o: { callback_function: (t: string) => void }) {
      this.callback_function = o.callback_function
    }
  }
  const pipeline = vi.fn(async () =>
    Object.assign(
      async (_pcm: Float32Array, opts: Record<string, any>) => {
        if (opts.max_new_tokens === 8) return { text: '' } // aquecimento
        let acc = ''
        for (let i = 0; i < TOKENS; i++) {
          await new Promise((r) => setTimeout(r, PASSO_MS))
          const t = ` palavra${i}`
          acc += t
          opts.streamer?.callback_function(t)
        }
        return { text: acc }
      },
      {
        tokenizer: {},
        model: { generation_config: { eos_token_id: 2, is_multilingual: true } },
      },
    ),
  )
  return { env: { backends: { onnx: { wasm: {} } } }, pipeline, TextStreamer, Tensor }
})
vi.mock('../src/gateway/modelManifest', () => ({ registrarModeloBaixado: vi.fn() }))
vi.mock('../src/gateway/adapters/transformersEnv', () => ({ configureModelDelivery: vi.fn() }))

let postadas: Record<string, unknown>[] = []
let onmessage: (e: MessageEvent) => Promise<void>

beforeEach(async () => {
  postadas = []
  const falsoSelf: Record<string, unknown> = {
    navigator: {},
    postMessage: (m: Record<string, unknown>) => postadas.push(m),
  }
  vi.stubGlobal('self', falsoSelf)
  vi.resetModules()
  await import('../src/gateway/adapters/whisperWorker')
  onmessage = falsoSelf.onmessage as typeof onmessage
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** 60 s de áudio: 200 palavras cabem folgadas no teto de palavras/s do filtro de alucinação. */
const pedir = (id: string, prioridade: 'final' | 'parcial' = 'final') =>
  onmessage({
    data: {
      type: 'transcribe',
      id,
      prioridade,
      pcm: new Float32Array(16000 * 60),
      language: 'pt',
      model: 'onnx-community/whisper-base',
    },
  } as MessageEvent)

describe('whisperWorker — streaming limitado', () => {
  it('200 tokens em 1 s viram ~10 `update` (não 200); o último é o texto do `result`', async () => {
    const pedido = pedir('f1')
    await vi.advanceTimersByTimeAsync(TOKENS * PASSO_MS + 100)
    await pedido
    const updates = postadas.filter((m) => m.type === 'update')
    const result = postadas.find((m) => m.type === 'result')
    expect(result?.text).toBe(Array.from({ length: TOKENS }, (_, i) => `palavra${i}`).join(' '))
    expect(updates.length).toBeGreaterThanOrEqual(7)
    expect(updates.length).toBeLessThanOrEqual(12)
    // A primeira palavra sai na hora (borda de ataque), não 120 ms depois.
    expect(updates[0].text).toBe('palavra0')
    // Descarregado ANTES do result: a última mensagem de texto antes dele é o texto inteiro.
    const idxResult = postadas.indexOf(result!)
    expect(postadas[idxResult - 1]).toEqual({ type: 'update', id: 'f1', text: result!.text })
  })

  it('o texto só cresce entre um `update` e o seguinte (nada repetido, nada fora de ordem)', async () => {
    const pedido = pedir('f2')
    await vi.advanceTimersByTimeAsync(TOKENS * PASSO_MS + 100)
    await pedido
    const textos = postadas.filter((m) => m.type === 'update').map((m) => String(m.text))
    for (let i = 1; i < textos.length; i++) {
      expect(textos[i].startsWith(textos[i - 1])).toBe(true)
      expect(textos[i].length).toBeGreaterThan(textos[i - 1].length)
    }
  })
})
