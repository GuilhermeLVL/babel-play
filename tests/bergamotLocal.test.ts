/**
 * ROTEAMENTO DO TRADUTOR LOCAL COM O BERGAMOT (A9b) — o composto do binding `opus-mt-local`.
 *
 * A decisão da bancada (Etapa 5): Bergamot no pt→en, opus-mt no en→pt. O que estes testes prendem:
 *   - pt→en PREFERE o Bergamot, e enquanto ele carrega o opus-mt NÃO baixa junto (é o download de
 *     113 MB que o Bergamot existe para evitar);
 *   - qualquer falha (sem modelo, WASM, erro de tradução) cai no opus-mt sem erro na tela: a carga
 *     da reserva começa na hora, com a mesma barra;
 *   - só a falha do MOTOR fica lembrada no aparelho; rede e integridade tentam de novo;
 *   - en→pt nunca toca no Bergamot;
 *   - build sem os modelos (`__BERGAMOT_PT_EN__` falso) = o comportamento de antes.
 * Os workers são falsos; o gateway, num caso, é o de verdade.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

type Mensagem = {
  type: string
  id?: string
  src?: string
  tgt?: string
  textos?: string[]
  text?: string
  plano?: { par: string }
}

class WorkerFalso {
  static todos: WorkerFalso[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  recebidas: Mensagem[] = []
  encerrado = false
  readonly tipo: 'bergamot' | 'opus'
  constructor(url: URL | string) {
    this.tipo = String(url).includes('bergamotWorker') ? 'bergamot' : 'opus'
    WorkerFalso.todos.push(this)
  }
  static de(tipo: 'bergamot' | 'opus') {
    return WorkerFalso.todos.filter((w) => w.tipo === tipo)
  }
  postMessage(m: Mensagem) {
    this.recebidas.push(m)
    if (m.type === 'traduzir' && this.tipo === 'bergamot')
      queueMicrotask(() =>
        this.responder({ type: 'result', id: m.id, textos: m.textos!.map((t) => `[bergamot] ${t}`) }),
      )
    if (m.type === 'translate' && this.tipo === 'opus')
      queueMicrotask(() => this.responder({ type: 'result', id: m.id, text: `[opus] ${m.text}` }))
  }
  responder(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
  terminate() {
    this.encerrado = true
  }
}

function localStorageFalso() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  }
}

async function montar() {
  const { BergamotLocal, TradutorLocalComBergamot } = await import('../src/gateway/adapters/bergamotLocal')
  const { OpusMtLocal } = await import('../src/gateway/adapters/opusMtLocal')
  const bergamot = new BergamotLocal()
  const opus = new OpusMtLocal()
  return { bergamot, opus, local: new TradutorLocalComBergamot(bergamot, opus) }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.resetModules()
  WorkerFalso.todos = []
  vi.stubGlobal('Worker', WorkerFalso)
  vi.stubGlobal('__BERGAMOT_PT_EN__', true)
  vi.stubGlobal('localStorage', localStorageFalso())
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('pt→en prefere o Bergamot', () => {
  it('o preload carrega SÓ o Bergamot (nenhum worker do opus-mt)', async () => {
    const { local } = await montar()
    local.preload('pt', 'en')
    const [b] = WorkerFalso.de('bergamot')
    expect(b.recebidas[0]).toMatchObject({ type: 'carregar', plano: { par: 'pt-en' } })
    expect(WorkerFalso.de('opus')).toHaveLength(0)
  })

  it('carregando: pula (MotorAindaCarregando) e o opus-mt NÃO começa a baixar', async () => {
    const { local } = await montar()
    await expect(local.translate('bom dia', 'pt', 'en')).rejects.toMatchObject({ name: 'MotorAindaCarregando' })
    await expect(local.translate('bom dia', 'pt-BR', 'en', { parcial: true })).rejects.toMatchObject({
      name: 'MotorAindaCarregando',
    })
    expect(WorkerFalso.de('opus')).toHaveLength(0)
  })

  it('pronto: traduz com o Bergamot e diz o motor (a porta de qualidade e a telemetria leem isto)', async () => {
    const { local } = await montar()
    const prontos: string[] = []
    local.aoFicarPronto((m) => prontos.push(m))
    local.preload('pt', 'en')
    WorkerFalso.de('bergamot')[0].responder({ type: 'ready', model: 'bergamot/pt-en' })
    expect(prontos).toEqual(['bergamot/pt-en'])
    const r = await local.translate('bom dia', 'pt', 'en')
    expect(r).toMatchObject({ text: '[bergamot] bom dia', engine: 'bergamot-local' })
    const pedido = WorkerFalso.de('bergamot')[0].recebidas.find((m) => m.type === 'traduzir')
    expect(pedido).toMatchObject({ textos: ['bom dia'], prioridade: 'final' })
  })

  /* Achado na prova real (Chromium, 29/09): o download chega a 100% ANTES de o WASM montar o modelo, e o
     `preload` do gateway resolve no primeiro `p >= 1` — a captura achava o tradutor pronto e as falas
     seguintes davam "sem rota". Só o `ready` pode dizer 1. */
  it('100% do download NÃO é "pronto": a barra para em 0,99 até o ready', async () => {
    const { local } = await montar()
    const barra = vi.fn()
    local.preload('pt', 'en', barra)
    const [b] = WorkerFalso.de('bergamot')
    b.responder({ type: 'progress', progress: 1, loaded: 25, total: 25, label: '25 de 25' })
    expect(barra).toHaveBeenLastCalledWith(0.99, '25 de 25', { loaded: 25, total: 25 })
    b.responder({ type: 'ready', model: 'bergamot/pt-en' })
    expect(barra).toHaveBeenLastCalledWith(1, 'Tradutor pronto')
  })

  it('parcial sem o Bergamot pronto não abre worker (não baixa por um texto descartável)', async () => {
    const { local } = await montar()
    await expect(local.translate('bo', 'pt', 'en', { parcial: true })).rejects.toMatchObject({
      name: 'MotorAindaCarregando',
    })
    expect(WorkerFalso.todos).toHaveLength(0)
  })
})

