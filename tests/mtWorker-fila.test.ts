/**
 * A TRADUÇÃO DO FINAL NÃO DISPUTA O TRADUTOR COM A DO PARCIAL (auditoria de latência 2026-09-26).
 *
 * `onmessage = async` intercalava as duas; a MT do final variava de 0,24 a 1,67 s e as lentas eram
 * as intercaladas. Agora: fila serial, final na frente, parcial velho parado ou descartado.
 *
 * E AS CARGAS, UMA DE CADA VEZ (plano "Grátis sem travar", A7): dois preloads abriam duas sessões de
 * ~113 MB ao mesmo tempo. Agora vão numa fila só de carga — a TRADUÇÃO de um sentido já pronto não
 * entra nela e não espera o download do outro —, e o cache guarda os dois mais recentes: o terceiro
 * despeja (com `dispose`) o menos usado ANTES de carregar, e o adapter é avisado (`descarregado`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const chamadas: Array<{ texto: string; liberar: () => void; opts: Record<string, any> }> = []
/** Com `cargaManual`, cada `pipeline()` espera o teste chamar `liberar` (o download em curso). */
const cargas: Array<{ modelo: string; liberar: () => void }> = []
let cargaManual = false
/** A ordem do que aconteceu: `carga:<modelo>` e `dispose:<modelo>`. */
const eventos: string[] = []
const curto = (modelo: string) => modelo.replace('Xenova/opus-mt-', '')

vi.mock('@huggingface/transformers', () => {
  class Tensor {}
  const pipeline = vi.fn(async (_tarefa: string, modelo: string) => {
    eventos.push(`carga:${curto(modelo)}`)
    if (cargaManual) await new Promise<void>((liberar) => cargas.push({ modelo, liberar }))
    return Object.assign(
      async (texto: string, opts: Record<string, any>) => {
        let liberar!: () => void
        const liberado = new Promise<void>((r) => (liberar = r))
        chamadas.push({ texto, liberar, opts })
        await liberado
        return [{ translation_text: `<${texto}>` }]
      },
      {
        tokenizer: {},
        model: { generation_config: { eos_token_id: 0 } },
        dispose: vi.fn(async () => {
          eventos.push(`dispose:${curto(modelo)}`)
        }),
      },
    )
  })
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
  cargas.length = 0
  eventos.length = 0
  cargaManual = false
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

const carregar = (src: string, tgt: string) => onmessage({ data: { type: 'preload', src, tgt } } as MessageEvent)
const esperarCargas = async (n: number) => {
  for (let i = 0; i < 50 && cargas.length < n; i++) await tique()
  expect(cargas).toHaveLength(n)
}

describe('mtWorker: cargas em série e cache de dois', () => {
  it('dois preloads vão em SÉRIE; a tradução do sentido pronto não espera a carga do outro', async () => {
    cargaManual = true
    const esEn = carregar('es', 'en')
    await esperarCargas(1)
    const enEs = carregar('en', 'es')
    for (let i = 0; i < 5; i++) await tique()
    expect(cargas).toHaveLength(1) // a segunda sessão só abre depois da primeira
    cargas[0].liberar()
    await esEn
    expect(postadas).toContainEqual({ type: 'ready', model: 'Xenova/opus-mt-es-en' })
    await esperarCargas(2)
    // en→es baixando; es→en já pronto traduz sem esperar por ela.
    const t = traduzir('t', 'hola')
    await esperar(1)
    chamadas[0].liberar()
    await t
    expect(postadas).toContainEqual({ type: 'result', id: 't', text: '<hola>' })
    expect(postadas.some((m) => m.type === 'ready' && m.model === 'Xenova/opus-mt-en-es')).toBe(false)
    cargas[1].liberar()
    await enEs
    expect(postadas).toContainEqual({ type: 'ready', model: 'Xenova/opus-mt-en-es' })
  })

  it('o mesmo modelo pedido duas vezes durante a carga abre UMA sessão', async () => {
    cargaManual = true
    const a = carregar('es', 'en')
    const b = carregar('es', 'en')
    await esperarCargas(1)
    cargas[0].liberar()
    await Promise.all([a, b])
    expect(eventos).toEqual(['carga:es-en'])
    expect(postadas.filter((m) => m.type === 'ready')).toHaveLength(2)
  })

  it('o terceiro modelo despeja o menos usado ANTES de carregar, e avisa o adapter', async () => {
    await carregar('es', 'en')
    await carregar('en', 'es')
    await carregar('fr', 'en')
    expect(eventos).toEqual(['carga:es-en', 'carga:en-es', 'dispose:es-en', 'carga:fr-en'])
    expect(postadas).toContainEqual({ type: 'descarregado', model: 'Xenova/opus-mt-es-en' })
  })

  it('o sentido EM USO por uma tradução não é descartado no meio dela', async () => {
    await carregar('es', 'en')
    await carregar('en', 'es')
    const t = traduzir('t', 'hola') // reserva o es→en
    await esperar(1)
    await carregar('en', 'es') // en→es vira o mais recente: o es→en (em uso) é o menos usado
    await carregar('fr', 'en')
    expect(eventos).not.toContain('dispose:es-en')
    expect(eventos).toContain('dispose:en-es')
    chamadas[0].liberar()
    await t
    expect(postadas).toContainEqual({ type: 'result', id: 't', text: '<hola>' })
  })

  it('uma tradução de um sentido que saiu do cache recarrega e traduz (não falha)', async () => {
    await carregar('es', 'en')
    await carregar('en', 'es')
    await carregar('fr', 'en') // es→en saiu
    const t = traduzir('t', 'hola')
    await esperar(1)
    chamadas[0].liberar()
    await t
    expect(eventos.filter((e) => e === 'carga:es-en')).toHaveLength(2)
    expect(postadas).toContainEqual({ type: 'result', id: 't', text: '<hola>' })
  })
})
