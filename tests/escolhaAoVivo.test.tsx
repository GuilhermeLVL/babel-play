// @vitest-environment jsdom
/**
 * O "AO VIVO" DO TRILHO: um item só no lugar de Capturar e Intérprete, que abre a escolha rápida.
 * No computador é um cartão ao lado do trilho; no celular (barra de cinco) é uma folha embaixo.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const aparelho = vi.hoisted(() => ({ tipo: 'desktop-com-gpu' as string }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  const perfilDoDispositivo = () => {
    const p = real.perfilDoDispositivo()
    const toques = aparelho.tipo.startsWith('celular') ? 5 : 0
    return { ...p, tipo: aparelho.tipo, sinais: { ...p.sinais, toques } }
  }
  return { ...real, perfilDoDispositivo }
})

import { CHAVE_ULTIMA_AO_VIVO } from '../src/components/shell/EscolhaAoVivo'
import TrilhoDoQuest from '../src/components/shell/TrilhoDoQuest'
import { abrirSessaoDeCaptura, fecharSessaoDeCaptura } from '../src/lib/sessaoDeCaptura'

let estreita = false
const vez = () => new Promise<void>((r) => setTimeout(r, 0))

beforeEach(() => {
  aparelho.tipo = 'desktop-com-gpu'
  estreita = false
  window.matchMedia = ((q: string) => ({
    media: q,
    get matches() {
      return q.includes('max-width: 720px') ? estreita : false
    },
    addEventListener() {},
    removeEventListener() {},
  })) as never
  Element.prototype.animate = (() => ({ finished: new Promise(() => undefined), cancel() {} })) as never
  Element.prototype.getAnimations = () => []
  document.documentElement.dataset.px = 'on'
  document.body.className = 'animations-on'
})
afterEach(() => {
  cleanup()
  fecharSessaoDeCaptura()
  document.body.innerHTML = ''
  localStorage.clear()
  delete document.documentElement.dataset.px
})

const montar = (activeView = 'hub', ageProfile = 'pro') => {
  const ir = vi.fn()
  const r = render(
    <TrilhoDoQuest
      activeView={activeView as never}
      onChangeView={ir}
      ageProfile={ageProfile as never}
      darkMode={false}
      toggleDarkMode={() => {}}
      soundEnabled
      toggleSound={() => {}}
    />,
  )
  return { ir, ...r }
}
const botao = () => screen.getByRole('button', { name: 'Ao vivo' })
const abrir = () => fireEvent.click(botao())

describe('o item "Ao vivo" do trilho', () => {
  it('é um item só (sem Capturar nem Intérprete) e fica marcado em capture e em interprete', () => {
    for (const tela of ['capture', 'interprete']) {
      const { container, unmount } = montar(tela)
      expect(screen.queryByRole('button', { name: 'Capturar' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Intérprete' })).toBeNull()
      expect(container.querySelector('.q-item[aria-current="page"]')?.textContent).toBe('Ao vivo')
      unmount()
    }
  })

  it('o rótulo segue o perfil: o sênior lê "Gravar e conversar"', () => {
    montar('hub', 'senior')
    expect(screen.getByRole('button', { name: 'Gravar e conversar' })).toBeTruthy()
  })

  it('o clique abre um menu com nome acessível, Legendar e Intérprete com as legendas', () => {
    montar()
    expect(screen.queryByRole('menu')).toBeNull()
    abrir()
    const menu = screen.getByRole('menu', { name: 'Ao vivo: escolha o que fazer' })
    expect(botao().getAttribute('aria-expanded')).toBe('true')
    const itens = screen.getAllByRole('menuitem')
    expect(itens.map((i) => i.querySelector('b')?.textContent)).toEqual(['Legendar', 'Intérprete'])
    expect(menu.textContent).toContain('vídeo, jogo, aula, reunião')
    expect(menu.textContent).toContain('conversa frente a frente')
    expect(screen.queryByText('Legenda flutuante')).toBeNull()
  })

  it('sem escolha anterior, Legendar vem destacado e com o foco; Enter (clique no focado) abre capture', () => {
    const { ir } = montar()
    abrir()
    const legendar = screen.getByRole('menuitem', { name: /Legendar/ })
    expect(document.activeElement).toBe(legendar)
    expect(legendar.getAttribute('data-ultima')).toBe('true')
    fireEvent.click(document.activeElement as HTMLElement)
    expect(ir).toHaveBeenLastCalledWith('capture')
    expect(localStorage.getItem(CHAVE_ULTIMA_AO_VIVO)).toBe('capture')
  })

  it('a última escolha vem pré-selecionada e com o foco, e Enter abre o Intérprete', () => {
    localStorage.setItem(CHAVE_ULTIMA_AO_VIVO, 'interprete')
    const { ir } = montar()
    abrir()
    const interprete = screen.getByRole('menuitem', { name: /Intérprete/ })
    expect(document.activeElement).toBe(interprete)
    expect(interprete.getAttribute('data-ultima')).toBe('true')
    expect(screen.getByRole('menuitem', { name: /Legendar/ }).getAttribute('data-ultima')).toBeNull()
    /* Enter num botão focado é um clique: o navegador o faz, o jsdom não. */
    fireEvent.keyDown(interprete, { key: 'Enter' })
    fireEvent.click(interprete)
    expect(ir).toHaveBeenLastCalledWith('interprete')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('as setas movem o foco entre as opções, dando a volta', () => {
    montar()
    abrir()
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /Intérprete/ }))
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /Legendar/ }))
    fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /Intérprete/ }))
  })

  it('Esc fecha e devolve o foco ao item do trilho, sem navegar', () => {
    const { ir } = montar()
    abrir()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(botao())
    expect(ir).not.toHaveBeenCalled()
  })

  it('clicar fora fecha; clicar de novo no item também', () => {
    montar()
    abrir()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
    abrir()
    expect(screen.getByRole('menu')).toBeTruthy()
    abrir()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('o armazenamento bloqueado não derruba a escolha', () => {
    const lerAntes = Storage.prototype.getItem
    const gravarAntes = Storage.prototype.setItem
    Storage.prototype.getItem = () => {
      throw new Error('bloqueado')
    }
    Storage.prototype.setItem = () => {
      throw new Error('bloqueado')
    }
    try {
      const { ir } = montar()
      abrir()
      fireEvent.click(screen.getByRole('menuitem', { name: /Intérprete/ }))
      expect(ir).toHaveBeenLastCalledWith('interprete')
    } finally {
      Storage.prototype.getItem = lerAntes
      Storage.prototype.setItem = gravarAntes
    }
  })

  it('"Legenda flutuante" só aparece com a captura rodando, e dispara o Alt+L', () => {
    montar('capture')
    abrir()
    expect(screen.queryByText('Legenda flutuante')).toBeNull()
    fireEvent.pointerDown(document.body)

    abrirSessaoDeCaptura()
    abrir()
    const ouvinte = vi.fn()
    window.addEventListener('keydown', ouvinte)
    fireEvent.click(screen.getByRole('menuitem', { name: /Legenda flutuante/ }))
    window.removeEventListener('keydown', ouvinte)
    const e = ouvinte.mock.calls[0][0] as KeyboardEvent
    expect(e.altKey).toBe(true)
    expect(e.code).toBe('KeyL')
  })

  it('fora de capture e interprete a legenda flutuante não é oferecida, mesmo com captura ativa', () => {
    abrirSessaoDeCaptura()
    montar('hub')
    abrir()
    expect(screen.queryByText('Legenda flutuante')).toBeNull()
  })
})

