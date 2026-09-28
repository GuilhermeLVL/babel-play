// @vitest-environment jsdom
/**
 * CAÇA-PALAVRAS: DÁ PARA JOGAR SEM MOUSE (QA dos jogos, 2026-09-26).
 *
 * Medido no celular (375 px, toque de verdade via CDP): arrastar o dedo não marcava a palavra e
 * tocar no início e depois no fim também não. O traço dependia de `pointerenter`/`pointerup` nas
 * células de destino, e no toque o navegador CAPTURA o ponteiro na célula onde o dedo pousou — os
 * eventos nunca chegavam às outras. E pelo teclado as células não faziam nada: só havia handlers de
 * ponteiro. O jogo era injogável no celular e para quem navega por teclado.
 *
 * O que fica travado aqui: tocar na primeira letra e depois na última marca a palavra; Enter (ou
 * Espaço) na primeira e na última faz o mesmo; as setas andam pela grade; e o arrasto com mouse
 * continua funcionando.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameItem } from '../src/core/minigames/types'

vi.mock('../src/lib/juice', () => ({
  contarAte: vi.fn(async () => {}),
  comemorar: vi.fn(),
  tremor: vi.fn(),
  multiplicador: (n: number) => (n >= 6 ? 3 : n >= 3 ? 2 : 1),
  pontosDoElemento: vi.fn(),
}))
vi.mock('../src/lib/comemoracao', () => ({ celebrar: vi.fn() }))
vi.mock('../src/lib/effects', () => ({ emitBurst: vi.fn() }))
vi.mock('../src/lib/tts', () => ({ speak: vi.fn(), falar: vi.fn(() => true) }))

const { default: WordSearchGame } = await import('../src/components/minigames/WordSearchGame')

const ITENS: MinigameItem[] = [
  { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' },
  { cardId: 'c2', prompt: 'cachorro', answer: 'dog', lang: 'en' },
  { cardId: 'c3', prompt: 'gato', answer: 'cat', lang: 'en' },
  { cardId: 'c4', prompt: 'água', answer: 'water', lang: 'en' },
]

function celulas(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('[data-tour="grade"] > button')]
}

/** Acha as duas pontas da palavra lendo a grade que está na tela (a semente é aleatória). */
function pontas(palavra: string): [HTMLButtonElement, HTMLButtonElement] {
  const cs = celulas()
  const n = Math.round(Math.sqrt(cs.length))
  const letra = (l: number, c: number) => cs[l * n + c]?.textContent?.trim()
  const W = palavra.toUpperCase()
  const dirs = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]]
  for (let l = 0; l < n; l++)
    for (let c = 0; c < n; c++)
      for (const [dl, dc] of dirs) {
        let ok = true
        for (let k = 0; k < W.length && ok; k++) {
          const L = l + dl * k
          const C = c + dc * k
          if (L < 0 || C < 0 || L >= n || C >= n || letra(L, C) !== W[k]) ok = false
        }
        if (ok) return [cs[l * n + c], cs[(l + dl * (W.length - 1)) * n + c + dc * (W.length - 1)]]
      }
  throw new Error('palavra fora da grade: ' + palavra)
}

const achadas = () => screen.queryAllByLabelText('encontrada').length

describe('WordSearchGame — seleção por toque e por teclado', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  const montar = () => render(<WordSearchGame items={ITENS} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)

  it('toque na primeira letra e depois na última marca a palavra', () => {
    montar()
    const [a, b] = pontas('house')
    fireEvent.pointerDown(a, { pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerUp(a, { pointerId: 1, pointerType: 'touch' })
    expect(achadas()).toBe(0)
    fireEvent.pointerDown(b, { pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerUp(b, { pointerId: 1, pointerType: 'touch' })
    expect(achadas()).toBe(1)
  })

  it('tocar duas vezes na mesma letra desfaz a seleção, sem contar erro', () => {
    montar()
    const [a, b] = pontas('water')
    fireEvent.pointerDown(a, { pointerId: 1 })
    fireEvent.pointerUp(a, { pointerId: 1 })
    fireEvent.pointerDown(a, { pointerId: 1 })
    fireEvent.pointerUp(a, { pointerId: 1 })
    // desarmada: tocar só no fim agora não marca nada
    fireEvent.pointerDown(b, { pointerId: 1 })
    fireEvent.pointerUp(b, { pointerId: 1 })
    expect(achadas()).toBe(0)
  })

  it('Enter na primeira letra e na última marca a palavra (teclado)', () => {
    montar()
    const [a, b] = pontas('dog')
    fireEvent.keyDown(a, { key: 'Enter' })
    fireEvent.keyDown(b, { key: 'Enter' })
    expect(achadas()).toBe(1)
  })

  it('as setas andam pela grade e só uma célula fica no Tab', () => {
    montar()
    const cs = celulas()
    expect(cs.filter((c) => c.tabIndex === 0)).toHaveLength(1)
    act(() => cs[0].focus())
    fireEvent.keyDown(cs[0], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(cs[1])
    const n = Math.round(Math.sqrt(cs.length))
    fireEvent.keyDown(cs[1], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(cs[1 + n])
  })

  it('o arrasto com mouse continua funcionando', () => {
    montar()
    const [a, b] = pontas('cat')
    fireEvent.pointerDown(a, { pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerEnter(b, { pointerId: 1, pointerType: 'mouse' })
    fireEvent.pointerUp(b, { pointerId: 1, pointerType: 'mouse' })
    expect(achadas()).toBe(1)
  })
})
