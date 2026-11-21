/**
 * O en→pt DO opus-mt ESCREVE PORTUGUÊS DO BRASIL (openspec `traducao-local-por-direcao`, tarefa 3.2).
 *
 * O modelo `opus-mt-en-ROMANCE` cobre várias línguas latinas e escolhe a saída pelo token de alvo no início da entrada.
 * Com `>>pt<<` ele responde em português europeu; o app manda `>>pt_br<<`, por ID do vocabulário (id 51; o texto seria
 * partido pelo pré-tokenizador). Se alguém trocar o token ou o ID, este teste quebra: é o que mantém en→pt no português
 * do Brasil enquanto nenhum tradutor leve passar no teste cego.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const capturado = vi.hoisted(() => ({
  modelo: '' as string,
  entradas: [] as bigint[][],
  traducao: [] as string[],
}))

vi.mock('@huggingface/transformers', () => {
  class Tensor {
    constructor(
      readonly type: string,
      readonly data: BigInt64Array,
      readonly dims: number[],
    ) {}
  }
  const pipeline = vi.fn(async (_tarefa: string, modelo: string) => {
    capturado.modelo = modelo
    const tokenizer = Object.assign(() => ({ input_ids: { data: BigInt64Array.from([101n, 102n, 103n]) } }), {
      model: { tokens_to_ids: new Map<string, number>(), unk_token_id: 2 },
      batch_decode: () => ['bom dia'],
    })
    return Object.assign(async () => [{ translation_text: 'não deve passar por aqui' }], {
      tokenizer,
      model: {
        generation_config: { eos_token_id: 0 },
        generate: async ({ input_ids }: { input_ids: Tensor }) => {
          capturado.entradas.push([...input_ids.data])
          return [[1]]
        },
      },
    })
  })
  return { env: { backends: { onnx: { wasm: {} } } }, pipeline, Tensor }
})
vi.mock('../src/gateway/modelManifest', () => ({ registrarModeloBaixado: vi.fn() }))
vi.mock('../src/gateway/adapters/transformersEnv', () => ({ configureModelDelivery: vi.fn() }))

let onmessage: (e: MessageEvent) => Promise<void>
let enviadas: Record<string, unknown>[]

beforeEach(async () => {
  capturado.modelo = ''
  capturado.entradas = []
  enviadas = []
  const falsoSelf: Record<string, unknown> = { postMessage: (m: Record<string, unknown>) => enviadas.push(m) }
  vi.stubGlobal('self', falsoSelf)
  vi.resetModules()
  await import('../src/gateway/adapters/mtWorker')
  onmessage = falsoSelf.onmessage as typeof onmessage
})

describe('mtWorker: en→pt envia o alvo pt_br', () => {
  it('usa o en-ROMANCE e põe o ID do `>>pt_br<<` (51) na frente da entrada, nunca o texto `>>pt<<`', async () => {
    await onmessage({
      data: { type: 'translate', id: 'a', text: 'Good morning', src: 'en', tgt: 'pt-BR' },
    } as MessageEvent)
    expect(capturado.modelo).toBe('Xenova/opus-mt-en-ROMANCE')
    expect(capturado.entradas).toHaveLength(1)
    expect(capturado.entradas[0]).toEqual([51n, 101n, 102n, 103n])
    expect(enviadas.find((m) => m.type === 'result')).toMatchObject({ id: 'a', text: 'bom dia' })
  })

  it('en→es não leva token de alvo (modelo dedicado)', async () => {
    await onmessage({
      data: { type: 'translate', id: 'b', text: 'Good morning', src: 'en', tgt: 'es' },
    } as MessageEvent)
    expect(capturado.modelo).toBe('Xenova/opus-mt-en-es')
    expect(capturado.entradas).toHaveLength(0)
  })
})
