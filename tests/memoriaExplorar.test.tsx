// @vitest-environment jsdom
/**
 * MEMÓRIA: explorar não é errar. Virar duas cartas que não combinam só conta como erro (tentativa,
 * tremor, sequência zerada) quando o par da primeira já tinha aparecido. Conhecer a mesa não baixa a
 * nota de revisão de ninguém.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameItem, RoundReport } from '../src/core/minigames/types'

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
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
)

const { default: MemoryGame } = await import('../src/components/minigames/MemoryGame')

const itens: MinigameItem[] = [
  { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' },
  { cardId: 'c2', prompt: 'cachorro', answer: 'dog', lang: 'en' },
  { cardId: 'c3', prompt: 'gato', answer: 'cat', lang: 'en' },
]
const carta = (texto: string) => document.querySelector(`[data-texto="${texto}"]`) as HTMLButtonElement
const virar = (...textos: string[]) => {
  for (const t of textos) fireEvent.click(carta(t))
}
const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: false })
  render(<MemoryGame items={itens} ageProfile="pro" onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

const tentativas = () => Object.fromEntries((relatorio as RoundReport).items.map((o) => [o.itemRef, o.attempts]))

describe('Memória: explorar não é errar', () => {
  it('par que não combina com cartas nunca vistas volta sem a marca de erro', () => {
    virar('house', 'cachorro')
    expect(carta('house').className).toContain('virada')
    expect(carta('house').className).not.toContain('errou')
    esperar(850)
    expect(carta('house').className).not.toContain('virada')
  })

  it('quem só explorou e depois fechou tudo sai com uma tentativa por par', () => {
    virar('house', 'cachorro') // exploração
    esperar(850)
    virar('cat', 'gato') // de primeira
    virar('house', 'casa')
    virar('dog', 'cachorro')
    esperar(1100)
    expect(tentativas()).toEqual({ house: 1, dog: 1, cat: 1 })
  })

  it('errar o par que já tinha aparecido conta, com a marca de erro', () => {
    virar('house', 'cachorro') // exploração: viu house e cachorro
    esperar(850)
    virar('casa', 'gato') // exploração? não: o par de "casa" (house) já tinha aparecido
    expect(carta('casa').className).toContain('errou')
    esperar(850)
    virar('casa', 'house')
    virar('cat', 'gato')
    virar('dog', 'cachorro')
    esperar(1100)
    // house: o erro e o acerto. cat: "gato" entrou num erro sem ter sido vista antes, não conta.
    expect(tentativas()).toEqual({ house: 2, dog: 1, cat: 1 })
  })
})
