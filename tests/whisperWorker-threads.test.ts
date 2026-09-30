/**
 * QUEM DECIDE AS THREADS DO WHISPER É O ORÇAMENTO, NÃO O WORKER (plano "Grátis sem travar", A3).
 *
 * O worker punha `min(núcleos, 4)` no topo do arquivo, sem saber do tradutor nem da thread principal.
 * Agora ele não escolhe nada: a mensagem `load` traz a parte do Whisper no orçamento global
 * (`orcamentoDeThreads.ts`), e o teto de 4 continua como rede de segurança.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const wasm = vi.hoisted(() => ({}) as Record<string, unknown>)

vi.mock('@huggingface/transformers', () => {
  const pipeline = vi.fn(async () =>
    Object.assign(async () => ({ text: '' }), { tokenizer: {}, model: { generation_config: {} } }),
  )
  return { env: { backends: { onnx: { wasm } } }, pipeline, TextStreamer: class {}, Tensor: class {} }
})
vi.mock('../src/gateway/modelManifest', () => ({ registrarModeloBaixado: vi.fn() }))
vi.mock('../src/gateway/adapters/transformersEnv', () => ({ configureModelDelivery: vi.fn() }))

let onmessage: (e: MessageEvent) => Promise<void>

beforeEach(async () => {
  for (const k of Object.keys(wasm)) delete wasm[k]
  const falsoSelf: Record<string, unknown> = { navigator: { hardwareConcurrency: 16 }, postMessage: vi.fn() }
  vi.stubGlobal('self', falsoSelf)
  vi.resetModules()
  await import('../src/gateway/adapters/whisperWorker')
  onmessage = falsoSelf.onmessage as typeof onmessage
})

const carregar = (threads?: number) =>
  onmessage({
    data: { type: 'load', model: 'onnx-community/whisper-base', dtype: 'hybrid', device: 'wasm', threads },
  } as MessageEvent)

describe('whisperWorker: threads', () => {
  it('ao abrir, o worker não escolhe threads (16 núcleos NÃO viram 4); o SIMD fica ligado', () => {
    expect(wasm.numThreads).toBeUndefined()
    expect(wasm.simd).toBe(true)
  })

  it('a mensagem load decide', async () => {
    await carregar(3)
    expect(wasm.numThreads).toBe(3)
  })

  it('o teto de 4 continua como rede de segurança', async () => {
    await carregar(8)
    expect(wasm.numThreads).toBe(4)
  })
})
