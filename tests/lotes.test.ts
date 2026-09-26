/**
 * Helper de lotes do SQLite (`server/db/lotes.ts`).
 *
 * O libsql compila o SQLite com `MAX_VARIABLE_NUMBER = 32766`: uma instrução com mais `?` do que
 * isso falha inteira com "too many SQL variables". Estes testes prendem a aritmética dos lotes —
 * nenhum lote pode passar do teto, nenhum item pode sumir ou repetir.
 */
import { describe, expect, it } from 'vitest'

import { emLotes, LIMITE_DE_VARIAVEIS_SQLITE, tamanhoDoLote, VARIAVEIS_POR_INSTRUCAO } from '../server/db/lotes'

describe('tamanhoDoLote', () => {
  it('cabe no teto do libsql com margem', () => {
    expect(LIMITE_DE_VARIAVEIS_SQLITE).toBe(32_766)
    expect(VARIAVEIS_POR_INSTRUCAO).toBeLessThan(LIMITE_DE_VARIAVEIS_SQLITE)
  })

  it('divide o orçamento pelo número de variáveis por item', () => {
    expect(tamanhoDoLote(17)).toBe(Math.floor(VARIAVEIS_POR_INSTRUCAO / 17))
    expect(tamanhoDoLote(1)).toBe(VARIAVEIS_POR_INSTRUCAO)
  })

  it('desconta as variáveis fixas da instrução (as do WHERE)', () => {
    expect(tamanhoDoLote(1, 2)).toBe(VARIAVEIS_POR_INSTRUCAO - 2)
    expect(tamanhoDoLote(10, 5)).toBe(Math.floor((VARIAVEIS_POR_INSTRUCAO - 5) / 10))
  })

  it('o pior caso de um lote cheio nunca passa do teto', () => {
    for (const colunas of [1, 2, 3, 7, 17, 24, 100]) {
      for (const fixas of [0, 1, 3]) {
        expect(tamanhoDoLote(colunas, fixas) * colunas + fixas).toBeLessThanOrEqual(LIMITE_DE_VARIAVEIS_SQLITE)
      }
    }
  })

  it('recusa entrada sem sentido em vez de devolver lote 0 (laço infinito) ou NaN', () => {
    expect(() => tamanhoDoLote(0)).toThrow()
    expect(() => tamanhoDoLote(-1)).toThrow()
    expect(() => tamanhoDoLote(1.5)).toThrow()
    expect(() => tamanhoDoLote(VARIAVEIS_POR_INSTRUCAO + 1)).toThrow()
    expect(() => tamanhoDoLote(1, VARIAVEIS_POR_INSTRUCAO)).toThrow()
  })
})

describe('emLotes', () => {
  it('lista vazia → nenhum lote', () => {
    expect(emLotes([], 10)).toEqual([])
  })

  it('divide preservando a ordem, sem perder nem repetir item', () => {
    const itens = Array.from({ length: 23 }, (_, i) => i)
    const lotes = emLotes(itens, 5)
    expect(lotes.map((l) => l.length)).toEqual([5, 5, 5, 5, 3])
    expect(lotes.flat()).toEqual(itens)
  })

  it('exatamente no limite → um lote só; um a mais → dois', () => {
    expect(emLotes([1, 2, 3], 3)).toEqual([[1, 2, 3]])
    expect(emLotes([1, 2, 3, 4], 3)).toEqual([[1, 2, 3], [4]])
  })

  it('recusa tamanho inválido', () => {
    expect(() => emLotes([1], 0)).toThrow()
    expect(() => emLotes([1], Number.NaN)).toThrow()
  })
})
