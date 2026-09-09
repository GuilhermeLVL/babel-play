import { describe, expect, it } from 'vitest'

import { ALVO_MAX, ALVO_MIN,faixaAuto } from '../src/core/minigames/autoDificuldade'

describe('dificuldade automática', () => {
  it('novato começa em fácil, com motivo', () => {
    const d = faixaAuto({ ultimasPrecisoes: [] })
    expect(d.faixa).toBe('facil')
    expect(d.motivo).toMatch(/Fácil/)
  })
  it('sobe um degrau com ≥ 90% nas últimas 3, desce com < 70%, mantém no meio', () => {
    expect(faixaAuto({ ultimasPrecisoes: [100, 95, 90], faixaAtual: 'facil' }).faixa).toBe('medio')
    expect(faixaAuto({ ultimasPrecisoes: [100, 95, 90], faixaAtual: 'medio' }).faixa).toBe('dificil')
    expect(faixaAuto({ ultimasPrecisoes: [100, 95, 90], faixaAtual: 'dificil' }).faixa).toBe('dificil') // teto
    expect(faixaAuto({ ultimasPrecisoes: [50, 60, 65], faixaAtual: 'medio' }).faixa).toBe('facil')
    expect(faixaAuto({ ultimasPrecisoes: [50, 60, 65], faixaAtual: 'facil' }).faixa).toBe('facil') // piso
    const m = faixaAuto({ ultimasPrecisoes: [80, 85, 75], faixaAtual: 'medio' })
    expect(m.faixa).toBe('medio')
    expect(m.motivo).toMatch(new RegExp(`${ALVO_MIN}-${ALVO_MAX}`))
  })
  it('com menos de 3 rodadas mantém e diz quantas faltam', () => {
    const d = faixaAuto({ ultimasPrecisoes: [100], faixaAtual: 'facil' })
    expect(d.faixa).toBe('facil')
    expect(d.motivo).toMatch(/faltam 2/)
  })
  it('só olha as últimas 3', () => {
    expect(faixaAuto({ ultimasPrecisoes: [0, 0, 100, 100, 100], faixaAtual: 'facil' }).faixa).toBe('medio')
  })
})
