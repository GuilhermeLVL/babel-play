/**
 * A TRADUÇÃO DO FINAL NÃO DISPUTA O TRADUTOR COM A DO PARCIAL (auditoria de latência 2026-09-26).
 *
 * `onmessage = async` intercalava as duas; a MT do final variava de 0,24 a 1,67 s e as lentas eram
 * as intercaladas. Agora: fila serial, final na frente, parcial velho parado ou descartado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const chamadas: Array<{ texto: string; liberar: () => void; opts: Record<string, any> }> = []

vi.mock('@huggingface/transformers', () => {
  class Tensor {}
  const pipeline = vi.fn(async () =>
    Object.assign(
      async (texto: string, opts: Record<string, any>) => {
        let liberar!: () => void
        const liberado = new Promise<void>((r) => (liberar = r))
        chamadas.push({ texto, liberar, opts })
        await liberado
        return [{ translation_text: `<${texto}>` }]
      },
      { tokenizer: {}, model: { generation_config: { eos_token_id: 0 } } },
    ),
  )
  return { pipeline, Tensor }
})
vi.mock('../src/gateway/modelManifest', () => ({ registrarModeloBaixado: vi.fn() }))
vi.mock('../src/gateway/adapters/transformersEnv', () => ({ configureModelDelivery: vi.fn() }))

let postadas: Record<string, unknown>[] = []
let onmessage: (e: MessageEvent) => Promise<void>
const tique = () => new Promise((r) => setTimeout(r, 0))
const esperar = async (n: number) => {
  for (let i = 0; i < 50 && chamadas.length < n; i++) await tique()
  expect(chamadas).toHaveLength(n)
}

beforeEach(async () => {
  postadas = []
  chamadas.length = 0
  const falsoSelf: Record<string, unknown> = { postMessage: (m: Record<string, unknown>) => postadas.push(m) }
  vi.stubGlobal('self', falsoSelf)
  vi.resetModules()
  await import('../src/gateway/adapters/mtWorker')
  onmessage = falsoSelf.onmessage as typeof onmessage
})
afterEach(() => vi.unstubAllGlobals())

const traduzir = (id: string, text: string, prioridade?: 'parcial') =>
  onmessage({ data: { type: 'translate', id, text, src: 'es', tgt: 'en', prioridade } } as MessageEvent)

describe('mtWorker com fila serial', () => {
  it('a tradução do final para a do parcial em voo e só então roda — sem intercalar', async () => {
    const p = traduzir('p', 'hola', 'parcial')
    await esperar(1)
    const f = traduzir('f', 'hola amigo')
    await tique()
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].opts.logits_processor).toHaveLength(1) // o freio está armado
    chamadas[0].liberar()
    await p
    await esperar(2)
    chamadas[1].liberar()
    await f
    expect(postadas.map((m) => `${m.type}:${m.id}`)).toEqual(['cancelado:p', 'result:f'])
    expect(postadas.at(-1)?.text).toBe('<hola amigo>')
  })

  it('a tradução de parcial que espera é descartada quando chega uma de final', async () => {
    const f1 = traduzir('f1', 'uno')
    await esperar(1)
    const p = traduzir('p', 'dos', 'parcial')
    void traduzir('f2', 'tres')
    await p
    expect(postadas).toContainEqual({ type: 'cancelado', id: 'p' })
    chamadas[0].liberar()
    await f1
    await esperar(2)
    expect(chamadas[1].texto).toBe('tres')
    chamadas[1].liberar()
  })
})