describe('en→pt não usa o Bergamot', () => {
  it('preload e tradução vão ao opus-mt (en-ROMANCE com >>pt_br<<)', async () => {
    const { local, bergamot } = await montar()
    expect(bergamot.supports('en', 'pt')).toBe(false)
    local.preload('en', 'pt')
    expect(WorkerFalso.de('bergamot')).toHaveLength(0)
    expect(WorkerFalso.de('opus')[0].recebidas[0]).toMatchObject({ type: 'preload', src: 'en', tgt: 'pt' })
  })
})

describe('qualquer falha cai no opus-mt', () => {
  it.each(['rede', 'integridade', 'motor'] as const)(
    'falha de carga (%s): a reserva começa na hora, com a MESMA barra',
    async (motivo) => {
      const { local } = await montar()
      const barra = vi.fn()
      local.preload('pt', 'en', barra)
      const b = WorkerFalso.de('bergamot')[0]
      b.responder({ type: 'progress', progress: 0.2, loaded: 5, total: 25, label: '5 de 25' })
      b.responder({ type: 'loadError', model: 'bergamot/pt-en', motivo, message: 'x' })
      expect(b.encerrado).toBe(true)
      const [o] = WorkerFalso.de('opus')
      expect(o.recebidas[0]).toMatchObject({ type: 'preload', src: 'pt', tgt: 'en' })
      // A barra que a captura passou ao Bergamot é a que o opus-mt passa a mover.
      o.responder({ type: 'progress', progress: 0.5, label: 'opus' })
      expect(barra).toHaveBeenLastCalledWith(0.5, 'opus', undefined)
      o.responder({ type: 'ready', model: 'Xenova/opus-mt-ROMANCE-en' })
      const r = await local.translate('bom dia', 'pt', 'en')
      expect(r).toMatchObject({ text: '[opus] bom dia', engine: 'opus-mt-local' })
    },
  )

  it('a falha de carga do Bergamot NÃO é "tradutor local indisponível" (há reserva)', async () => {
    const { local } = await montar()
    const falhas = vi.fn()
    local.aoFalharCarga(falhas)
    local.preload('pt', 'en')
    WorkerFalso.de('bergamot')[0].responder({
      type: 'loadError',
      model: 'bergamot/pt-en',
      motivo: 'rede',
      message: 'x',
    })
    expect(falhas).not.toHaveBeenCalled()
    // …mas se a reserva também não carrega, aí sim.
    WorkerFalso.de('opus')[0].responder({ type: 'loadError', model: 'Xenova/opus-mt-ROMANCE-en' })
    expect(falhas).toHaveBeenCalledWith('Xenova/opus-mt-ROMANCE-en')
  })

  it('erro numa tradução: ESTA frase já vai ao opus-mt, e as próximas também', async () => {
    const { local } = await montar()
    local.preload('pt', 'en')
    const b = WorkerFalso.de('bergamot')[0]
    b.responder({ type: 'ready', model: 'bergamot/pt-en' })
    b.postMessage = function (m: Mensagem) {
      this.recebidas.push(m)
      if (m.type === 'traduzir')
        queueMicrotask(() => this.responder({ type: 'error', id: m.id, message: 'RuntimeError: unreachable' }))
    }
    // O opus-mt ainda não carregou: a frase fica "a caminho" (pulo), e a carga dele começa.
    await expect(local.translate('bom dia', 'pt', 'en')).rejects.toMatchObject({ name: 'MotorAindaCarregando' })
    const [o] = WorkerFalso.de('opus')
    expect(o.recebidas.some((m) => m.type === 'preload' && m.src === 'pt')).toBe(true)
    o.responder({ type: 'ready', model: 'Xenova/opus-mt-ROMANCE-en' })
    expect(await local.translate('boa noite', 'pt', 'en')).toMatchObject({ engine: 'opus-mt-local' })
  })

  it('só a falha do MOTOR fica lembrada no aparelho (a próxima sessão nem tenta)', async () => {
    const primeira = await montar()
    primeira.local.preload('pt', 'en')
    WorkerFalso.de('bergamot')[0].responder({
      type: 'loadError',
      model: 'bergamot/pt-en',
      motivo: 'motor',
      message: 'CompileError',
    })
    const segunda = await montar()
    expect(segunda.bergamot.supports('pt', 'en')).toBe(false)
    expect(segunda.local.supports('pt', 'en')).toBe(true) // o opus-mt segue cobrindo
  })

  it.each(['rede', 'integridade'] as const)(
    'falha de %s NÃO fica lembrada: a próxima sessão tenta de novo',
    async (motivo) => {
      const primeira = await montar()
      primeira.local.preload('pt', 'en')
      WorkerFalso.de('bergamot')[0].responder({ type: 'loadError', model: 'bergamot/pt-en', motivo, message: 'x' })
      expect(primeira.bergamot.supports('pt', 'en')).toBe(false) // nesta sessão, não
      expect((await montar()).bergamot.supports('pt', 'en')).toBe(true)
    },
  )
})

