/**
 * O ADAPTER DO OPUS-MT MANDA AO WORKER A PARTE DO TRADUTOR NO ORÇAMENTO DE THREADS
 * (`orcamentoDeThreads.ts`, plano "Grátis sem travar", A3): 2 com 8 núcleos ou mais, senão 1, e 1
 * sem isolamento. O worker aplica a primeira que chegar (ver `tests/mtWorker-threads.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OpusMtLocal } from '../src/gateway/adapters/opusMtLocal'

type Mensagem = { type: string; id?: string; threads?: number; model?: string }

class WorkerFalso {
  static ultimo: WorkerFalso | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  recebidas: Mensagem[] = []
  constructor() {
    WorkerFalso.ultimo = this
  }
  postMessage(m: Mensagem) {
    this.recebidas.push(m)
    if (m.type === 'translate')
      queueMicrotask(() => this.onmessage?.({ data: { type: 'result', id: m.id, text: 'ok' } } as MessageEvent))
  }
  responder(data: Record<string, unknown>) {
    this.onmessage?.({ data } as MessageEvent)
  }
  terminate() {}
}

const aparelho = (nucleos: number, isolado: boolean) => {
  vi.stubGlobal('navigator', { userAgent: 'x', hardwareConcurrency: nucleos, maxTouchPoints: 0 })
  vi.stubGlobal('crossOriginIsolated', isolado)
}

beforeEach(() => {
  WorkerFalso.ultimo = null
  vi.stubGlobal('Worker', WorkerFalso)
})
afterEach(() => vi.unstubAllGlobals())

describe('OpusMtLocal × orçamento de threads', () => {
  it('8 núcleos com isolamento: preload e tradução levam 2 threads', async () => {
    aparelho(8, true)
    const mt = new OpusMtLocal()
    mt.preload('es', 'en')
    const w = WorkerFalso.ultimo!
    w.responder({ type: 'ready', model: 'Xenova/opus-mt-es-en' })
    await mt.translate('hola', 'es', 'en')
    expect(w.recebidas.filter((m) => m.type === 'preload' || m.type === 'translate').map((m) => m.threads)).toEqual([
      2, 2,
    ])
  })

  it('4 núcleos: 1 thread', () => {
    aparelho(4, true)
    const mt = new OpusMtLocal()
    mt.preload('es', 'en')
    expect(WorkerFalso.ultimo!.recebidas[0]).toMatchObject({ type: 'preload', threads: 1 })
  })

  it('sem crossOriginIsolated: 1 thread, mesmo com 16 núcleos', () => {
    aparelho(16, false)
    const mt = new OpusMtLocal()
    mt.preload('es', 'en')
    expect(WorkerFalso.ultimo!.recebidas[0]).toMatchObject({ type: 'preload', threads: 1 })
  })
})
