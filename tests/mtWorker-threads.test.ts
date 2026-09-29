/**
 * O TRADUTOR TAMBÉM OBEDECE AO ORÇAMENTO DE THREADS (plano "Grátis sem travar", A3).
 *
 * O `mtWorker` nunca escolheu threads: ficava o padrão do ONNX Runtime, `min(4, ⌈núcleos/2⌉)` com
 * isolamento — 4 num desktop de 8 núcleos, somadas às 4 do Whisper. Agora o adapter manda a parte do
 * tradutor (`distribuirThreads().mt`) e o worker a aplica na PRIMEIRA mensagem que a traz: depois da
 * primeira sessão o ORT já abriu o pool, e mudar o número não teria efeito.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const wasm = vi.hoisted(() => ({}) as Record<string, unknown>)

vi.mock('@huggingface/transformers', () => {
  class Tensor {}
  const pipeline = vi.fn(async () =>
    Object.assign(async (texto: string) => [{ translation_text: `<${texto}>` }], {
      tokenizer: {},
      model: { generation_config: { eos_token_id: 0 } },
    }),
  )
  return { env: { backends: { onnx: { wasm } } }, pipeline, Tensor }
})
vi.mock('../src/gateway/modelManifest', () => ({ registrarModeloBaixado: vi.fn() }))
vi.mock('../src/gateway/adapters/transformersEnv', () => ({ configureModelDelivery: vi.fn() }))

let onmessage: (e: MessageEvent) => Promise<void>

beforeEach(async () => {
  for (const k of Object.keys(wasm)) delete wasm[k]
  const falsoSelf: Record<string, unknown> = { postMessage: vi.fn() }
  vi.stubGlobal('self', falsoSelf)
  vi.resetModules()
  await import('../src/gateway/adapters/mtWorker')
  onmessage = falsoSelf.onmessage as typeof onmessage
})

const enviar = (data: Record<string, unknown>) => onmessage({ data } as MessageEvent)

describe('mtWorker: threads do orçamento', () => {
  it('o preload traz as threads e o worker as aplica', async () => {
    await enviar({ type: 'preload', src: 'es', tgt: 'en', threads: 2 })
    expect(wasm.numThreads).toBe(2)
  })

  it('a tradução também traz (quando é a primeira mensagem)', async () => {
    await enviar({ type: 'translate', id: 't', text: 'hola', src: 'es', tgt: 'en', threads: 1 })
    expect(wasm.numThreads).toBe(1)
  })

  it('só a PRIMEIRA vale: depois da primeira sessão o pool do ORT já existe', async () => {
    await enviar({ type: 'preload', src: 'es', tgt: 'en', threads: 2 })
    await enviar({ type: 'preload', src: 'en', tgt: 'es', threads: 4 })
    expect(wasm.numThreads).toBe(2)
  })

  it('valor inválido não mexe em nada (fica o padrão do runtime)', async () => {
    await enviar({ type: 'preload', src: 'es', tgt: 'en', threads: 0 })
    expect(wasm.numThreads).toBeUndefined()
  })
})
