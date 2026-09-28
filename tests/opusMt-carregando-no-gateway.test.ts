/**
 * OPUS-MT CARREGANDO, PELO GATEWAY DE VERDADE (Quest emulado, 2026-09-28).
 *
 * Com o modelo baixando, cada final e cada parcial respondiam "ainda carregando", e isso abria o
 * disjuntor do opus-mt por 30 s: o modelo ficava pronto e os finais seguiam sem tradução. Aqui o
 * worker é falso — responde `ready` quando o teste manda — e o gateway é o real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({ apiFetch: vi.fn() }))

type Mensagem = { type: string; id?: string; text?: string; src?: string; tgt?: string }

class WorkerFalso {
  static ultimo: WorkerFalso | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  recebidas: Mensagem[] = []
  /** O que o worker responde a cada `translate`: texto, ou `null` para responder erro. */
  resposta: (m: Mensagem) => string | null = (m) => `[opus] ${m.text}`
  constructor() {
    WorkerFalso.ultimo = this
  }
  postMessage(m: Mensagem) {
    this.recebidas.push(m)
    if (m.type === 'translate') {
      const r = this.resposta(m)
      queueMicrotask(() =>
        this.onmessage?.({
          data: r === null ? { type: 'error', id: m.id, message: 'quebrou' } : { type: 'result', id: m.id, text: r },
        } as MessageEvent),
      )
    }
  }
  pronto(model: string) {
    this.onmessage?.({ data: { type: 'ready', model } } as MessageEvent)
  }
  terminate() {}
}

const perfil = {
  id: 'teste',
  name: 'teste',
  builtin: true,
  economyMode: false,
  budget: { maxCloudRequests: 100, maxTokens: 100_000 },
  bindings: { mt: [{ adapterId: 'opus-mt-local' }] },
}

async function montar() {
  vi.stubGlobal('Worker', WorkerFalso)
  const { buildGateway } = await import('../src/gateway/index')
  return buildGateway({ profile: perfil as never, cloudConsent: () => true })
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
  WorkerFalso.ultimo = null
})

describe('opus-mt carregando', () => {
  it('muitas falas durante a carga não abrem o disjuntor: pronto o modelo, a próxima já traduz', async () => {
    const gw = await montar()
    // Seis finais e seis parciais enquanto o modelo baixa (o Quest com CPU ×4).
    for (let i = 0; i < 6; i++) {
      await expect(gw.mt.translate(`fala ${i}`, 'pt', 'en')).rejects.toMatchObject({ name: 'NoRouteError' })
      const p = await gw.mt.translate(`fala ${i}`, 'pt', 'en', { parcial: true })
      expect(p.text).toBe('')
    }
    WorkerFalso.ultimo!.pronto('Xenova/opus-mt-ROMANCE-en')
    const r = await gw.mt.translate('bom dia', 'pt', 'en')
    expect(r).toMatchObject({ text: '[opus] bom dia', engine: 'opus-mt-local' })
  })

  it('o gateway avisa quem pediu quando o tradutor local fica pronto', async () => {
    const gw = await montar()
    const aviso = vi.fn()
    gw.mt.aoFicarPronto(aviso)
    gw.mt.warmup([['pt', 'en']])
    expect(aviso).not.toHaveBeenCalled()
    WorkerFalso.ultimo!.pronto('Xenova/opus-mt-ROMANCE-en')
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('um modelo que fica pronto FECHA o disjuntor aberto por falhas antigas', async () => {
    const gw = await montar()
    gw.mt.warmup([['pt', 'en']])
    const w = WorkerFalso.ultimo!
    w.pronto('Xenova/opus-mt-ROMANCE-en')
    w.resposta = () => null // o worker quebra três vezes: o disjuntor abre
    for (let i = 0; i < 3; i++) await gw.mt.translate(`x${i}`, 'pt', 'en').catch(() => {})
    w.resposta = (m) => `[opus] ${m.text}`
    await expect(gw.mt.translate('aberto', 'pt', 'en')).rejects.toMatchObject({ name: 'NoRouteError' })
    // Outro sentido termina de carregar: o motor voltou, o disjuntor fecha na hora.
    gw.mt.warmup([['en', 'pt']])
    w.pronto('Xenova/opus-mt-en-ROMANCE')
    const r = await gw.mt.translate('fechado', 'pt', 'en')
    expect(r.text).toBe('[opus] fechado')
  })
})
