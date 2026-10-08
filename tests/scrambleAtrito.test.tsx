// @vitest-environment jsdom
/**
 * FRASE EMBARALHADA, menos atrito: conferiu e errou, o começo que já está certo fica na linha e as
 * outras palavras voltam sozinhas para as peças. Antes a pessoa tirava uma por uma.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/juice', () => ({
  contarAte: vi.fn(async () => {}),
  comemorar: vi.fn(),
  pontosDoElemento: vi.fn(),
  pontosFlutuantes: vi.fn(),
  tremor: vi.fn(),
  tremorDeTela: vi.fn(),
  pulsoDeZoom: vi.fn(),
  flashDeTela: vi.fn(),
  vibrar: vi.fn(),
  executarEfeito: vi.fn(),
  glitchDeTela: vi.fn(),
  multiplicador: () => 1,
}))
vi.mock('../src/lib/effects', () => ({ emitBurst: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn(), somMudo: () => true }))

const { default: ScrambleGame } = await import('../src/components/minigames/ScrambleGame')

const rodadas = [
  {
    correta: ['Ich', 'bin', 'heute', 'hier'],
    embaralhada: ['hier', 'Ich', 'heute', 'bin'],
    traducao: 'Estou aqui hoje',
    lang: 'de',
  },
]
const naLinha = () => [...document.querySelectorAll('[data-posta="true"]')].map((b) => b.textContent)
const montar = (palavras: string[]) => {
  for (const p of palavras) {
    const peca = [...document.querySelectorAll<HTMLButtonElement>('[data-tour="pecas"] button')].find(
      (b) => b.textContent === p,
    )
    fireEvent.click(peca as HTMLButtonElement)
  }
}
const conferir = () => fireEvent.click(screen.getByRole('button', { name: /Conferir/ }))

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: false }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('Frase embaralhada: as erradas voltam sozinhas', () => {
  it('o começo certo fica na linha e o resto volta para as peças', () => {
    render(<ScrambleGame rodadas={rodadas} ageProfile="pro" onFinish={() => undefined} onExit={() => undefined} />)
    montar(['Ich', 'bin', 'hier', 'heute'])
    conferir()
    expect(screen.getByText(/O começo está certo: 2 palavras ficam/)).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1400)
    })
    expect(naLinha()).toEqual(['Ich', 'bin'])
    expect(document.querySelectorAll('[data-tour="pecas"] button')).toHaveLength(2)
  })

  it('com a primeira palavra errada, todas voltam; e a rodada ainda fecha certa', () => {
    let relatorio: { items: { correct: boolean; attempts: number }[] } | null = null
    render(
      <ScrambleGame
        rodadas={rodadas}
        ageProfile="pro"
        onFinish={(r) => (relatorio = r as never)}
        onExit={() => undefined}
      />,
    )
    montar(['hier', 'Ich', 'bin', 'heute'])
    conferir()
    expect(screen.getByText(/A primeira palavra é outra/)).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(1400)
    })
    expect(naLinha()).toEqual([])
    montar(['Ich', 'bin', 'heute', 'hier'])
    conferir()
    act(() => {
      vi.advanceTimersByTime(1400 + 900)
    })
    expect((relatorio as { items: { correct: boolean; attempts: number }[] } | null)?.items[0]).toMatchObject({
      correct: true,
      attempts: 2,
    })
  })
})
