// @vitest-environment jsdom
/**
 * O QUE ESTE ARQUIVO TRAVA. O Karuta reportava `gameId: 'blitz' as any` e nenhum outcome carregava
 * `cardId` — as duas coisas juntas faziam a rodada contaminar o recorde do Duelo e não agendar
 * revisão nenhuma (`Play.tsx` pula outcome sem `cardId`). Além disso, o jogo tinha um baralho fixo
 * embutido: com material insuficiente ele inventava palavras em inglês em vez de sair.
 */
import { act,cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameItem, RoundReport } from '../src/core/minigames/types'

vi.mock('../src/lib/juice', () => ({ comemorar: vi.fn(), tremor: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))

const { default: KarutaGame } = await import('../src/components/minigames/culturais/KarutaGame')

function itens(): MinigameItem[] {
  return [
    { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' },
    { cardId: 'c2', prompt: 'cachorro', answer: 'dog', lang: 'en' },
    { cardId: 'c3', prompt: 'gato', answer: 'cat', lang: 'en' },
    { cardId: 'c4', prompt: 'água', answer: 'water', lang: 'en' },
  ]
}

const avancar = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

/** Golpeia a carta certa de cada rodada. A ordem dos alvos é a de `items`. */
function jogarTudoCerto(items: MinigameItem[]): void {
  for (const it of items) {
    fireEvent.click(screen.getByRole('button', { name: it.answer }))
    avancar(700)
  }
  avancar(1100)
}

describe('KarutaGame — a rodada sai do baralho e volta identificada', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it('reporta gameId "karuta" — nunca mais o do Duelo', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<KarutaGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    jogarTudoCerto(items)
    expect(relatorio).not.toBeNull()
    expect(relatorio!.gameId).toBe('karuta')
  })

  it('cada outcome traz o cardId DO ITEM, na ordem em que as cartas foram chamadas', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<KarutaGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    jogarTudoCerto(items)
    expect(relatorio!.items.map(o => o.cardId)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(relatorio!.items.map(o => o.itemRef)).toEqual(['house', 'dog', 'cat', 'water'])
  })

  /* Item sem cartão (fala, trilha em memória) tem de chegar SEM `cardId` — id fabricado agendaria
     revisão para um cartão que não existe. */
  it('item sem cardId não ganha um cardId inventado', () => {
    const items = itens()
    delete items[1].cardId
    let relatorio: RoundReport | null = null
    render(<KarutaGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    jogarTudoCerto(items)
    expect(relatorio!.items[1].cardId).toBeUndefined()
    expect(relatorio!.items[1].itemRef).toBe('dog')
  })

  it('a carta errada não fecha a jogada: a nota cai, a rodada continua', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<KarutaGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'cat' }))   // errada
    avancar(420)
    jogarTudoCerto(items)
    expect(relatorio!.items[0]).toMatchObject({ cardId: 'c1', correct: true, attempts: 2 })
  })

  it('sem itens suficientes o jogo sai — não inventa baralho', () => {
    const onExit = vi.fn()
    render(<KarutaGame items={itens().slice(0, 3)} ageProfile="pro" onFinish={() => {}} onExit={onExit} />)
    expect(onExit).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'house' })).toBeNull()
    expect(document.body.textContent).not.toMatch(/Wind|Mountain|Fire/)
  })

  /* Sem voz no aparelho (jsdom é um deles) a pista tem de aparecer escrita, senão a rodada nasce
     insolúvel — e a pista é `prompt`, nunca `answer`. */
  it('sem TTS a pista escrita é o prompt do item', () => {
    const items = itens()
    render(<KarutaGame items={items} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    expect(document.querySelector('[data-tour="pista"]')?.textContent).toBe('casa')
  })
})

describe('KarutaGame — o relógio da carta não vaza para a seguinte', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it('tempo esgotado gera UM outcome e passa para a carta seguinte', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<KarutaGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    for (let i = 0; i < 9; i++) avancar(1000)
    expect(document.querySelector('[data-tour="pista"]')?.textContent).toBe('cachorro')
    fireEvent.click(screen.getByRole('button', { name: 'dog' }))
    avancar(700)
    for (const it of items.slice(2)) { fireEvent.click(screen.getByRole('button', { name: it.answer })); avancar(700) }
    avancar(1100)
    expect(relatorio!.items.map(o => o.cardId)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(relatorio!.items[0]).toMatchObject({ correct: false, revealed: true })
  })
})
