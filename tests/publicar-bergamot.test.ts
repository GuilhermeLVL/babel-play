import { describe, expect, it } from 'vitest'

import { selecionarPares, todosOsPares } from '../scripts/modelos/publicar-bergamot-no-r2'

const todos = Object.keys(todosOsPares())

describe('selecionarPares (--pares do publicar-bergamot-no-r2)', () => {
  it.each([['all'], [''], [undefined], [' all '], ['all,es-en']])('%j = todos os pares', (v) => {
    expect(selecionarPares(v)).toEqual(todos)
  })
  it('lista explícita escolhe só os pedidos', () => {
    expect(selecionarPares('es-en,fr-en')).toEqual(['es-en', 'fr-en'])
  })
  it('par desconhecido lança com a lista dos conhecidos', () => {
    expect(() => selecionarPares('ja-ne')).toThrow(/ja-ne[\s\S]*es-en/)
  })
  it('há ao menos os 15 pares do CDN', () => {
    expect(todos.length).toBeGreaterThanOrEqual(15)
  })
})
