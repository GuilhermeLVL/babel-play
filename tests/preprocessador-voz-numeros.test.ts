import { describe, expect, it } from 'vitest'

import { cardinalPt, dataPt, moedaPt, ordinalPt, romanoParaNumero } from '../src/core/leitura/numerosPt'

describe('numerosPt', () => {
  it.each<[number, string, ('m' | 'f')?]>([
    [0, 'zero'],
    [1, 'um'],
    [1, 'uma', 'f'],
    [2, 'duas', 'f'],
    [10, 'dez'],
    [15, 'quinze'],
    [21, 'vinte e um'],
    [99, 'noventa e nove'],
    [100, 'cem'],
    [101, 'cento e um'],
    [200, 'duzentos'],
    [200, 'duzentas', 'f'],
    [999, 'novecentos e noventa e nove'],
    [1000, 'mil'],
    [1001, 'mil e um'],
    [1100, 'mil e cem'],
    [1101, 'mil cento e um'],
    [1889, 'mil oitocentos e oitenta e nove'],
    [2000, 'dois mil'],
    [2024, 'dois mil e vinte e quatro'],
    [21000, 'vinte e um mil'],
    [100000, 'cem mil'],
    [1000000, 'um milhão'],
    [2000000, 'dois milhões'],
    [1000001, 'um milhão e um'],
    [1500000, 'um milhão e quinhentos mil'],
    [1000000000, 'um bilhão'],
    [3000000000, 'três bilhões'],
  ])('cardinalPt: %i', (n, esperado, genero) => {
    expect(cardinalPt(n, genero)).toBe(esperado)
  })

  it.each<[number, string, ('m' | 'f')?]>([
    [1, 'primeiro'],
    [1, 'primeira', 'f'],
    [2, 'segundo'],
    [10, 'décimo'],
    [21, 'vigésimo primeiro'],
    [100, 'centésimo'],
    [123, 'centésimo vigésimo terceiro'],
    [3, 'terceira', 'f'],
  ])('ordinalPt: %i', (n, esperado, genero) => {
    expect(ordinalPt(n, genero)).toBe(esperado)
  })

  it.each<[string, number | null]>([
    ['IV', 4],
    ['XIX', 19],
    ['MCMXC', 1990],
    ['XIV', 14],
    ['IIII', null],
    ['ABC', null],
    ['', null],
  ])('romanoParaNumero: "%s"', (s, esperado) => {
    expect(romanoParaNumero(s)).toBe(esperado)
  })

  it.each<[number, number, 'BRL' | 'USD', string]>([
    [1234, 56, 'BRL', 'mil duzentos e trinta e quatro reais e cinquenta e seis centavos'],
    [1, 0, 'BRL', 'um real'],
    [0, 50, 'BRL', 'cinquenta centavos'],
    [0, 1, 'BRL', 'um centavo'],
    [5, 0, 'USD', 'cinco dólares'],
    [1, 0, 'USD', 'um dólar'],
    [1000000, 0, 'BRL', 'um milhão de reais'],
  ])('moedaPt: %i,%i %s', (r, c, m, esperado) => {
    expect(moedaPt(r, c, m)).toBe(esperado)
  })

  it.each<[number, number, number | null, string]>([
    [12, 3, 1889, 'doze de março de mil oitocentos e oitenta e nove'],
    [1, 5, null, 'primeiro de maio'],
    [2, 5, null, 'dois de maio'],
  ])('dataPt: %i/%i/%s', (d, m, a, esperado) => {
    expect(dataPt(d, m, a)).toBe(esperado)
  })
})
