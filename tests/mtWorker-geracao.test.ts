/**
 * A TRADUÇÃO DO PARCIAL É BARATA; A DO FINAL NÃO MUDA ("Grátis sem travar", A5).
 *
 * O texto do parcial é trocado ~1 s depois (o parcial seguinte, ou o final), e beam 2 custa quase o
 * dobro do greedy no WASM. O parcial passa a traduzir com `num_beams: 1` e teto de 128; o final segue
 * EXATAMENTE com as opções de antes (beam 2, 256), então a legenda que fica na tela é a mesma.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const opcoesVistas: Array<Record<string, any>> = []

vi.mock('@huggingface/transformers', () => {
  class Tensor {}
  const pipeline = vi.fn(async () =>
    Object.assign(
      async (texto: string, opts: Record<string, any>) => {
        opcoesVistas.push(opts)
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

beforeEach(async () => {
  postadas = []
  opcoesVistas.length = 0
  const falsoSelf: Record<string, unknown> = { postMessage: (m: Record<string, unknown>) => postadas.push(m) }
  vi.stubGlobal('self', falsoSelf)
  vi.resetModules()
  await import('../src/gateway/adapters/mtWorker')
  onmessage = falsoSelf.onmessage as typeof onmessage
})
afterEach(() => vi.unstubAllGlobals())

const traduzir = (id: string, text: string, prioridade?: 'parcial' | 'final') =>
  onmessage({ data: { type: 'translate', id, text, src: 'es', tgt: 'en', prioridade } } as MessageEvent)

/** O que vai ao `generate`, sem o freio de cancelamento (que é uma função nova a cada chamada). */
const semFreio = ({ logits_processor: _freio, ...resto }: Record<string, any>) => resto

describe('mtWorker — opções de geração por prioridade', () => {
  it('parcial: greedy (beam 1) e teto de 128 — o resto do decode é o mesmo', async () => {
    await traduzir('p', 'hola', 'parcial')
    expect(opcoesVistas).toHaveLength(1)
    expect(semFreio(opcoesVistas[0])).toEqual({
      num_beams: 1,
      max_length: 128,
      no_repeat_ngram_size: 3,
      early_stopping: true,
    })
    expect(postadas.at(-1)).toEqual({ type: 'result', id: 'p', text: '<hola>' })
  })

  it('final: EXATAMENTE as opções de antes (beam 2, teto 256)', async () => {
    await traduzir('f', 'hola amigo', 'final')
    expect(semFreio(opcoesVistas[0])).toEqual({
      num_beams: 2,
      max_length: 256,
      no_repeat_ngram_size: 3,
      early_stopping: true,
    })
  })

  it('sem prioridade (quem não diz) é final — nada muda para quem já chamava', async () => {
    await traduzir('x', 'hola')
    expect(opcoesVistas[0].num_beams).toBe(2)
    expect(opcoesVistas[0].max_length).toBe(256)
  })

  it('cada frase do parcial vai com as opções do parcial', async () => {
    await traduzir('p2', 'Hola. ¿Qué tal?', 'parcial')
    expect(opcoesVistas.length).toBeGreaterThanOrEqual(2)
    for (const o of opcoesVistas) expect(o.num_beams).toBe(1)
  })
})
