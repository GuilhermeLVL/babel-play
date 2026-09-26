/**
 * O WORKER DE STT É UMA FILA, NÃO UM `onmessage` ASSÍNCRONO (auditoria de latência 2026-09-26).
 *
 * Antes, o final começava a decodificar enquanto o parcial da mesma fala ainda rodava, e os dois
 * `generate` se intercalavam token a token (final esperando 0,92 s p50 no small). Agora: um decode
 * por vez, o final para o parcial em voo (processador de logits que força o EOS) e vai na frente.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface Chamada {
  pcm: Float32Array
  opts: Record<string, any>
  liberar: () => void
}
const chamadas: Chamada[] = []

vi.mock('@huggingface/transformers', () => {
  class Tensor {}
  class TextStreamer {
    constructor(_t: unknown, _o: unknown) {}
  }
  const pipeline = vi.fn(async () =>
    Object.assign(
      async (pcm: Float32Array, opts: Record<string, any>) => {
        if (opts.max_new_tokens === 8) return { text: '' } // aquecimento
        let liberar!: () => void
        const liberado = new Promise<void>((r) => (liberar = r))
        chamadas.push({ pcm, opts, liberar })
        await liberado
        // O processador de cancelamento, se armado, é aplicado como o `generate` aplicaria.
        const logits = { data: new Float32Array([1, 2, 3]), dims: [1, 3] }
        for (const p of opts.logits_processor ?? []) p([], logits)
        const cortado = logits.data[0] === -Infinity
        return { text: cortado ? 'meia fra' : `texto ${pcm.length}` }
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
const tique = () => new Promise((r) => setTimeout(r, 0))
const esperarChamadas = async (n: number) => {
  for (let i = 0; i < 50 && chamadas.length < n; i++) await tique()
  expect(chamadas).toHaveLength(n)
}

beforeEach(async () => {
  postadas = []
  chamadas.length = 0
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

const pedir = (id: string, prioridade: 'final' | 'parcial', n = 16000) =>
  onmessage({
    data: {
      type: 'transcribe',
      id,
      prioridade,
      pcm: new Float32Array(n),
      language: 'pt',
      model: 'onnx-community/whisper-small',
    },
  } as MessageEvent)

describe('whisperWorker com fila serial', () => {
  it('o final PARA o parcial em voo e só começa depois dele — nunca intercalados', async () => {
    const p = pedir('parcial-1', 'parcial', 16000)
    await esperarChamadas(1)
    const f = pedir('final-1', 'final', 32000)
    await tique()
    expect(chamadas).toHaveLength(1) // o final NÃO entrou no modelo junto com o parcial
    chamadas[0].liberar()
    await p
    await esperarChamadas(2)
    expect(chamadas[1].pcm.length).toBe(32000)
    chamadas[1].liberar()
    await f
    const tipos = postadas.filter((m) => m.type !== 'update').map((m) => `${m.type}:${m.id}`)
    expect(tipos).toEqual(['cancelado:parcial-1', 'result:final-1'])
    expect(postadas.find((m) => m.id === 'final-1')?.text).toBe('texto 32000')
  })

  it('parcial que espera na fila é descartado quando o final chega (responde `cancelado`)', async () => {
    const f1 = pedir('final-a', 'final')
    await esperarChamadas(1)
    const p = pedir('parcial-b', 'parcial')
    const f2 = pedir('final-c', 'final')
    await p
    expect(postadas).toContainEqual({ type: 'cancelado', id: 'parcial-b' })
    chamadas[0].liberar()
    await f1
    await esperarChamadas(2)
    chamadas[1].liberar()
    await f2
    expect(chamadas).toHaveLength(2) // o parcial nunca decodificou
  })

  it('`cancelar` de um pedido em voo: o decode termina cedo e responde `cancelado`', async () => {
    const f = pedir('espec-1', 'final')
    await esperarChamadas(1)
    await onmessage({ data: { type: 'cancelar', id: 'espec-1' } } as MessageEvent)
    chamadas[0].liberar()
    await f
    expect(postadas).toContainEqual({ type: 'cancelado', id: 'espec-1' })
    expect(postadas.some((m) => m.type === 'result')).toBe(false)
  })

  it('sem cancelamento, o processador não muda o texto (o final é o mesmo de antes)', async () => {
    const f = pedir('final-z', 'final', 8000)
    await esperarChamadas(1)
    chamadas[0].liberar()
    await f
    expect(postadas.find((m) => m.type === 'result')?.text).toBe('texto 8000')
  })
})
