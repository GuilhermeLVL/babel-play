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

import {
  criarVigiaDoMainThread,
  marcarAberturaDoVad,
  MEDIDA_DA_ABERTURA_DO_VAD,
} from '../src/lib/captura/vigiaDoMainThread'

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

  /* A ABERTURA DO VAD (A6c). `MicVAD.new` cria a sessão do Silero, e a 1ª sessão do ORT instancia o
     WASM de 12 MB NA THREAD PRINCIPAL: um quadro de ~170 ms no desktop e ~880 ms com a CPU 4× mais
     lenta, sem script atribuído no LoAF. Acontece uma vez, antes da 1ª fala, e cortar parciais não o
     cura — então não é travamento. Só ele sai da conta: o que começa DENTRO da abertura. */
  it('o quadro que começa dentro da abertura do VAD não conta; os de antes e de depois, sim', () => {
    const { f, Observador } = observadorFalso(['long-animation-frame'])
    const vigia = criarVigiaDoMainThread({
      Observador,
      agoraMs: () => 12_000,
      quadrosConhecidos: () => [{ inicioMs: 4_000, fimMs: 5_900 }],
    })
    f.entregar([
      { startTime: 5_000, duration: 840, blockingDuration: 790 }, // o WASM do Silero instanciando
      { startTime: 3_800, duration: 300, blockingDuration: 250 }, // começou antes da abertura: conta
      { startTime: 6_000, duration: 180, blockingDuration: 130 }, // depois dela: conta
    ])
    expect(vigia.bloqueioRecenteMs(10_000)).toBe(380)
  })

  it('a abertura marcada DEPOIS de o quadro chegar também vale (a medida sai no fim do MicVAD.new)', () => {
    const { f, Observador } = observadorFalso(['long-animation-frame'])
    const conhecidos: Array<{ inicioMs: number; fimMs: number }> = []
    const vigia = criarVigiaDoMainThread({ Observador, agoraMs: () => 8_000, quadrosConhecidos: () => conhecidos })
    f.entregar([{ startTime: 5_000, duration: 840, blockingDuration: 790 }])
    expect(vigia.bloqueioRecenteMs(10_000)).toBe(790)
    conhecidos.push({ inicioMs: 4_000, fimMs: 5_900 })
    expect(vigia.bloqueioRecenteMs(10_000)).toBe(0)
  })

  it('`marcarAberturaDoVad` grava uma medida do User Timing, e o vigia de fábrica a lê', () => {
    const { f, Observador } = observadorFalso(['long-animation-frame'])
    try {
      marcarAberturaDoVad(100, 2_000)
      expect(performance.getEntriesByName(MEDIDA_DA_ABERTURA_DO_VAD, 'measure')).toHaveLength(1)
      const vigia = criarVigiaDoMainThread({ Observador, agoraMs: () => 5_000 })
      f.entregar([
        { startTime: 900, duration: 900, blockingDuration: 850 }, // dentro
        { startTime: 2_200, duration: 200, blockingDuration: 150 }, // fora
      ])
      expect(vigia.bloqueioRecenteMs(10_000)).toBe(150)
    } finally {
      performance.clearMeasures(MEDIDA_DA_ABERTURA_DO_VAD)
    }
  })

  it('`marcarAberturaDoVad` nunca lança (navegador sem User Timing de nível 3)', () => {
    expect(() => marcarAberturaDoVad(Number.NaN, -1)).not.toThrow()
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
