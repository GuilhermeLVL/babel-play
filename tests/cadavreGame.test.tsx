// @vitest-environment jsdom
/**
 * O Cadavre Exquis é o único jogo de PRODUÇÃO da grade, e é por isso que ele é o mais fácil de
 * fazer mentir: escrever a palavra não prova que ela foi lembrada. Daí `writesSrs: false` em
 * `MINIGAMES` — mas o relatório continua tendo de sair certo: `gameId` próprio (ele reportava
 * `'blitz' as any`), `cardId` em todo outcome, e `onExit` quando a leva não fecha quatro.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import type { MinigameItem, RoundReport } from '../src/core/minigames/types'

vi.mock('../src/lib/juice', () => ({
  comemorar: vi.fn(), pontosDoElemento: vi.fn(), pontosFlutuantes: vi.fn(), tremor: vi.fn(),
  tremorDeTela: vi.fn(), pulsoDeZoom: vi.fn(), flashDeTela: vi.fn(), vibrar: vi.fn(),
  executarEfeito: vi.fn(), glitchDeTela: vi.fn(), multiplicador: () => 1,
}))
vi.mock('../src/lib/effects', () => ({ emitBurst: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))

const { default: CadavreExquisGame } = await import('../src/components/minigames/culturais/CadavreExquisGame')

function leva(): MinigameItem[] {
  return [
    { cardId: 'c1', prompt: 'rio', answer: 'river', lang: 'en' },
    { cardId: 'c2', prompt: 'ponte', answer: 'bridge', lang: 'en' },
    { cardId: 'c3', prompt: 'nuvem', answer: 'cloud', lang: 'en' },
    { cardId: 'c4', prompt: 'pedra', answer: 'stone', lang: 'en' },
  ]
}

function escrever(frase: string): void {
  fireEvent.change(screen.getByLabelText('Sua frase'), { target: { value: frase } })
}

describe('CadavreExquisGame — quatro palavras, uma frase', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('o relatório sai com gameId próprio e cardId em todo outcome', () => {
    let relatorio: RoundReport | null = null
    render(<CadavreExquisGame items={leva()} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    escrever('The river carried a stone under the bridge into a cloud.')
    fireEvent.click(screen.getByRole('button', { name: /Conferir/ }))
    expect(relatorio).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(relatorio!.gameId).toBe('cadavre')
    expect(relatorio!.items).toHaveLength(4)
    expect(relatorio!.items.map(o => o.cardId)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(relatorio!.items.every(o => o.correct)).toBe(true)
  })

  /* `correct` é MEDIDO na frase — a palavra que não entrou não vira acerto, e a flexão conta
     (é a mesma régua que impede uma pista de entregar a resposta). */
  it('a palavra ausente não vira acerto; a flexão da que entrou vira', () => {
    let relatorio: RoundReport | null = null
    render(<CadavreExquisGame items={leva()} ageProfile="pro" onFinish={r => { relatorio = r }} onExit={() => {}} />)

    escrever('Two rivers, one bridge, no clouds.')
    fireEvent.click(screen.getByRole('button', { name: /Conferir/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    const porPalavra = Object.fromEntries(relatorio!.items.map(o => [o.itemRef, o.correct]))
    expect(porPalavra).toEqual({ river: true, bridge: true, cloud: true, stone: false })
  })

  it('com menos de quatro palavras a rodada não nasce: chama onExit', () => {
    const saiu = vi.fn()
    const relatorio = vi.fn()
    const { container } = render(
      <CadavreExquisGame items={leva().slice(0, 3)} ageProfile="pro" onFinish={relatorio} onExit={saiu} />,
    )

    expect(saiu).toHaveBeenCalledTimes(1)
    expect(relatorio).not.toHaveBeenCalled()
    expect(container.textContent).toBe('')
  })
})
