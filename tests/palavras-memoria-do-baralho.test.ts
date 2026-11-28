import { describe, expect, it } from 'vitest'

import { MINIMO_DE_REVISOES, quandoVolta, retencaoDoBaralho } from '../src/core/palavras/memoriaDoBaralho'

describe('retenção por baralho', () => {
  it('sem número com menos de 20 revisões', () => {
    expect(MINIMO_DE_REVISOES).toBe(20)
    expect(retencaoDoBaralho({ revisoes: 19, lembradas: 19 })).toBeNull()
    expect(retencaoDoBaralho({ revisoes: 0, lembradas: 0 })).toBeNull()
    expect(retencaoDoBaralho({ revisoes: Number.NaN, lembradas: 0 })).toBeNull()
  })
  it('com 20 ou mais, a porcentagem inteira e dentro de 0 a 100', () => {
    expect(retencaoDoBaralho({ revisoes: 20, lembradas: 18 })).toBe(90)
    expect(retencaoDoBaralho({ revisoes: 30, lembradas: 24 })).toBe(80)
    expect(retencaoDoBaralho({ revisoes: 20, lembradas: 99 })).toBe(100)
    expect(retencaoDoBaralho({ revisoes: 20, lembradas: 0 })).toBe(0)
  })
  it('dois baralhos de retenção diferente não se misturam', () => {
    expect(retencaoDoBaralho({ revisoes: 40, lembradas: 38 })).toBe(95)
    expect(retencaoDoBaralho({ revisoes: 25, lembradas: 15 })).toBe(60)
  })
})

describe('próxima revisão do baralho', () => {
  const DIA = 86_400_000
  const inicio = 10 * DIA
  const agora = inicio + 5 * 3_600_000
  it('nenhuma, agora, hoje, amanhã e em N dias', () => {
    expect(quandoVolta(null, agora, inicio)).toEqual({ quando: 'nenhuma' })
    expect(quandoVolta(agora - 1, agora, inicio)).toEqual({ quando: 'agora' })
    expect(quandoVolta(inicio + 20 * 3_600_000, agora, inicio)).toEqual({ quando: 'hoje' })
    expect(quandoVolta(inicio + DIA + 1000, agora, inicio)).toEqual({ quando: 'amanha' })
    expect(quandoVolta(inicio + 4 * DIA + 1000, agora, inicio)).toEqual({ quando: 'em', dias: 4 })
  })
})