describe('no celular (barra de cinco)', () => {
  beforeEach(() => {
    aparelho.tipo = 'celular-bom'
    estreita = true
  })

  it('"Ao vivo" ocupa o lugar de Capturar e abre a mesma escolha como folha embaixo', async () => {
    const { container, ir } = montar()
    await act(vez)
    const botoes = [...container.querySelectorAll('.q-trilho button.q-item')]
    expect(botoes.map((b) => b.querySelector('span')?.textContent)).toEqual([
      'Início',
      'Ao vivo',
      'Cartões',
      'Jogar',
      'Mais',
    ])
    abrir()
    const menu = screen.getByRole('menu', { name: 'Ao vivo: escolha o que fazer' })
    expect(menu.classList.contains('q-vivo-folha')).toBe(true)
    expect(menu.parentElement?.classList.contains('q-vivo-fundo')).toBe(true)
    fireEvent.click(screen.getByRole('menuitem', { name: /Intérprete/ }))
    expect(ir).toHaveBeenLastCalledWith('interprete')
  })

  it('tocar no fundo fecha a folha; o Intérprete não está mais no "Mais"', async () => {
    montar()
    await act(vez)
    abrir()
    fireEvent.pointerDown(document.querySelector('.q-vivo-fundo')!)
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    const ladrilhos = [...screen.getByRole('dialog').querySelectorAll('.q-grade .q-tile b')].map((b) => b.textContent)
    expect(ladrilhos).not.toContain('Intérprete')
  })
})
