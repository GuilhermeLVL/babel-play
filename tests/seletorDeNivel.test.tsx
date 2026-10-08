// @vitest-environment jsdom
/**
 * O SELETOR DE NÍVEL da pausa (`src/components/minigames/casca/SeletorDeNivel.tsx`): três opções,
 * trocar guarda a escolha DESTE jogo e recomeça a rodada; jogo sem níveis não mostra nada.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SeletorDeNivel from '../src/components/minigames/casca/SeletorDeNivel'
import { lerNivelDoJogo } from '../src/lib/jogos/nivelDoJogo'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('o seletor de nível', () => {
  it('mostra os três níveis, com o Médio escolhido de fábrica', () => {
    render(<SeletorDeNivel jogo="tenis" aoTrocar={() => undefined} />)
    expect(screen.getByRole('group', { name: 'Nível' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Médio' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Fácil' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Difícil' })).toBeTruthy()
  })

  it('trocar guarda o nível deste jogo e recomeça a rodada', () => {
    const aoTrocar = vi.fn()
    render(<SeletorDeNivel jogo="tenis" aoTrocar={aoTrocar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fácil' }))
    expect(lerNivelDoJogo('tenis')).toBe('facil')
    expect(aoTrocar).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Fácil' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('tocar no nível que já vale não recomeça nada', () => {
    const aoTrocar = vi.fn()
    render(<SeletorDeNivel jogo="tenis" aoTrocar={aoTrocar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Médio' }))
    expect(aoTrocar).not.toHaveBeenCalled()
  })

  it('jogo sem regra que o nível mude não mostra o seletor', () => {
    const { container } = render(<SeletorDeNivel jogo="cadavre" aoTrocar={() => undefined} />)
    expect(container.innerHTML).toBe('')
  })
})
