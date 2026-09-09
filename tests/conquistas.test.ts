// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { avaliarConquistas, conquistaDoCosmetico, CONQUISTAS, type ContextoDeConquistas,progressoDasConquistas } from '../src/core/learning/conquistas'
import type { AppMetrics } from '../src/core/learning/contract'
import { conquistasDesbloqueadas } from '../src/lib/conquistasPosse'
import { CATALOGO_DA_LOJA } from '../src/lib/loja'

function metricas(p: Partial<AppMetrics> = {}): AppMetrics {
  return {
    sessions: 0, wordsCaptured: 0, reviews: 0, correctReviews: 0, drillItems: 0, drillCorrect: 0,
    seedsGastas: 0, streakDays: 0, dueToday: 0, newCards: 0, deckSize: 0, uniqueWords: 0,
    speakingMs: 0, wpm: 0, wpmConfidence: 0, accuracy: 0, accuracyConfidence: 0, avgStability: 0,
    avgRetention: 0, avgRetentionConfidence: 0, levelConfidence: 0, levelDistribution: [], vocabByWeek: [],
    asOf: 0, escopo: 'global', base: { considerados: 0, total: 0 }, ...p,
  }
}
function ctx(p: Partial<AppMetrics> = {}, extra: Partial<ContextoDeConquistas> = {}): ContextoDeConquistas {
  return { metricas: metricas(p), nivel: 1, melhorComboPorJogo: {}, eventosVistos: 0, totalDeEventos: 11, idiomas: 0, compras: 0, ...extra }
}

describe('catálogo de conquistas', () => {
  it('ids únicos, recompensas positivas, e todo cosmético exclusivo existe na Loja sem preço', () => {
    expect(new Set(CONQUISTAS.map((c) => c.id)).size).toBe(CONQUISTAS.length)
    for (const c of CONQUISTAS) {
      expect(c.recompensa.seeds, c.id).toBeGreaterThan(0)
      if (c.recompensa.cosmetico) {
        const item = CATALOGO_DA_LOJA.find((i) => i.id === c.recompensa.cosmetico)
        expect(item, `${c.id} → ${c.recompensa.cosmetico}`).toBeTruthy()
        expect(item!.precoSeeds).toBeUndefined()
        expect(item!.exclusivoDe).toBe(c.id)
      }
    }
    // e todo exclusivo da Loja aponta para uma conquista real
    for (const i of CATALOGO_DA_LOJA.filter((x) => x.exclusivoDe)) expect(conquistaDoCosmetico(i.id)?.id).toBe(i.exclusivoDe)
  })

  it('progresso é limitado à meta e vira conquistada no ≥', () => {
    const p = progressoDasConquistas(ctx({ sessions: 3 }))
    const primeira = p.find((x) => x.conquista.id === 'primeira-captura')!
    expect(primeira).toMatchObject({ atual: 1, meta: 1, pct: 100, conquistada: true })
    const revisor = p.find((x) => x.conquista.id === 'revisor')!
    expect(revisor.conquistada).toBe(false)
    expect(revisor.pct).toBe(0)
  })

  it('condições: ouvinte por minutos, perfeccionista por rodadas, duelista por combo, poliglota por idiomas', () => {
    const feitas = (c: ContextoDeConquistas) => avaliarConquistas(c, new Set()).map((x) => x.id)
    expect(feitas(ctx({ capturaMinutos: 60 }))).toContain('ouvinte')
    expect(feitas(ctx({ capturaMinutos: 59 }))).not.toContain('ouvinte')
    expect(feitas(ctx({ rodadasPerfeitas: 10 }))).toEqual(expect.arrayContaining(['sem-erro', 'perfeccionista']))
    expect(feitas(ctx({}, { melhorComboPorJogo: { blitz: 15 } }))).toContain('duelista')
    expect(feitas(ctx({}, { idiomas: 2 }))).toContain('poliglota')
    expect(feitas(ctx({ maiorSequenciaPresenca: 30 }))).toEqual(expect.arrayContaining(['maratonista', 'constante']))
    expect(feitas(ctx({}, { eventosVistos: 11, totalDeEventos: 11 }))).toContain('colecionador')
    expect(feitas(ctx({}, { nivel: 10 }))).toEqual(expect.arrayContaining(['nivel-5', 'nivel-10']))
  })

  it('já desbloqueadas não voltam', () => {
    expect(avaliarConquistas(ctx({ sessions: 1 }), new Set(['primeira-captura']))).toEqual([])
  })
})

describe('cliente: crédito antes da posse', () => {
  beforeEach(() => { localStorage.removeItem('babel.conquistas'); localStorage.removeItem('babel.conquistas_datas'); vi.resetModules() })

  it('sem crédito no servidor, a conquista NÃO é marcada (fica para a próxima)', async () => {
    vi.doMock('../src/data/api', () => ({ creditarSeeds: vi.fn(async () => null), fetchRecordes: vi.fn() }))
    const { verificarConquistas } = await import('../src/lib/conquistas')
    const feitas = await verificarConquistas(ctx({ sessions: 1 }))
    expect(feitas).toEqual([])
    expect(conquistasDesbloqueadas().has('primeira-captura')).toBe(false)
  })

  it('com crédito, marca uma vez e credita com id idempotente', async () => {
    const creditar = vi.fn(async () => ({ jaExistia: false, seedsCreditadas: 25, xpCreditado: 30 }))
    vi.doMock('../src/data/api', () => ({ creditarSeeds: creditar, fetchRecordes: vi.fn() }))
    const { verificarConquistas } = await import('../src/lib/conquistas')
    const feitas = await verificarConquistas(ctx({ sessions: 1 }))
    expect(feitas.map((c) => c.id)).toEqual(['primeira-captura'])
    /* O CORPO É SÓ O `creditoId`. `amount` e `xp` saíram da chamada em 07/09: quem decide quanto
       vale é `valorDoCredito`, no servidor. Enquanto o valor viajava daqui, este teste provava
       que o cliente mandava o número certo — e o que importava era ele não mandar número nenhum. */
    expect(creditar).toHaveBeenCalledWith({ creditoId: 'conquista-primeira-captura' })
    expect(conquistasDesbloqueadas().has('primeira-captura')).toBe(true)
    // segunda avaliação: nada novo, nada creditado de novo
    expect(await verificarConquistas(ctx({ sessions: 1 }))).toEqual([])
    expect(creditar).toHaveBeenCalledTimes(1)
  })
})
