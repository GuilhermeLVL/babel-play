// @vitest-environment jsdom
/**
 * LIVROS NO MENU (pedido do dono, 27/10/2026: "a categoria Livros deve ficar no menu lateral, não sendo algo
 * secundário"). No computador é um destino do trilho, logo depois da Biblioteca; no celular a barra de cinco
 * não ganha botão (o CSS conta os botões por posição) e Livros mora no "Mais", ao lado da Biblioteca.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NAV_ITEMS, navLabel } from '../src/components/shell/navItems'
import TrilhoDoQuest from '../src/components/shell/TrilhoDoQuest'
import { NO_MAIS_NO_CELULAR } from '../src/lib/polimento/celular'
import { estadoParaUrl, urlParaEstado } from '../src/lib/rotas'

afterEach(cleanup)

const montar = (activeView = 'hub') =>
  render(
    <TrilhoDoQuest
      activeView={activeView as never}
      onChangeView={vi.fn()}
      ageProfile="pro"
      darkMode={false}
      toggleDarkMode={() => {}}
      soundEnabled
      toggleSound={() => {}}
    />,
  )

describe('Livros na lista de destinos', () => {
  it('fica logo depois da Biblioteca', () => {
    const ids = NAV_ITEMS.map((i) => i.id)
    expect(ids.indexOf('livros')).toBe(ids.indexOf('library') + 1)
  })

  it('o rótulo muda por perfil, e o curto é "Livros"', () => {
    const item = NAV_ITEMS.find((i) => i.id === 'livros')!
    expect(navLabel(item, 'pro')).toBe('Livros')
    expect(navLabel(item, 'kids')).toBe('Livros')
    expect(navLabel(item, 'senior')).toBe('Livros para ler')
    expect(navLabel(item, 'senior', true)).toBe('Livros para ler')
    expect(navLabel(item, 'pro', true)).toBe('Livros')
  })

  it('é um dos destinos que a barra de cinco do celular leva para o "Mais"', () => {
    expect(NO_MAIS_NO_CELULAR).toContain('livros')
  })

  it('o endereço /livros continua levando à tela', () => {
    expect(urlParaEstado('/livros')).toEqual({ view: 'livros' })
    expect(estadoParaUrl({ view: 'livros' })).toBe('/livros')
  })
})

describe('Livros no trilho do computador', () => {
  it('é um botão do trilho, entre a Biblioteca e o Progresso', () => {
    const { container } = montar()
    const rotas = [...container.querySelectorAll<HTMLElement>('nav .q-item[data-px-rota]')].map((b) => b.dataset.pxRota)
    expect(rotas.indexOf('livros')).toBe(rotas.indexOf('library') + 1)
    expect(rotas.indexOf('estatisticas')).toBe(rotas.indexOf('livros') + 1)
  })

  it('na tela de Livros ele é o item marcado, e o "Mais" não repete o destino', () => {
    const { container } = montar('livros')
    expect(container.querySelector('.q-item[aria-current="page"]')?.getAttribute('data-px-rota')).toBe('livros')
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    const ladrilhos = [...screen.getByRole('dialog').querySelectorAll('.q-grade .q-tile b')].map((b) => b.textContent)
    expect(ladrilhos).not.toContain('Livros')
  })
})
