// @vitest-environment jsdom
/**
 * O QUE ESTE ARQUIVO TRAVA no Bao: o relatório da rodada.
 *
 * O jogo reportava `gameId: 'blitz' as any` e rodava sobre `RODADAS_BAO`, um léxico de raiz+afixo
 * escrito à mão dentro do componente — a prop `items` chegava assinada como `_itemsProp` e era
 * ignorada. Nenhum outcome tinha `cardId`, e sem `cardId` `Play.tsx` descarta o resultado.
 */
import { act,cleanup, fireEvent, render } from '@testing-library/react'
import React from 'react'
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameItem, RoundReport } from '../src/core/minigames/types'

vi.mock('../src/lib/juice', () => ({ comemorar: vi.fn() }))
vi.mock('../src/lib/tts', () => ({ speak: vi.fn() }))

const { default: BaoGame } = await import('../src/components/minigames/culturais/BaoGame')

function itens(): MinigameItem[] {
  return [
    { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' },
    { cardId: 'c2', prompt: 'jardim', answer: 'garden', lang: 'en' },
    { cardId: 'c3', prompt: 'janela', answer: 'window', lang: 'en' },
    { cardId: 'c4', prompt: 'mesa', answer: 'table', lang: 'en' },
  ]
}

function avancar(ms: number): void {
  act(() => { vi.advanceTimersByTime(ms) })
}

function covas(): HTMLButtonElement[] {
  return [...document.querySelectorAll('[data-tour="tabuleiro"] button')] as HTMLButtonElement[]
}

/**
 * Semeia os pedaços na ordem que remonta a palavra.
 *
 * A ordem certa é descoberta pelo próprio tabuleiro: a cada passo, a cova válida é a única cujo
 * texto continua o prefixo já montado — é assim que o teste não precisa conhecer a régua de corte.
 */
function montar(palavra: string): void {
  let montada = ''
  let passos = 0
  while (montada !== palavra) {
    if (passos++ > 12) throw new Error('não foi possível remontar ' + palavra)
    const abertas = covas()
    const i = abertas.findIndex(b => {
      const texto = b.textContent ?? ''
      return !b.disabled && texto.length > 0 && palavra.startsWith(montada + texto)
    })
    if (i < 0) throw new Error(`nenhuma cova continua "${montada}" rumo a "${palavra}"`)
    montada += abertas[i].textContent
    fireEvent.click(abertas[i])
  }
}

/** Joga a rodada inteira sem errar. */
function semearTudo(items: MinigameItem[]): void {
  items.forEach((it, i) => {
    montar(it.answer)
    avancar(i + 1 >= items.length ? 1000 : 800)
  })
}

describe('BaoGame — o tabuleiro monta a palavra dos items', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it('o relatório sai com gameId "bao" e um outcome por palavra', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<BaoGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    semearTudo(items)

    expect(relatorio).not.toBeNull()
    expect(relatorio!.gameId).toBe('bao')
    expect(relatorio!.items).toHaveLength(items.length)
    expect(relatorio!.items.map(o => o.itemRef)).toEqual(items.map(i => i.answer))
    expect(relatorio!.items.every(o => o.correct)).toBe(true)
  })

  it('todo outcome carrega o cardId VINDO DO ITEM', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<BaoGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    semearTudo(items)

    expect(relatorio!.items.map(o => o.cardId)).toEqual(items.map(i => i.cardId))
  })

  it('a pista do item fica na tela — sem ela a montagem seria só quebra-cabeça', () => {
    const items = itens()
    render(<BaoGame items={items} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    expect(document.body.textContent).toContain('casa')
  })

  it('sem material suficiente o jogo sai pela porta em vez de inventar palavras', () => {
    const poucos = itens().slice(0, 3) // o mínimo declarado em MINIGAMES.bao é 4
    const onExit = vi.fn()
    const onFinish = vi.fn()
    const { container } = render(<BaoGame items={poucos} ageProfile="pro" onFinish={onFinish} onExit={onExit} />)

    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onFinish).not.toHaveBeenCalled()
    expect(container.querySelector('[data-tour="tabuleiro"]')).toBeNull()
  })
})
