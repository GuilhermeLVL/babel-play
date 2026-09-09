// @vitest-environment jsdom
/**
 * O QUE ESTE ARQUIVO TRAVA. O Tênis nem olhava para `items`: rodava seis desafios de conjugação
 * espanhola escritos à mão (`DESAFIOS_TENNIS`), reportava `gameId: 'blitz' as any` e mandava
 * `itemRef` fabricado ("HABLAR (Yo)") sem `cardId` nenhum. Agora é o rali sobre o baralho — a bola
 * traz a pista, a devolução é a palavra, e cada devolução certa encurta o tempo da próxima.
 */
import { act,cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameItem, RoundReport } from '../src/core/minigames/types'

vi.mock('../src/lib/juice', () => ({ comemorar: vi.fn(), tremor: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))

const { default: TenseTennisGame } = await import('../src/components/minigames/culturais/TenseTennisGame')

function itens(): MinigameItem[] {
  return [
    { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' },
    { cardId: 'c2', prompt: 'cachorro', answer: 'dog', lang: 'en' },
    { cardId: 'c3', prompt: 'gato', answer: 'cat', lang: 'en' },
    { cardId: 'c4', prompt: 'água', answer: 'water', lang: 'en' },
  ]
}

const avancar = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const bola = () => document.querySelector('[data-tour="bola"] p')?.textContent
const relogio = () => document.querySelector('[data-tour="relogio"] span')?.textContent

function devolver(texto: string, esperaMs = 600): void {
  fireEvent.change(screen.getByLabelText('Sua devolução'), { target: { value: texto } })
  fireEvent.click(screen.getByRole('button', { name: 'Devolver' }))
  avancar(esperaMs)
}

function jogarTudoCerto(items: MinigameItem[]): void {
  for (const it of items) devolver(it.answer)
  avancar(1100)
}

describe('TenseTennisGame — o rali corre sobre o baralho', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it('reporta gameId "tenis" — nunca mais o do Duelo', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<TenseTennisGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    jogarTudoCerto(items)
    expect(relatorio).not.toBeNull()
    expect(relatorio!.gameId).toBe('tenis')
  })

  it('cada outcome traz o cardId DO ITEM, e o itemRef é a palavra do baralho', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<TenseTennisGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    jogarTudoCerto(items)
    expect(relatorio!.items.map(o => o.cardId)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(relatorio!.items.map(o => o.itemRef)).toEqual(['house', 'dog', 'cat', 'water'])
  })

  it('item sem cardId não ganha um cardId inventado', () => {
    const items = itens()
    delete items[2].cardId
    let relatorio: RoundReport | null = null
    render(<TenseTennisGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    jogarTudoCerto(items)
    expect(relatorio!.items[2].cardId).toBeUndefined()
    expect(relatorio!.items[2].itemRef).toBe('cat')
  })

  it('a bola traz a PISTA, e cada devolução certa encurta o tempo da próxima', () => {
    const items = itens()
    render(<TenseTennisGame items={items} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    expect(bola()).toBe('casa')
    expect(relogio()).toBe('6s')
    devolver('house')
    expect(bola()).toBe('cachorro')
    expect(relogio()).toBe('5s')
    devolver('dog')
    expect(relogio()).toBe('4s')
  })

  it('devolução fora zera o rali e o ponto é perdido', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<TenseTennisGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    devolver('house')
    devolver('errado', 1200)
    expect(relogio()).toBe('6s')   // o rali quebrou: o relógio volta ao saque
    devolver('cat')
    devolver('water')
    avancar(1100)
    expect(relatorio!.items.map(o => o.correct)).toEqual([true, false, true, true])
    expect(relatorio!.items[1].cardId).toBe('c2')
  })

  it('sem itens suficientes o jogo sai — não cai nos desafios de conjugação', () => {
    const onExit = vi.fn()
    render(<TenseTennisGame items={itens().slice(0, 3)} ageProfile="pro" onFinish={() => {}} onExit={onExit} />)
    expect(onExit).toHaveBeenCalled()
    expect(document.body.textContent).not.toMatch(/HABLAR|Hablé|Subjuntivo/)
  })
})

describe('TenseTennisGame — o relógio da bola não vaza para a seguinte', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it('bola caída gera UM outcome e o rali recomeça na bola seguinte', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<TenseTennisGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)
    for (let i = 0; i < 7; i++) avancar(1000)
    avancar(1200)
    expect(bola()).toBe('cachorro')
    expect(relogio()).toBe('6s')
    for (const it of items.slice(1)) devolver(it.answer)
    avancar(1100)
    expect(relatorio!.items.map(o => o.cardId)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(relatorio!.items[0]).toMatchObject({ correct: false, revealed: true })
  })
})
