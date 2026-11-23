/**
 * AS MARCAS `frasy:*` DO LABORATÓRIO DE LATÊNCIA DA LEGENDA (`lab-medicao-legenda-traduzida`, tarefas 2.1 e 2.6).
 *
 * Prova: nenhuma marca leva texto (o tipo do `detail` só tem `modelo`, `id` e `origem` como string, e o `marcar` descarta
 * o resto em execução), a marca pode ser posta no instante de um quadro passado, a carga de um modelo sai nas três fases
 * em ordem, e a instrumentação custa pouco (≤ 0,2 ms p95 por marca; 200 falas retêm ≤ 50 KB).
 */
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { capMetrics } from '../src/gateway/capture/captureMetrics'
import {
  type DetalheDaMarca,
  FASES_DE_CARGA,
  iniciarFasesDeCarga,
  limparMarcasConsumidas,
  marcar,
  marcarParcial,
  MOTORES_DE_PARCIAL,
  ORIGENS_DA_LEGENDA,
} from '../src/gateway/marcasDeDesempenho'

beforeEach(() => {
  performance.clearMarks()
  limparMarcasConsumidas()
  capMetrics.reset()
  capMetrics.drenarLegenda()
})
afterEach(() => vi.restoreAllMocks())

const marcas = (prefixo = 'frasy:') =>
  (performance.getEntriesByType('mark') as PerformanceMark[]).filter((m) => m.name.startsWith(prefixo))

describe('o detalhe de uma marca não tem texto livre', () => {
  it('no tipo: só `modelo`, `id` e `origem` são string (e `origem` é de lista fechada)', () => {
    type Strings = {
      [K in keyof DetalheDaMarca]-?: NonNullable<DetalheDaMarca[K]> extends string ? K : never
    }[keyof DetalheDaMarca]
    // `motor` é string de lista fechada (`MOTORES_DE_PARCIAL`), como `origem`.
    expectTypeOf<Strings>().toEqualTypeOf<'modelo' | 'id' | 'origem' | 'motor'>()
    expectTypeOf<NonNullable<DetalheDaMarca['motor']>>().toEqualTypeOf<'local' | 'whisper' | 'moonshine' | 'parakeet'>()
    expectTypeOf<NonNullable<DetalheDaMarca['origem']>>().toEqualTypeOf<
      'memoria' | 'dicionario' | 'nativo' | 'local' | 'nuvem'
    >()
    expect(ORIGENS_DA_LEGENDA).toEqual(['memoria', 'dicionario', 'nativo', 'local', 'nuvem'])
  })

  it('em execução: campo de texto e origem inventada são descartados', () => {
    marcar('legenda:traduzida', { id: 'mic-1', origem: 'nuvem', texto: 'bom dia', traducao: 'good morning' } as never)
    marcar('legenda:traduzida', { id: 'mic-2', origem: 'qualquer coisa' } as never)
    const [a, b] = marcas()
    expect(a.detail).toEqual({ id: 'mic-1', origem: 'nuvem' })
    expect(b.detail).toEqual({ id: 'mic-2' })
  })

  it('o id é cortado (nada de frase passando por id)', () => {
    marcar('fala:fim', { id: 'x'.repeat(500) })
    expect((marcas()[0].detail as { id: string }).id).toHaveLength(64)
  })
})

describe('frasy:parcial (parciais-incrementais, 1.4)', () => {
  it('leva só números e o motor da lista fechada; nenhuma marca leva texto', () => {
    marcarParcial({ motor: 'whisper', indice: 2, palavras: 5, confirmadas: 3 })
    marcar('parcial', { motor: 'invento', indice: 1, texto: 'bom dia', frase: 'x', palavras: 'cinco' } as never)
    const [a, b] = marcas('frasy:parcial')
    expect(a.name).toBe('frasy:parcial')
    expect(a.detail).toEqual({ motor: 'whisper', indice: 2, palavras: 5, confirmadas: 3 })
    expect(b.detail).toEqual({ indice: 1 })
    expect(MOTORES_DE_PARCIAL).toEqual(['local', 'whisper', 'moonshine', 'parakeet'])
    for (const m of marcas())
      for (const v of Object.values(m.detail as object))
        expect(typeof v === 'string' ? MOTORES_DE_PARCIAL.concat(['mic-1'] as never).includes(v as never) : true).toBe(
          true,
        )
  })

  it('conta em `captureMetrics.summary().parciais` e zera no reset', () => {
    marcarParcial({ motor: 'local', indice: 1, palavras: 4 })
    marcarParcial({ motor: 'local', indice: 2, palavras: 6, confirmadas: 2 })
    expect(capMetrics.summary().parciais).toEqual({ pintados: 2, palavras: 10, confirmadas: 2 })
    capMetrics.reset()
    expect(capMetrics.summary().parciais).toEqual({ pintados: 0, palavras: 0, confirmadas: 0 })
  })

  it('a linha do tempo não cresce sem fim: no máximo 200 marcas de parcial', () => {
    for (let i = 0; i < 450; i++) marcarParcial({ motor: 'local', indice: i, palavras: 3 })
    expect(marcas('frasy:parcial').length).toBeLessThanOrEqual(200)
  })

  it('custa no máximo 0,2 ms no p95 (10 000 chamadas)', () => {
    const custos: number[] = []
    for (let i = 0; i < 10_000; i++) {
      const t0 = performance.now()
      marcarParcial({ motor: 'local', indice: i, palavras: 5, confirmadas: 2 })
      custos.push(performance.now() - t0)
    }
    custos.sort((a, b) => a - b)
    expect(custos[Math.floor(custos.length * 0.95)]).toBeLessThanOrEqual(0.2)
  })
})

