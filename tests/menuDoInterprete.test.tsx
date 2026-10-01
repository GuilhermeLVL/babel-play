// @vitest-environment jsdom
/**
 * O INTÉRPRETE NO MENU (relato do dono no celular, 2026-09-30: ele não achava como chegar ao modo
 * intérprete e o lado do inglês não respondia). Agora é uma tela do menu, logo abaixo de Capturar.
 *   - o item existe, depois de Capturar, no rail do computador;
 *   - no celular, a dock tem cinco lugares: o Intérprete entra nela, e a Biblioteca vai para o "Mais".
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import MobileNav from '../src/components/shell/MobileNav'
import { NAV_ITEMS } from '../src/components/shell/navItems'

afterEach(() => cleanup())

describe('o item Intérprete no menu', () => {
  it('vem logo depois de Capturar', () => {
    const ids = NAV_ITEMS.map((i) => i.id)
    expect(ids.indexOf('interprete')).toBe(ids.indexOf('capture') + 1)
  })

  it('tem o rótulo em todos os perfis', () => {
    const item = NAV_ITEMS.find((i) => i.id === 'interprete')!
    expect(item.short).toBe('Intérprete')
    expect(item.labels).toEqual({ kids: 'Intérprete', pro: 'Intérprete', senior: 'Intérprete' })
  })
})

describe('a dock do celular', () => {
  const montar = (activeView: 'hub' | 'interprete' | 'library' = 'hub') => {
    const onChangeView = vi.fn()
    render(<MobileNav activeView={activeView} onChangeView={onChangeView} ageProfile="pro" />)
    return { onChangeView, dock: screen.getByRole('navigation', { name: 'Navegação principal' }) }
  }

  it('os cinco lugares: Início, Capturar, Intérprete, Jogar e Vocabulário (e o Mais)', () => {
    const { dock } = montar()
    const nomes = within(dock)
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(nomes).toEqual(['Início', 'Capturar', 'Intérprete', 'Jogar', 'Vocabulário', 'Mais'])
  })

  it('a Biblioteca continua a um toque: na folha do Mais', () => {
    montar()
    const folha = screen.getByRole('region', { name: 'Mais destinos' })
    expect(within(folha).getByRole('button', { name: 'Biblioteca', hidden: true })).toBeTruthy()
  })

  it('estar na Biblioteca acende o Mais, e estar no Intérprete acende o Intérprete', () => {
    const { dock } = montar('library')
    expect(within(dock).getByRole('button', { name: 'Mais' }).getAttribute('aria-current')).toBe('page')
    cleanup()
    const outra = montar('interprete')
    expect(within(outra.dock).getByRole('button', { name: 'Intérprete' }).getAttribute('aria-current')).toBe('page')
  })
})
