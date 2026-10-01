/**
 * O INTÉRPRETE TEM PORTA PRÓPRIA (pedido do dono, 30/09: "no canto do cabeçalho da captura ele passa
 * despercebido; quero uma categoria no menu lateral").
 *   - no menu lateral, logo depois de Capturar (Biblioteca continua no grupo principal);
 *   - na barra de baixo do celular, no lugar da Biblioteca, que vai para a folha "Mais" (decisão do
 *     dono: a barra tem cinco lugares);
 *   - endereço próprio, `/intérprete` sem acento: `/interprete`.
 */
import { describe, expect, it } from 'vitest'

import { itensDaDock, itensDaFolhaMais, NAV_ITEMS } from '../src/components/shell/navItems'
import { estadoParaUrl, urlParaEstado } from '../src/lib/rotas'

describe('o Intérprete no menu', () => {
  it('fica logo depois de Capturar no menu lateral', () => {
    const ids = NAV_ITEMS.map((i) => i.id)
    expect(ids.indexOf('interprete')).toBe(ids.indexOf('capture') + 1)
  })

  it('no menu lateral, a Biblioteca continua no grupo principal', () => {
    const principais = NAV_ITEMS.filter((i) => !i.secondary).map((i) => i.id)
    expect(principais).toEqual(['hub', 'capture', 'interprete', 'play', 'library', 'metrics'])
  })

  it('na barra do celular: cinco lugares, com o Intérprete no lugar da Biblioteca', () => {
    expect(itensDaDock().map((i) => i.id)).toEqual(['hub', 'capture', 'interprete', 'play', 'metrics'])
  })

  it('a Biblioteca vai para a folha "Mais", em primeiro', () => {
    expect(itensDaFolhaMais()[0].id).toBe('library')
  })
})

describe('o endereço do Intérprete', () => {
  it('ida e volta: /interprete', () => {
    expect(estadoParaUrl({ view: 'interprete' })).toBe('/interprete')
    expect(urlParaEstado('/interprete')).toEqual({ view: 'interprete' })
  })
})