describe('sem os modelos no build', () => {
  it('`__BERGAMOT_PT_EN__` falso: pt→en vai ao opus-mt, como antes do A9b', async () => {
    vi.stubGlobal('__BERGAMOT_PT_EN__', false)
    const { local, bergamot } = await montar()
    expect(bergamot.supports('pt', 'en')).toBe(false)
    local.preload('pt', 'en')
    expect(WorkerFalso.de('bergamot')).toHaveLength(0)
    expect(WorkerFalso.de('opus')[0].recebidas[0]).toMatchObject({ type: 'preload', src: 'pt', tgt: 'en' })
  })
})

describe('liberar', () => {
  it('solta os dois: descartar + terminate no Bergamot, terminate no opus-mt', async () => {
    const { local } = await montar()
    local.preload('pt', 'en')
    local.preload('en', 'pt')
    const [b] = WorkerFalso.de('bergamot')
    const [o] = WorkerFalso.de('opus')
    local.liberar()
    expect(b.recebidas.at(-1)).toEqual({ type: 'descartar' })
    expect(b.encerrado).toBe(true)
    expect(o.encerrado).toBe(true)
  })
})

describe('pelo gateway de verdade', () => {
  it('pt→en: sem rota enquanto o Bergamot carrega (sem baixar o opus-mt); pronto, responde bergamot-local', async () => {
    const { buildGateway } = await import('../src/gateway/index')
    const gw = buildGateway({
      profile: {
        id: 't',
        name: 't',
        builtin: true,
        economyMode: false,
        budget: { maxCloudRequests: 0, maxTokens: 0 },
        bindings: { mt: [{ adapterId: 'opus-mt-local' }] },
      } as never,
      cloudConsent: () => false,
    })
    const prontos = vi.fn()
    gw.mt.aoFicarPronto(prontos)
    await expect(gw.mt.translate('bom dia', 'pt', 'en')).rejects.toMatchObject({
      name: 'NoRouteError',
      carregando: true,
    })
    expect(WorkerFalso.de('opus')).toHaveLength(0)
    WorkerFalso.de('bergamot')[0].responder({ type: 'ready', model: 'bergamot/pt-en' })
    await tick()
    expect(prontos).toHaveBeenCalled()
    expect(await gw.mt.translate('bom dia', 'pt', 'en')).toMatchObject({ engine: 'bergamot-local' })
    // en→pt no mesmo gateway: opus-mt.
    await expect(gw.mt.translate('good morning', 'en', 'pt')).rejects.toMatchObject({ name: 'NoRouteError' })
    expect(WorkerFalso.de('opus')).toHaveLength(1)
  })
})
