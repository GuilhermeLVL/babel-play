// @vitest-environment jsdom
/**
 * DITADO, a segunda chance: a primeira conferência abaixo de 80% não fecha a fala. O texto fica no
 * campo, a pessoa corrige, e só a segunda conferência vale. A correção palavra a palavra não aparece
 * antes disso (seria a resposta).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RodadaDitado, RoundReport } from '../src/core/minigames/types'

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

const { default: DitadoGame } = await import('../src/components/minigames/DitadoGame')

const rodadas = [
  {
    fala: { id: 'd1', text: 'Where is the train station', lang: 'en', startMs: 0, endMs: 0, translation: 'Onde fica' },
    palavras: 5,
  },
] as unknown as RodadaDitado[]

const campo = () => document.querySelector('[data-tour="entrada"]') as HTMLInputElement
const escrever = (texto: string) => fireEvent.change(campo(), { target: { value: texto } })
const conferir = () => fireEvent.click(screen.getByRole('button', { name: /Conferir/ }))
const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  vi.useFakeTimers({ shouldAdvanceTime: false })
  render(
    <DitadoGame
      rodadas={rodadas}
      audioUrl=""
      ageProfile="pro"
      onFinish={(r) => (relatorio = r)}
      onExit={() => undefined}
    />,
  )
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('Ditado: a segunda chance', () => {
  it('a primeira conferência abaixo de 80% não fecha a fala nem mostra a correção', () => {
    escrever('Where is the bus')
    conferir()
    expect(document.querySelector('[data-aviso-da-jogada="aviso"]')?.textContent).toMatch(/3 de 5 palavras no lugar/)
    expect(document.querySelector('[data-qp="correcao"]')).toBeNull()
    expect(campo().disabled).toBe(false)
    expect(campo().value).toBe('Where is the bus')
  })

  it('corrigiu na segunda: a fala fecha certa, com duas tentativas', () => {
    escrever('Where is the bus')
    conferir()
    escrever('Where is the train station')
    conferir()
    expect(document.querySelector('[data-qp="correcao"]')).not.toBeNull()
    esperar(1200 + 900)
    expect((relatorio as RoundReport | null)?.items[0]).toMatchObject({ correct: true, attempts: 2 })
  })

  it('errou de novo: aí sim a fala fecha errada, com a correção à vista', () => {
    escrever('Where is the bus')
    conferir()
    conferir()
    expect(document.querySelector('[data-qp="correcao"]')).not.toBeNull()
    esperar(3200 + 900)
    expect((relatorio as RoundReport | null)?.items[0]).toMatchObject({ correct: false, attempts: 2 })
  })

  it('acertou de primeira: nada muda, uma tentativa', () => {
    escrever('Where is the train station')
    conferir()
    esperar(1200 + 900)
    expect((relatorio as RoundReport | null)?.items[0]).toMatchObject({ correct: true, attempts: 1 })
  })
})
