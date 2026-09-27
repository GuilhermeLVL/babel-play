// @vitest-environment jsdom
/**
 * "OFENSIVA EM RISCO" — o aviso que nunca disparava.
 *
 * `practicedToday` era `streakDays > 0`, e o aviso saía quando `streakDays > 0 && !practicedToday`:
 * uma contradição, logo nunca. Agora "estudou hoje" vem de atividade DATADA de hoje (revisão no
 * `revisoesRecentes`, rodada gravada neste navegador), e o aviso tem janela e teto.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import type { AppMetrics } from '../src/data/api'
import { estudouHoje, marcarEstudoHoje, podeAvisarOfensiva, registrarAvisoDeOfensiva } from '../src/lib/ofensiva'
import { deriveProgress } from '../src/lib/progress'

const base = (over: Partial<AppMetrics> = {}): AppMetrics =>
  ({
    sessions: 1,
    wordsCaptured: 0,
    deckSize: 0,
    newCards: 0,
    dueToday: 0,
    reviews: 0,
    correctReviews: 0,
    drillItems: 0,
    drillCorrect: 0,
    accuracy: 0,
    accuracyConfidence: 0,
    streakDays: 5,
    avgStability: 0,
    avgRetention: 0,
    avgRetentionConfidence: 0,
    vocabByWeek: [],
    speakingMs: 0,
    wpm: 0,
    wpmConfidence: 0,
    uniqueWords: 0,
    levelDistribution: [],
    levelConfidence: 0,
    asOf: Date.now(),
    ...over,
  }) as AppMetrics

const as = (h: number, dia = 24) => new Date(2026, 8, dia, h, 30)

describe('estudou hoje', () => {
  beforeEach(() => localStorage.clear())

  it('uma revisão datada de hoje conta; a de ontem não', () => {
    const agora = as(19).getTime()
    expect(estudouHoje([as(9).getTime()], agora)).toBe(true)
    expect(estudouHoje([as(9, 23).getTime()], agora)).toBe(false)
    expect(estudouHoje(undefined, agora)).toBe(false)
  })

  it('uma rodada gravada hoje conta, e a marca de ontem não', () => {
    marcarEstudoHoje(as(9, 23).getTime())
    expect(estudouHoje([], as(19).getTime())).toBe(false)
    marcarEstudoHoje(as(10).getTime())
    expect(estudouHoje([], as(19).getTime())).toBe(true)
  })

  it('deriveProgress não confunde ofensiva com ter estudado hoje', () => {
    expect(deriveProgress(base({ streakDays: 5 })).practicedToday).toBe(false)
    expect(deriveProgress(base({ streakDays: 5, revisoesRecentes: [Date.now()] })).practicedToday).toBe(true)
  })
})

describe('pode avisar a ofensiva', () => {
  beforeEach(() => localStorage.clear())

  const emRisco = { streakDays: 5, estudouHoje: false }

  it('avisa à noite quando há ofensiva e nada foi estudado hoje', () => {
    expect(podeAvisarOfensiva(emRisco, as(19))).toBe(true)
  })

  it('não avisa sem ofensiva, nem depois de estudar', () => {
    expect(podeAvisarOfensiva({ streakDays: 0, estudouHoje: false }, as(19))).toBe(false)
    expect(podeAvisarOfensiva({ streakDays: 5, estudouHoje: true }, as(19))).toBe(false)
  })

  it('nunca antes das 18h, nem entre 22h e 8h', () => {
    for (const h of [0, 3, 7, 8, 12, 17, 22, 23]) expect(podeAvisarOfensiva(emRisco, as(h))).toBe(false)
  })

  it('no máximo um aviso por dia, e no dia seguinte volta a poder', () => {
    registrarAvisoDeOfensiva(as(19))
    expect(podeAvisarOfensiva(emRisco, as(20))).toBe(false)
    expect(podeAvisarOfensiva(emRisco, as(19, 25))).toBe(true)
  })
})
