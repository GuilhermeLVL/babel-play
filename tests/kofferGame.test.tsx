// @vitest-environment jsdom
/**
 * O QUE ESTE ARQUIVO TRAVA no Koffer: o relatório da rodada.
 *
 * O jogo reportava `gameId: 'blitz' as any` e rodava sobre uma lista de palavras alemãs embutida
 * no arquivo — nenhum outcome tinha `cardId`, e `Play.tsx:1112` descarta outcome sem `cardId`.
 * Uma rodada inteira era jogada sem agendar UMA revisão, e nada na tela dizia isso.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import React from 'react'
import type { MinigameItem, RoundReport } from '../src/core/minigames/types'

vi.mock('../src/lib/juice', () => ({ comemorar: vi.fn() }))
vi.mock('../src/lib/tts', () => ({ speak: vi.fn() }))

const { default: KofferGame } = await import('../src/components/minigames/culturais/KofferGame')

function itens(): MinigameItem[] {
  return [
    { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' },
    { cardId: 'c2', prompt: 'cachorro', answer: 'dog', lang: 'en' },
    { cardId: 'c3', prompt: 'gato', answer: 'cat', lang: 'en' },
    { cardId: 'c4', prompt: 'livro', answer: 'book', lang: 'en' },
  ]
}

function avancar(ms: number): void {
  act(() => { vi.advanceTimersByTime(ms) })
}

/** A mala fica aberta 2 s no perfil `pro` antes de fechar para a reconstrução. */
function esperarAMalaFechar(): void {
  avancar(2000)
}

function tocar(palavra: string): void {
  const b = document.querySelector(`[data-tour="entrada"] button[data-palavra="${palavra}"]`) as HTMLButtonElement | null
  if (!b) throw new Error('não há botão para ' + palavra)
  if (b.disabled) throw new Error('botão desabilitado: ' + palavra)
  fireEvent.click(b)
}

/** Joga a rodada inteira sem errar: nível N cobra as N primeiras palavras, na ordem. */
function reconstruirTudo(items: MinigameItem[]): void {
  for (let nivel = 1; nivel <= items.length; nivel++) {
    esperarAMalaFechar()
    for (let i = 0; i < nivel; i++) tocar(items[i].answer)
  }
  avancar(1000)
}

describe('KofferGame — a mala cumulativa reporta o que agenda revisão', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it('o relatório sai com gameId "koffer" e um outcome por palavra dos items', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<KofferGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    reconstruirTudo(items)

    expect(relatorio).not.toBeNull()
    expect(relatorio!.gameId).toBe('koffer')
    expect(relatorio!.items).toHaveLength(items.length)
    expect(relatorio!.items.map(o => o.itemRef)).toEqual(items.map(i => i.answer))
  })

  it('todo outcome carrega o cardId VINDO DO ITEM — sem ele não há FSRS', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<KofferGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    reconstruirTudo(items)

    const idsDoJogo = relatorio!.items.map(o => o.cardId)
    expect(idsDoJogo).toEqual(items.map(i => i.cardId))
    expect(idsDoJogo.every(id => typeof id === 'string' && id.length > 0)).toBe(true)
  })

  it('sem material suficiente o jogo sai pela porta em vez de inventar palavras', () => {
    const poucos = itens().slice(0, 3) // o mínimo declarado em MINIGAMES.koffer é 4
    const onExit = vi.fn()
    const onFinish = vi.fn()
    const { container } = render(<KofferGame items={poucos} ageProfile="pro" onFinish={onFinish} onExit={onExit} />)

    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onFinish).not.toHaveBeenCalled()
    expect(container.querySelector('[data-tour="mala"]')).toBeNull()
  })

  it('errar a ordem custa vida e conta como tentativa da palavra daquela posição', () => {
    const items = itens()
    let relatorio: RoundReport | null = null
    render(<KofferGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    for (let nivel = 1; nivel <= items.length; nivel++) {
      esperarAMalaFechar()
      // No nível 2 a primeira posição leva um toque errado antes do certo.
      if (nivel === 2) tocar(items[3].answer)
      for (let i = 0; i < nivel; i++) tocar(items[i].answer)
    }
    avancar(1000)

    const primeiro = relatorio!.items[0]
    expect(primeiro.cardId).toBe('c1')
    expect(primeiro.attempts).toBe(2)
    expect(primeiro.correct).toBe(true)
  })
})