describe('marcar', () => {
  it('leva a marca ao instante do quadro (`startTime`), não ao da decisão', () => {
    const t = performance.now()
    while (performance.now() - t < 5); // a decisão do VAD vem DEPOIS do último quadro de voz
    marcar('fala:fim', { id: 'mic-3' }, t)
    const [m] = marcas()
    expect(m.name).toBe('frasy:fala:fim')
    expect(m.startTime).toBeCloseTo(t, 3)
  })

  it('sem `performance.mark`, nada acontece', () => {
    vi.stubGlobal('performance', { now: () => 0 })
    expect(() => marcar('fala:fim', { id: 'mic-1' })).not.toThrow()
    vi.unstubAllGlobals()
  })

  it('a linha do tempo não cresce sem fim: as marcas de fala e legenda ficam em até 200', () => {
    for (let i = 0; i < 450; i++) {
      marcar('fala:fim', { id: `mic-${i}` })
      marcar('legenda:traduzida', { id: `mic-${i}`, origem: 'local' })
    }
    expect(marcas('frasy:fala:fim').length).toBeLessThanOrEqual(200)
    expect(marcas('frasy:legenda:traduzida').length).toBeLessThanOrEqual(200)
    // A mais nova nunca se perde.
    expect((marcas('frasy:fala:fim').at(-1)!.detail as { id: string }).id).toBe('mic-449')
  })
})

describe('a carga de um modelo em três fases', () => {
  it('as seis marcas saem em ordem, com `{ modelo }`, e cada fase vira número em `captureMetrics`', () => {
    const f = iniciarFasesDeCarga('Xenova/opus-mt-en-es')
    f.para('compilacao')
    f.para('aquecimento')
    f.fim()
    expect(marcas('frasy:modelo').map((m) => m.name)).toEqual(
      FASES_DE_CARGA.flatMap((fase) => [`frasy:modelo:${fase}:inicio`, `frasy:modelo:${fase}:fim`]),
    )
    expect(
      marcas('frasy:modelo').every((m) => (m.detail as { modelo: string }).modelo === 'Xenova/opus-mt-en-es'),
    ).toBe(true)
    expect(capMetrics.drenarLegenda().carga.map((c) => [c.modelo, c.fase])).toEqual(
      FASES_DE_CARGA.map((fase) => ['Xenova/opus-mt-en-es', fase]),
    )
  })

  it('fase pulada fecha com duração zero (as seis marcas existem sempre) e o que vem depois do fim é ignorado', () => {
    const f = iniciarFasesDeCarga('bergamot-pt-en')
    f.fim()
    f.para('compilacao')
    f.fim()
    expect(marcas('frasy:modelo')).toHaveLength(6)
  })
})

describe('overhead da instrumentação (2.6)', () => {
  it('cada marca custa no máximo 0,2 ms no p95 (10 000 chamadas)', () => {
    const custos: number[] = []
    for (let i = 0; i < 10_000; i++) {
      const t0 = performance.now()
      marcar('mt:pedido', { id: `mic-${i}`, modelo: 'Xenova/opus-mt-en-es', fila: 0 })
      custos.push(performance.now() - t0)
    }
    custos.sort((a, b) => a - b)
    const p95 = custos[Math.floor(custos.length * 0.95)]
    expect(p95).toBeLessThanOrEqual(0.2)
  })

  it('uma sessão de 200 falas retém no máximo 50 KB (marcas na linha do tempo + números acumulados)', () => {
    for (let i = 0; i < 200; i++) {
      const id = `mic-${i}`
      const fim = performance.now()
      marcar('fala:fim', { id }, fim)
      capMetrics.fimDaVoz(id, fim)
      marcar('legenda:traduzida', { id, origem: 'local' })
      capMetrics.legendaTraduzida(id, 'local', fim + 900)
    }
    const naLinhaDoTempo = JSON.stringify(marcas())
    const acumulado = JSON.stringify(capMetrics.drenarLegenda())
    expect(naLinhaDoTempo.length + acumulado.length).toBeLessThanOrEqual(50 * 1024)
    // Consumido o lote, nada fica esperando desfecho.
    capMetrics.legendaTraduzida('mic-0', 'local', performance.now())
    expect(capMetrics.drenarLegenda().fimDaFalaAteLegendaMs).toEqual([])
  })
})
