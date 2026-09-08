// @vitest-environment jsdom
/**
 * O QUE ESTE ARQUIVO TRAVA. O Choseong reportava `gameId: 'blitz' as any`, não copiava `cardId`
 * nenhum e, quando `items` não dava, caía em silêncio numa lista fixa de cinco palavras em inglês
 * (`MOCK_PUZZLES_CHOSEONG`) — a pessoa jogava uma rodada inteira que não era a dela.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import React from 'react'
import type { MinigameItem, RoundReport } from '../src/core/minigames/types'

vi.mock('../src/lib/juice', () => ({ comemorar: vi.fn(), tremor: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))

const { default: ChoseongGame } = await import('../src/components/minigames/culturais/ChoseongGame')

function itens(): MinigameItem[] {
  return [
    { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' },
    { cardId: 'c2', prompt: 'cachorro', answer: 'dog', lang: 'en' },
    { cardId: 'c3', prompt: 'gato', answer: 'cat', lang: 'en' },
    { cardId: 'c4', prompt: 'água', answer: 'water', lang: 'en' },
  ]
}

const avancar = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

/** Preenche as vogais escondidas, na ordem em que aparecem na palavra. */
function completar(answer: string): void {
  for (const v of answer.toUpperCase().split('').filter(c => 'AEIOU'.includes(c))) {
    fireEvent.click(screen.getByRole('button', { name: v }))
  }
  avancar(700)
}

function jogarTudoCerto(items: MinigameItem[]): void {
  for (const it of items) completar(it.answer)
  avancar(1100)
}

describe('ChoseongGame — a rodada sai do baralho e volta identificada', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it('reporta gameId "choseong" — nunca mais o do Duelo', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<ChoseongGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    jogarTudoCerto(items)
    expect(relatorio).not.toBeNull()
    expect(relatorio!.gameId).toBe('choseong')
  })

  it('cada outcome traz o cardId DO ITEM', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<ChoseongGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    jogarTudoCerto(items)
    expect(relatorio!.items.map(o => o.cardId)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(relatorio!.items.map(o => o.itemRef)).toEqual(['house', 'dog', 'cat', 'water'])
    expect(relatorio!.items.every(o => o.correct)).toBe(true)
  })

  it('item sem cardId não ganha um cardId inventado', () => {
    const items = itens()
    delete items[0].cardId
    let relatorio: RoundReport | null = null
    render(<ChoseongGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    jogarTudoCerto(items)
    expect(relatorio!.items[0].cardId).toBeUndefined()
    expect(relatorio!.items[0].itemRef).toBe('house')
  })

  it('a pista é o prompt e as consoantes já estão na mesa', () => {
    const items = itens()
    render(<ChoseongGame items={items} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    expect(document.querySelector('[data-tour="pista"]')?.textContent).toBe('casa')
    // HOUSE: H e S à vista, O/U/E vazias.
    const slots = [...document.querySelectorAll('[data-tour="pista"] ~ div span')].map(s => s.textContent)
    expect(slots).toEqual(['H', '', '', 'S', ''])
  })

  it('abrir uma vogal marca o outcome como "com dica"', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<ChoseongGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir uma vogal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'U' }))
    fireEvent.click(screen.getByRole('button', { name: 'E' }))
    avancar(700)
    for (const it of items.slice(1)) completar(it.answer)
    avancar(1100)
    expect(relatorio!.items[0]).toMatchObject({ cardId: 'c1', correct: true, hinted: true })
    expect(relatorio!.items[1].hinted).toBe(false)
  })

  it('sem itens suficientes o jogo sai — não cai na lista fixa', () => {
    const onExit = vi.fn()
    render(<ChoseongGame items={itens().slice(0, 3)} ageProfile="pro" onFinish={() => {}} onExit={onExit} />)
    expect(onExit).toHaveBeenCalled()
    expect(document.body.textContent).not.toMatch(/COFFEE|GARDEN|WINDOW/)
  })

  /* Palavra sem vogal não tem o que esconder: sai da rodada, e se sobrar material de menos o jogo
     sai também, em vez de montar um enigma já resolvido. */
  it('palavra sem vogal não vira enigma resolvido', () => {
    const onExit = vi.fn()
    const items = itens()
    items[3] = { cardId: 'c4', prompt: 'ritmo', answer: 'rhythm', lang: 'en' }
    render(<ChoseongGame items={items} ageProfile="pro" onFinish={() => {}} onExit={onExit} />)
    expect(onExit).toHaveBeenCalled()
  })
})

describe('ChoseongGame — o relógio da palavra não vaza para a seguinte', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it('tempo esgotado gera UM outcome e passa para a palavra seguinte', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<ChoseongGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    for (let i = 0; i < 16; i++) avancar(1000)
    expect(document.querySelector('[data-tour="pista"]')?.textContent).toBe('cachorro')
    for (const it of items.slice(1)) completar(it.answer)
    avancar(1100)
    expect(relatorio!.items.map(o => o.cardId)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(relatorio!.items[0]).toMatchObject({ correct: false, revealed: true })
  })
})
