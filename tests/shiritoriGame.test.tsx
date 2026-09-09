// @vitest-environment jsdom
/**
 * O contrato do relatório do Shiritori: `gameId` próprio (ele reportava `'blitz' as any`),
 * `cardId` em TODO outcome (sem ele `Play.tsx` pula o FSRS) e `onExit` quando o baralho não
 * fecha corrente — antes ele caía num dicionário inglês embutido e jogava sozinho.
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

const { default: ShiritoriGame } = await import('../src/components/minigames/culturais/ShiritoriGame')

/** ape → end → dog encadeia; 'elk' é a armadilha do guloso e vira distrator. */
function itensQueEncadeiam(): MinigameItem[] {
  return [
    { cardId: 'c1', prompt: 'macaco', answer: 'ape', lang: 'en' },
    { cardId: 'c2', prompt: 'alce', answer: 'elk', lang: 'en' },
    { cardId: 'c3', prompt: 'fim', answer: 'end', lang: 'en' },
    { cardId: 'c4', prompt: 'cachorro', answer: 'dog', lang: 'en' },
  ]
}

function clicar(texto: string): void {
  fireEvent.click(screen.getByRole('button', { name: texto }))
}

describe('ShiritoriGame — a corrente é o baralho', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('o relatório sai com gameId próprio e cardId em todo outcome', () => {
    let relatorio: RoundReport | null = null
    render(<ShiritoriGame items={itensQueEncadeiam()} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    clicar('end')
    clicar('dog')
    expect(relatorio).toBeNull()
    clicar('Continuar')

    expect(relatorio!.gameId).toBe('shiritori')
    expect(relatorio!.items).toHaveLength(2)
    expect(relatorio!.items.map(o => o.cardId)).toEqual(['c3', 'c4'])
    expect(relatorio!.items.every(o => o.correct)).toBe(true)
  })

  /* Errar não avança: a corrente só continua com a palavra que a continua de verdade. O elo
     riscado sobe `attempts`, que é o que rebaixa a nota de "bom" para "difícil". */
  it('a opção errada é riscada e o passo só fecha na certa, com attempts maior', () => {
    let relatorio: RoundReport | null = null
    render(<ShiritoriGame items={itensQueEncadeiam()} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    /* Uma das opções deste passo é errada por construção — clica na primeira que não é 'end'. */
    const errada = screen.getAllByRole('button')
      .map(b => b.textContent ?? '')
      .find(t => ['ape', 'elk', 'dog'].includes(t))!
    clicar(errada)
    expect((screen.getByRole('button', { name: errada }) as HTMLButtonElement).disabled).toBe(true)

    clicar('end')
    clicar('dog')
    clicar('Continuar')
    expect(relatorio!.items[0].attempts).toBe(2)
    expect(relatorio!.items[0].correct).toBe(true)
  })

  it('sem corrente possível no material o jogo não nasce: chama onExit', () => {
    const saiu = vi.fn()
    const relatorio = vi.fn()
    const semCorrente: MinigameItem[] = [
      { cardId: 'c1', prompt: 'casa', answer: 'casa', lang: 'pt' },
      { cardId: 'c2', prompt: 'bola', answer: 'bola', lang: 'pt' },
      { cardId: 'c3', prompt: 'dedo', answer: 'dedo', lang: 'pt' },
      { cardId: 'c4', prompt: 'fogo', answer: 'fogo', lang: 'pt' },
    ]
    const { container } = render(<ShiritoriGame items={semCorrente} ageProfile="pro" onFinish={relatorio} onExit={saiu} />)

    expect(saiu).toHaveBeenCalledTimes(1)
    expect(relatorio).not.toHaveBeenCalled()
    expect(container.textContent).toBe('')
  })
})
