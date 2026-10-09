/**
 * O INTÉRPRETE TEM PORTA PRÓPRIA (pedido do dono, 30/09: "no canto do cabeçalho da captura ele passa
 * despercebido; quero uma categoria no menu lateral").
 *   - na lista de destinos, logo depois de Capturar (o trilho e a barra de cinco do celular, que o
 *     mostram, estão em `questCasca.test.tsx` e `polimentoCelular.test.tsx`);
 *   - endereço próprio, `/intérprete` sem acento: `/interprete`.
 */
import { describe, expect, it } from 'vitest'

import { NAV_ITEMS } from '../src/components/shell/navItems'
import { estadoParaUrl, urlParaEstado } from '../src/lib/rotas'

describe('o Intérprete no menu', () => {
  it('fica logo depois de Capturar na lista de destinos', () => {
    const ids = NAV_ITEMS.map((i) => i.id)
    expect(ids.indexOf('interprete')).toBe(ids.indexOf('capture') + 1)
  })
})

describe('o endereço do Intérprete', () => {
  it('ida e volta: /interprete', () => {
    expect(estadoParaUrl({ view: 'interprete' })).toBe('/interprete')
    expect(urlParaEstado('/interprete')).toEqual({ view: 'interprete' })
  })
})
