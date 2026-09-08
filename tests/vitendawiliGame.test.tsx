// @vitest-environment jsdom
/**
 * O QUE ESTE ARQUIVO TRAVA no Vitendawili: de onde vem o enigma, e o relatório da rodada.
 *
 * O jogo reportava `gameId: 'blitz' as any` e rodava sobre `ENIGMAS_CULTURAIS` — cinco charadas
 * swahili escritas à mão dentro do componente, com `items` ignorada como `_itemsProp`. O enigma
 * agora é a FRASE DO PRÓPRIO USUÁRIO com a palavra apagada, e a regra dura que vem junto é:
 * item sem frase não tem enigma, e por isso não entra na rodada — nada é inventado no lugar dele.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import React from 'react'
import type { MinigameItem, RoundReport } from '../src/core/minigames/types'

vi.mock('../src/lib/juice', () => ({ comemorar: vi.fn() }))
vi.mock('../src/lib/tts', () => ({ speak: vi.fn() }))

const { default: VitendawiliGame } = await import('../src/components/minigames/culturais/VitendawiliGame')

/** Quatro itens com frase real e UM sem frase nenhuma — o quinto não pode virar enigma. */
function itens(): MinigameItem[] {
  return [
    { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en', sentence: 'I left my house early in the morning.' },
    { cardId: 'c2', prompt: 'jardim', answer: 'garden', lang: 'en', sentence: 'The garden is full of flowers.' },
    { cardId: 'c3', prompt: 'janela', answer: 'window', lang: 'en', sentence: 'She opened the window slowly.' },
    { cardId: 'c4', prompt: 'mesa', answer: 'table', lang: 'en', sentence: 'Put the plates on the table.' },
    { cardId: 'c5', prompt: 'rio', answer: 'river', lang: 'en' },
  ]
}

const COM_FRASE = ['house', 'garden', 'window', 'table']

function avancar(ms: number): void {
  act(() => { vi.advanceTimersByTime(ms) })
}

function clicar(palavra: string): void {
  const b = screen.getByRole('button', { name: palavra }) as HTMLButtonElement
  if (b.disabled) throw new Error('alternativa desabilitada: ' + palavra)
  fireEvent.click(b)
}

function decifrarTudo(): void {
  COM_FRASE.forEach((palavra, i) => {
    clicar(palavra)
    avancar(i + 1 >= COM_FRASE.length ? 1000 : 800)
  })
}

describe('VitendawiliGame — o enigma é a frase do usuário, não uma charada inventada', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }) })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it('o relatório sai com gameId "vitendawili" e um outcome por item COM frase', () => {
    let relatorio: RoundReport | null = null
    render(<VitendawiliGame items={itens()} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    decifrarTudo()

    expect(relatorio).not.toBeNull()
    expect(relatorio!.gameId).toBe('vitendawili')
    expect(relatorio!.items.map(o => o.itemRef)).toEqual(COM_FRASE)
  })

  it('item SEM sentence fica de fora — sem frase não existe enigma', () => {
    let relatorio: RoundReport | null = null
    render(<VitendawiliGame items={itens()} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    decifrarTudo()

    expect(relatorio!.items).toHaveLength(4)
    expect(relatorio!.items.map(o => o.cardId)).not.toContain('c5')
    expect(relatorio!.items.map(o => o.itemRef)).not.toContain('river')
  })

  it('todo outcome carrega o cardId VINDO DO ITEM', () => {
    let relatorio: RoundReport | null = null
    render(<VitendawiliGame items={itens()} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    decifrarTudo()

    expect(relatorio!.items.map(o => o.cardId)).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  it('a frase aparece com a palavra apagada, e não com a resposta à mostra', () => {
    render(<VitendawiliGame items={itens()} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    const enigma = document.querySelector('[data-tour="enigma"]') as HTMLElement
    expect(enigma.textContent).toContain('I left my')
    expect(enigma.textContent).toContain('early in the morning.')
    expect(enigma.textContent).not.toContain('house')
  })

  it('errar elimina a alternativa e conta como tentativa do item', () => {
    let relatorio: RoundReport | null = null
    render(<VitendawiliGame items={itens()} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    const errada = COM_FRASE.find(p => p !== 'house')!
    clicar(errada)
    expect((screen.getByRole('button', { name: errada }) as HTMLButtonElement).disabled).toBe(true)
    decifrarTudo()

    expect(relatorio!.items[0].attempts).toBe(2)
  })

  it('sem itens com frase suficientes o jogo sai pela porta em vez de inventar enigma', () => {
    const poucos = itens().filter(i => i.cardId !== 'c4') // sobram 3 com frase; o mínimo é 4
    const onExit = vi.fn()
    const onFinish = vi.fn()
    const { container } = render(<VitendawiliGame items={poucos} ageProfile="pro" onFinish={onFinish} onExit={onExit} />)

    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onFinish).not.toHaveBeenCalled()
    expect(container.querySelector('[data-tour="enigma"]')).toBeNull()
  })
})
