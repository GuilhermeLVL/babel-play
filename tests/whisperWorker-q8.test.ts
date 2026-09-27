/**
 * WHISPER EM q8 NO ORT-WEB PRECISA DE OTIMIZAÇÃO DE GRAFO `basic`.
 *
 * Medido na captura do Quest emulado (edição estática, WASM, 2026-09-26): a sessão do Whisper base q8
 * NÃO ABRE com o nível padrão — "Can't create a session … qdq_actions.cc:137
 * TransposeDQWeightsForMatMulNBits Missing required scale", a mesma fusão que quebrava o moonshine
 * (`SESSAO_MOONSHINE`). A bancada rodou no onnxruntime-node, onde a fusão não quebra; no navegador,
 * sem isto, a rota q8 do celular/Quest seria captura sem legenda.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cargas: Array<{ modelo: string; opcoes: Record<string, unknown> }> = []

vi.mock('@huggingface/transformers', () => {
  const pipeline = vi.fn(async (_tarefa: string, modelo: string, opcoes: Record<string, unknown>) => {
    cargas.push({ modelo, opcoes })
    return Object.assign(async () => ({ text: '' }), { tokenizer: {}, model: { generation_config: {} } })
  })
  return { env: { backends: { onnx: { wasm: {} } } }, pipeline, TextStreamer: class {}, Tensor: class {} }
})
vi.mock('../src/gateway/modelManifest', () => ({ registrarModeloBaixado: vi.fn() }))
vi.mock('../src/gateway/adapters/transformersEnv', () => ({ configureModelDelivery: vi.fn() }))

let onmessage: (e: MessageEvent) => Promise<void>
let postadas: Record<string, unknown>[] = []

beforeEach(async () => {
  cargas.length = 0
  postadas = []
  const falsoSelf: Record<string, unknown> = { navigator: {}, postMessage: (m: Record<string, unknown>) => postadas.push(m) }
  vi.stubGlobal('self', falsoSelf)
  vi.resetModules()
  await import('../src/gateway/adapters/whisperWorker')
  onmessage = falsoSelf.onmessage as typeof onmessage
})

const carregar = (dtype: string) =>
  onmessage({ data: { type: 'load', model: 'onnx-community/whisper-base', dtype, device: 'wasm' } } as MessageEvent)

describe('whisperWorker: sessão do q8', () => {
  it('dtype q8 carrega com graphOptimizationLevel basic', async () => {
    await carregar('q8')
    expect(cargas[0].opcoes).toMatchObject({ dtype: 'q8', session_options: { graphOptimizationLevel: 'basic' } })
    expect(postadas.some((m) => m.type === 'ready')).toBe(true)
  })

  it('o híbrido continua com a otimização padrão (sem session_options)', async () => {
    await carregar('hybrid')
    expect(cargas[0].opcoes.session_options).toBeUndefined()
  })
})
