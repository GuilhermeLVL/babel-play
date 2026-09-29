/**
 * O VIGIA DO MAIN THREAD — quanto a tela ficou travada nos últimos segundos.
 *
 * O regulador de desempenho só olhava o modelo (RTF, fila, latência); no aparelho fraco a aba
 * congelava antes de qualquer um desses sinais descer um degrau ("Grátis sem travar", A6). O vigia
 * soma o tempo de BLOQUEIO dos quadros longos (`long-animation-frame`, ou `longtask` onde não há
 * LoAF) numa janela. Observador falso e relógio sintético: o que se prende aqui é a escolha do tipo,
 * a conta do bloqueio, a janela e o no-op onde o navegador não mede.
 */
import { describe, expect, it } from 'vitest'

import { criarVigiaDoMainThread } from '../src/lib/captura/vigiaDoMainThread'

type Entrada = { startTime: number; duration: number; blockingDuration?: number }

/** Um `PerformanceObserver` falso: guarda o callback e o que foi pedido em `observe`. */
function observadorFalso(tipos: readonly string[] | undefined, opts: { observeLanca?: boolean } = {}) {
  const f = {
    pedidos: [] as Array<{ type: string; buffered?: boolean }>,
    desconectado: false,
    entregar(entradas: Entrada[]) {
      f.callback?.({ getEntries: () => entradas })
    },
    callback: undefined as undefined | ((lista: { getEntries(): Entrada[] }) => void),
  }
  class Observador {
    static supportedEntryTypes = tipos
    constructor(cb: (lista: { getEntries(): Entrada[] }) => void) {
      f.callback = cb
    }
    observe(o: { type: string; buffered?: boolean }) {
      if (opts.observeLanca) throw new Error('política recusou')
      f.pedidos.push(o)
    }
    disconnect() {
      f.desconectado = true
    }
  }
  return { f, Observador }
}

describe('criarVigiaDoMainThread', () => {
  it('prefere o LoAF e soma o blockingDuration dos quadros que terminaram na janela', () => {
    const { f, Observador } = observadorFalso(['longtask', 'long-animation-frame'])
    let agora = 20_000
    const vigia = criarVigiaDoMainThread({ Observador, agoraMs: () => agora })
    expect(vigia.suportado).toBe(true)
    expect(f.pedidos).toEqual([{ type: 'long-animation-frame', buffered: true }])
    f.entregar([
      { startTime: 5_000, duration: 300, blockingDuration: 250 }, // terminou fora da janela de 10 s
      { startTime: 12_000, duration: 200, blockingDuration: 150 },
      { startTime: 18_000, duration: 400, blockingDuration: 320 },
    ])
    expect(vigia.bloqueioRecenteMs(10_000)).toBe(470)
    agora = 25_000 // o de 12 s saiu da janela
    expect(vigia.bloqueioRecenteMs(10_000)).toBe(320)
  })

  it('LoAF sem blockingDuration conta o que passou de 50 ms', () => {
    const { f, Observador } = observadorFalso(['long-animation-frame'])
    const vigia = criarVigiaDoMainThread({ Observador, agoraMs: () => 1_000 })
    f.entregar([{ startTime: 100, duration: 180 }])
    expect(vigia.bloqueioRecenteMs(10_000)).toBe(130)
  })

  it('sem LoAF, cai no longtask e conta o que passa de 50 ms de cada tarefa', () => {
    const { f, Observador } = observadorFalso(['longtask', 'mark'])
    const vigia = criarVigiaDoMainThread({ Observador, agoraMs: () => 10_000 })
    expect(f.pedidos).toEqual([{ type: 'longtask', buffered: true }])
    f.entregar([
      { startTime: 1_000, duration: 120 },
      { startTime: 2_000, duration: 51 },
      { startTime: 3_000, duration: 400 },
    ])
    expect(vigia.bloqueioRecenteMs(10_000)).toBe(70 + 1 + 350)
  })

  it.each([
    ['sem LoAF nem longtask', ['mark', 'measure']],
    ['sem supportedEntryTypes', undefined],
  ])('%s: no-op (suportado = false, bloqueio 0) e não observa nada', (_nome, tipos) => {
    const { f, Observador } = observadorFalso(tipos)
    const vigia = criarVigiaDoMainThread({ Observador, agoraMs: () => 0 })
    expect(vigia.suportado).toBe(false)
    expect(f.pedidos).toEqual([])
    expect(vigia.bloqueioRecenteMs(10_000)).toBe(0)
  })

  it('sem PerformanceObserver: no-op', () => {
    const vigia = criarVigiaDoMainThread({ Observador: null })
    expect(vigia.suportado).toBe(false)
    expect(vigia.bloqueioRecenteMs(10_000)).toBe(0)
    expect(() => vigia.parar()).not.toThrow()
  })

  it('observe recusado (política, navegador velho): no-op, nunca lança', () => {
    const { Observador } = observadorFalso(['long-animation-frame'], { observeLanca: true })
    const vigia = criarVigiaDoMainThread({ Observador, agoraMs: () => 0 })
    expect(vigia.suportado).toBe(false)
    expect(vigia.bloqueioRecenteMs(10_000)).toBe(0)
  })

  it('não guarda o que já saiu de qualquer janela útil (memória limitada numa sessão longa)', () => {
    const { f, Observador } = observadorFalso(['long-animation-frame'])
    let agora = 0
    const vigia = criarVigiaDoMainThread({ Observador, agoraMs: () => agora })
    for (let i = 0; i < 5_000; i++) {
      agora = i * 100
      f.entregar([{ startTime: agora - 130, duration: 80, blockingDuration: 30 }])
    }
    // Um quadro longo a cada 100 ms: em 10 s cabem 100 deles, 100 × 30 ms.
    expect(vigia.bloqueioRecenteMs(10_000)).toBe(3_000)
    expect(vigia.guardados()).toBeLessThanOrEqual(1_000)
  })

  it('parar desconecta o observador e zera o que foi guardado', () => {
    const { f, Observador } = observadorFalso(['long-animation-frame'])
    const vigia = criarVigiaDoMainThread({ Observador, agoraMs: () => 1_000 })
    f.entregar([{ startTime: 0, duration: 500, blockingDuration: 450 }])
    vigia.parar()
    expect(f.desconectado).toBe(true)
    expect(vigia.bloqueioRecenteMs(10_000)).toBe(0)
  })
})
