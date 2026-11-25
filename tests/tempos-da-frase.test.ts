import { describe, expect, it } from 'vitest'

import { fimDaFrase, inicioDaFrase, temposUsaveis } from '../src/core/learning/temposDaFrase'

const f = (...t: number[]) => t.map((startTime) => ({ startTime }))

describe('temposDaFrase', () => {
  it('caso bom: crescente, frases de 0,5 s a 15 s', () => {
    expect(temposUsaveis(f(0, 2, 5, 9), 12)).toEqual({ usavel: true, motivo: null, indice: null })
  })

  it('caso ruim: frase de 40 s', () => {
    expect(temposUsaveis(f(0, 40, 42), 45)).toMatchObject({ usavel: false, motivo: 'frase-longa-demais', indice: 0 })
  })

  it('caso ruim: começo repetido ou voltando', () => {
    expect(temposUsaveis(f(0, 2, 2, 5))).toMatchObject({ usavel: false, motivo: 'nao-crescente', indice: 2 })
    expect(temposUsaveis(f(0, 5, 3))).toMatchObject({ usavel: false, motivo: 'nao-crescente', indice: 2 })
  })

  it('frase curta demais (menos de 0,5 s)', () => {
    expect(temposUsaveis([{ startTime: 0 }, { startTime: 0, inicioExato: 0.2 }, { startTime: 1 }])).toMatchObject({
      usavel: false,
      motivo: 'frase-curta-demais',
      indice: 0,
    })
  })

  it('sem falas', () => {
    expect(temposUsaveis([])).toMatchObject({ usavel: false, motivo: 'sem-falas' })
  })

  it('a última frase só é medida com a duração da mídia', () => {
    expect(temposUsaveis(f(0, 3)).usavel).toBe(true)
    expect(temposUsaveis(f(0, 3), 30).usavel).toBe(false)
  })

  it('usa o início exato quando existe e calcula o fim pela seguinte', () => {
    const falas = [
      { startTime: 1, inicioExato: 1.4 },
      { startTime: 3, inicioExato: 3.1 },
    ]
    expect(inicioDaFrase(falas[0])).toBe(1.4)
    expect(fimDaFrase(falas, 0)).toBe(3.1)
    expect(fimDaFrase(falas, 1)).toBeNull()
    expect(fimDaFrase(falas, 1, 9)).toBe(9)
    expect(fimDaFrase(falas, 7)).toBeNull()
  })

  it('uma legenda típica passa', () => {
    expect(temposUsaveis(f(0, 2, 4.5, 7, 10, 13), 16).usavel).toBe(true)
  })
})
