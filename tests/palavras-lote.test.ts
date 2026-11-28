import { describe, expect, it } from 'vitest'

import { etiquetasDepoisDoLote, idsDoLote, LIMITE_DO_LOTE } from '../src/core/palavras/lote'

describe('seleção em massa (regras puras)', () => {
  it('tira ids repetidos mantendo a ordem', () => {
    expect(idsDoLote(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c'])
    expect(LIMITE_DO_LOTE).toBe(50)
  })
  it('adiciona e remove etiquetas sem duplicar', () => {
    expect(etiquetasDepoisDoLote(['filme', 'viagem'], ['#Viagem', 'Trabalho'], ['filme'])).toEqual([
      'viagem',
      'trabalho',
    ])
  })
  it('recusa etiqueta inválida e passar de 10', () => {
    expect(etiquetasDepoisDoLote([], ['###'], [])).toBeNull()
    const dez = Array.from({ length: 10 }, (_, i) => `e${i}`)
    expect(etiquetasDepoisDoLote(dez, ['nova'], [])).toBeNull()
    expect(etiquetasDepoisDoLote(dez, ['nova'], ['e0'])).toHaveLength(10)
  })
})
