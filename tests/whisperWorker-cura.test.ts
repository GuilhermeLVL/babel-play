/**
 * A CURA NO WORKER (DISP-01, change `modelos-confiaveis-e-offline`, 2.3): com o cache envenenado, a primeira
 * sessão não abre ("protobuf parsing failed"); o worker apaga as entradas do modelo no Cache Storage e carrega
 * de novo, uma vez. Se falhar de novo, o erro sai marcado `[falha:modelo-corrompido]` (o adaptador rebaixa).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const estado = vi.hoisted(() => ({ falhasAntesDeAbrir: 0, cargas: 0 }))

vi.mock('@huggingface/transformers', () => {
  const pipeline = vi.fn(async () => {
    estado.cargas += 1
    if (estado.cargas <= estado.falhasAntesDeAbrir)
      throw new Error(
        "Can't create a session. ERROR_CODE: 7, ERROR_MESSAGE: Failed to load model because protobuf parsing failed.",
      )
    return Object.assign(async () => ({ text: '' }), { tokenizer: {}, model: { generation_config: {} } })
  })
  return { env: { backends: { onnx: { wasm: {} } } }, pipeline, TextStreamer: class {}, Tensor: class {} }
})
vi.mock('../src/gateway/modelManifest', () => ({ registrarModeloBaixado: vi.fn() }))
vi.mock('../src/gateway/adapters/transformersEnv', () => ({ configureModelDelivery: vi.fn() }))

const MODELO = 'onnx-community/moonshine-tiny-ONNX'
let onmessage: (e: MessageEvent) => Promise<void>
let postadas: Record<string, unknown>[] = []
let chaves: string[] = []

beforeEach(async () => {
  estado.cargas = 0
  postadas = []
  chaves = [
    `https://huggingface.co/${MODELO}/resolve/main/onnx/encoder_model_quantized.onnx`,
    `https://huggingface.co/${MODELO}/resolve/main/config.json`,
    'https://huggingface.co/onnx-community/whisper-tiny/resolve/main/config.json',
  ]
  const cache = {
    keys: async () => chaves.map((url) => ({ url })),
    delete: async (r: { url: string }) => {
      const antes = chaves.length
      chaves = chaves.filter((c) => c !== r.url)
      return chaves.length < antes
    },
  }
  vi.stubGlobal('caches', { open: async () => cache })
  const falsoSelf: Record<string, unknown> = {
    navigator: {},
    postMessage: (m: Record<string, unknown>) => postadas.push(m),
  }
  vi.stubGlobal('self', falsoSelf)
  vi.resetModules()
  await import('../src/gateway/adapters/whisperWorker')
  onmessage = falsoSelf.onmessage as typeof onmessage
})

const carregar = () => onmessage({ data: { type: 'load', model: MODELO, dtype: 'q8', device: 'wasm' } } as MessageEvent)

describe('whisperWorker com o cache envenenado', () => {
  it('apaga as entradas do modelo, carrega de novo e fica pronto', async () => {
    estado.falhasAntesDeAbrir = 1
    await carregar()
    expect(estado.cargas).toBe(2)
    expect(chaves).toEqual(['https://huggingface.co/onnx-community/whisper-tiny/resolve/main/config.json'])
    expect(postadas.some((m) => m.type === 'ready')).toBe(true)
  })

  it('falha persistente: erro marcado modelo-corrompido, sem laço', async () => {
    estado.falhasAntesDeAbrir = 99
    await carregar()
    expect(estado.cargas).toBe(2)
    const erro = postadas.find((m) => m.type === 'error')
    expect(String(erro?.message)).toMatch(/^\[falha:modelo-corrompido\] onnx-community\/moonshine-tiny-ONNX/)
  })
})
