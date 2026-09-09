// @vitest-environment jsdom
/**
 * O Tabu tinha um baralho de 15 cartas escritas à mão e ignorava `items` inteiro. Agora a carta
 * inteira sai do material: `mascararResposta` tira a palavra-alvo do texto e `extractKeywords`
 * escolhe, no que sobrou, os termos riscados.
 *
 * O que estes testes travam: `gameId` próprio (ele reportava `'blitz' as any`), `cardId` em todo
 * outcome, proibidas DERIVADAS do texto (nunca de lista fixa) e `onExit` quando o material não
 * sustenta nenhuma.
 */
import { cleanup, fireEvent,render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach,describe, expect, it, vi } from 'vitest'

import type { MinigameItem, RoundReport } from '../src/core/minigames/types'

vi.mock('../src/lib/juice', () => ({
  comemorar: vi.fn(), pontosDoElemento: vi.fn(), pontosFlutuantes: vi.fn(), tremor: vi.fn(),
  tremorDeTela: vi.fn(), pulsoDeZoom: vi.fn(), flashDeTela: vi.fn(), vibrar: vi.fn(),
  executarEfeito: vi.fn(), glitchDeTela: vi.fn(), multiplicador: () => 1,
}))
vi.mock('../src/lib/effects', () => ({ emitBurst: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))

const { default: TabooGame } = await import('../src/components/minigames/culturais/TabooGame')

/** Perfil "definição monolíngue" — o material real que o Tabu consome melhor. */
function definicoes(): MinigameItem[] {
  return [
    { cardId: 'c1', prompt: 'A hospital is a building where doctors treat patients.', answer: 'hospital', lang: 'en' },
    { cardId: 'c2', prompt: 'A library is a building where people borrow literature.', answer: 'library', lang: 'en' },
    { cardId: 'c3', prompt: 'A bicycle is a vehicle with two narrow wheels.', answer: 'bicycle', lang: 'en' },
    { cardId: 'c4', prompt: 'To harvest is to gather a crop that is ready.', answer: 'harvest', lang: 'en' },
  ]
}

const definicaoNaTela = () => document.querySelector('[data-tour="alvo"]') as HTMLElement

describe('TabooGame — as proibidas saem do material', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('o relatório sai com gameId próprio e cardId em todo outcome', () => {
    const items = definicoes()
    let relatorio: RoundReport | null = null
    render(<TabooGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    for (const it of items) fireEvent.click(screen.getByRole('button', { name: it.answer }))
    expect(relatorio).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(relatorio!.gameId).toBe('taboo')
    expect(relatorio!.items).toHaveLength(4)
    expect(relatorio!.items.map(o => o.cardId)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(relatorio!.items.every(o => o.correct)).toBe(true)
  })

  it('a palavra-alvo é mascarada e os termos salientes do texto aparecem riscados', () => {
    render(<TabooGame items={definicoes()} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)

    const alvo = definicaoNaTela()
    expect(alvo.textContent).not.toContain('hospital')
    const riscadas = [...alvo.querySelectorAll('s')].map(s => s.textContent)
    expect(riscadas.length).toBeGreaterThan(0)
    /* Não é lista fixa: cada termo riscado tem de estar no texto DESTE item. */
    for (const r of riscadas) expect('a hospital is a building where doctors treat patients.').toContain(r!.toLowerCase())
  })

  /* A dica libera uma proibida e, por `gradeFor`, o item passa a valer no máximo "difícil". */
  it('liberar uma proibida marca o outcome como hinted', () => {
    const items = definicoes()
    let relatorio: RoundReport | null = null
    render(<TabooGame items={items} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    const antes = definicaoNaTela().querySelectorAll('s').length
    fireEvent.click(screen.getByRole('button', { name: /Liberar 1/ }))
    expect(definicaoNaTela().querySelectorAll('s').length).toBe(antes - 1)

    for (const it of items) fireEvent.click(screen.getByRole('button', { name: it.answer }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(relatorio!.items[0].hinted).toBe(true)
    expect(relatorio!.items[1].hinted).toBe(false)
  })

  it('sem texto que sustente uma proibida a rodada não nasce: chama onExit', () => {
    const saiu = vi.fn()
    const relatorio = vi.fn()
    const curtos: MinigameItem[] = definicoes().map((it, i) => ({ ...it, prompt: `n${i}` }))
    const { container } = render(<TabooGame items={curtos} ageProfile="pro" onFinish={relatorio} onExit={saiu} />)

    expect(saiu).toHaveBeenCalledTimes(1)
    expect(relatorio).not.toHaveBeenCalled()
    expect(container.textContent).toBe('')
  })
})
