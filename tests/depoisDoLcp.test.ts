// @vitest-environment jsdom
/**
 * O QUE NÃO DESENHA O INÍCIO ESPERA O LCP (carga-rapida-no-celular, 2.2): o 1º `largest-contentful-paint` (ou o
 * teto) com a tela de verdade montada, e depois um ocioso.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  avisarTelaPronta,
  quandoPassarOLcp,
  TETO_DO_LCP_MS,
  zerarDepoisDoLcpParaTeste,
} from '../src/lib/polimento/depoisDoLcp'

let observadores: Array<() => void> = []
let ociosos: Array<() => void> = []

beforeEach(() => {
  vi.useFakeTimers()
  zerarDepoisDoLcpParaTeste()
  observadores = []
  ociosos = []
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      constructor(private cb: () => void) {}
      observe() {
        observadores.push(this.cb)
      }
      disconnect() {}
    },
  )
  vi.stubGlobal('requestIdleCallback', (f: () => void) => ociosos.push(f))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('quandoPassarOLcp', () => {
  it('espera o LCP, a tela de verdade e um ocioso; depois, roda na hora', () => {
    const cb = vi.fn()
    quandoPassarOLcp(cb)
    expect(cb).not.toHaveBeenCalled()
    observadores[0]()
    /* O LCP do esqueleto do HTML chega antes do React: sem a tela, ainda espera. */
    expect(ociosos).toHaveLength(0)
    avisarTelaPronta()
    expect(cb).not.toHaveBeenCalled()
    ociosos.shift()!()
    expect(cb).toHaveBeenCalledTimes(1)
    const depois = vi.fn()
    quandoPassarOLcp(depois)
    expect(depois).toHaveBeenCalledTimes(1)
  })

  it('sem LCP (Safari) ou sem aviso da tela, o teto libera', () => {
    const cb = vi.fn()
    quandoPassarOLcp(cb)
    vi.advanceTimersByTime(TETO_DO_LCP_MS)
    ociosos.shift()!()
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
