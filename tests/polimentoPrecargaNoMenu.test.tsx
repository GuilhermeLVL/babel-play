// @vitest-environment jsdom
/**
 * O MENU PEDE O PEDAÇO DA TELA NO TOQUE (`TrilhoDoQuest` + `src/lib/polimento/precarga.ts`; auditoria de
 * desempenho de 10/10/2026, G6): no `pointerdown` do item, antes de o clique terminar, uma vez por tela;
 * e só do que o toque abre de verdade. O contador do botão "Mais" entrega o tamanho dele ao anel que
 * pulsa (`polimento/pulso.ts`).
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TrilhoDoQuest from '../src/components/shell/TrilhoDoQuest'
import { registrarTelas, zerarPrecargaParaTeste } from '../src/lib/polimento/precarga'
import { medirOPulso } from '../src/lib/polimento/pulso'

const pedidos: Record<string, ReturnType<typeof vi.fn<() => Promise<unknown>>>> = {}
const TELAS = ['capture', 'interprete', 'library', 'cartoes', 'play', 'estatisticas', 'loja', 'settings', 'profile', 'planos']

beforeEach(() => {
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
  Element.prototype.animate = (() => ({ finished: new Promise(() => undefined), cancel() {} })) as never
  Element.prototype.getAnimations = () => []
  document.documentElement.dataset.px = 'on'
  document.body.className = 'animations-on'
  zerarPrecargaParaTeste()
  for (const t of TELAS) pedidos[t] = vi.fn<() => Promise<unknown>>(() => Promise.resolve({}))
  registrarTelas(pedidos)
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  localStorage.clear()
  delete document.documentElement.dataset.px
})

const montar = (extra: Record<string, unknown> = {}) =>
  render(
    <TrilhoDoQuest
      activeView="hub"
      onChangeView={() => {}}
      ageProfile="pro"
      darkMode={false}
      toggleDarkMode={() => {}}
      soundEnabled
      toggleSound={() => {}}
      {...extra}
    />,
  )
const item = (c: HTMLElement, rota: string) => c.querySelector<HTMLElement>(`.q-item[data-px-rota="${rota}"]`)!

describe('o toque no item do menu', () => {
  it('pede o pedaço da tela no `pointerdown`, antes do clique, e uma vez só', () => {
    const { container } = montar()
    expect(pedidos.capture).not.toHaveBeenCalled()
    fireEvent.pointerDown(item(container, 'capture'))
    expect(pedidos.capture).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(item(container, 'capture'))
    fireEvent.click(item(container, 'capture'))
    expect(pedidos.capture).toHaveBeenCalledTimes(1)
    expect(pedidos.play).not.toHaveBeenCalled()
  })

  it('o Início não tem pedaço a pedir; sem conta, a Biblioteca abre um convite e o pedaço dela não desce', () => {
    const { container } = montar({ semConta: true })
    fireEvent.pointerDown(item(container, 'hub'))
    fireEvent.pointerDown(item(container, 'library'))
    fireEvent.pointerDown(item(container, 'play'))
    expect(pedidos.library).not.toHaveBeenCalled()
    expect(pedidos.play).toHaveBeenCalledTimes(1)
  })

  it('com conta, a Biblioteca desce no toque', () => {
    const { container } = montar()
    fireEvent.pointerDown(item(container, 'library'))
    expect(pedidos.library).toHaveBeenCalledTimes(1)
  })

  it('o foco do teclado também pede, menos com a economia de dados ligada', () => {
    const { container } = montar()
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } })
    try {
      fireEvent.focus(item(container, 'play'))
      expect(pedidos.play).not.toHaveBeenCalled()
      /* O toque é a própria navegação: pede assim mesmo. */
      fireEvent.pointerDown(item(container, 'play'))
      expect(pedidos.play).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(navigator, 'connection', { configurable: true, value: undefined })
    }
    fireEvent.focus(item(container, 'cartoes'))
    expect(pedidos.cartoes).toHaveBeenCalledTimes(1)
  })

  it('os ladrilhos do "Mais" pedem do mesmo jeito', () => {
    const { container } = montar()
    fireEvent.click(container.querySelector('.q-mais-botao')!)
    const ajustes = [...document.querySelectorAll<HTMLElement>('.q-mais .q-tile.em-linha')].find((b) =>
      /Ajustes/.test(b.textContent ?? ''),
    )!
    fireEvent.pointerDown(ajustes)
    expect(pedidos.settings).toHaveBeenCalledTimes(1)
  })
})

describe('o anel que pulsa no contador', () => {
  it('recebe do tamanho do contador a escala que o faz crescer 10 px para cada lado', () => {
    let avisar: (entradas: unknown[]) => void = () => undefined
    const vigiados: Element[] = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(f: (entradas: unknown[]) => void) {
          avisar = f
        }
        observe(el: Element) {
          vigiados.push(el)
        }
        unobserve(el: Element) {
          vigiados.splice(vigiados.indexOf(el), 1)
        }
      },
    )
    try {
      const contador = document.createElement('i')
      const largar = medirOPulso(contador)!
      expect(vigiados).toEqual([contador])
      /* Um algarismo no computador: 24 × 24. A camada tem o tamanho final (44) e começa em 24 / 44. */
      avisar([{ target: contador, borderBoxSize: [{ inlineSize: 24, blockSize: 24 }] }])
      expect(contador.style.getPropertyValue('--px-pulso-x')).toBe('0.5455')
      expect(contador.style.getPropertyValue('--px-pulso-y')).toBe('0.5455')
      /* Dois algarismos na barra do celular: 25 × 18. */
      avisar([{ target: contador, borderBoxSize: [{ inlineSize: 25, blockSize: 18 }] }])
      expect(contador.style.getPropertyValue('--px-pulso-x')).toBe('0.5556')
      expect(contador.style.getPropertyValue('--px-pulso-y')).toBe('0.4737')
      largar()
      expect(vigiados).toEqual([])
      expect(medirOPulso(null)).toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
