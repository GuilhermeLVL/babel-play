// @vitest-environment jsdom
/**
 * A SUGESTÃO DE NÍVEL no fim da rodada (`casca/SugestaoDeNivel.tsx` e `sugestaoDeNivel` em
 * `core/minigames/regras.ts`): um degrau abaixo para quem errou mais da metade, um acima para quem não
 * errou nada, e nada muda sem o toque.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SugestaoDeNivel from '../src/components/minigames/casca/SugestaoDeNivel'
import { sugestaoDeNivel } from '../src/core/minigames/regras'
import { guardarNivelDoJogo, lerNivelDoJogo } from '../src/lib/jogos/nivelDoJogo'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('a regra da sugestão', () => {
  it('desce um degrau abaixo de 50% e sobe um com 100%', () => {
    expect(sugestaoDeNivel('tenis', 'medio', 40)).toBe('facil')
    expect(sugestaoDeNivel('tenis', 'dificil', 0)).toBe('medio')
    expect(sugestaoDeNivel('tenis', 'medio', 100)).toBe('dificil')
    expect(sugestaoDeNivel('tenis', 'facil', 100)).toBe('medio')
  })

  it('no meio do caminho, e nas pontas, não oferece nada', () => {
    expect(sugestaoDeNivel('tenis', 'medio', 50)).toBeNull()
    expect(sugestaoDeNivel('tenis', 'medio', 99)).toBeNull()
    expect(sugestaoDeNivel('tenis', 'facil', 10)).toBeNull()
    expect(sugestaoDeNivel('tenis', 'dificil', 100)).toBeNull()
  })

  it('jogo sem níveis nunca recebe sugestão', () => {
    expect(sugestaoDeNivel('cadavre', 'medio', 0)).toBeNull()
  })
})

describe('a oferta no fim da rodada', () => {
  it('rodada puxada: oferece o Fácil, e aceitar guarda o nível e joga de novo', () => {
    const aoRepetir = vi.fn()
    render(<SugestaoDeNivel jogo="tenis" precisao={30} aoRepetir={aoRepetir} />)
    expect(screen.getByRole('note').textContent).toContain('No Fácil o jogo aperta menos')
    expect(lerNivelDoJogo('tenis')).toBe('medio')
    fireEvent.click(screen.getByRole('button', { name: 'Jogar no Fácil' }))
    expect(lerNivelDoJogo('tenis')).toBe('facil')
    expect(aoRepetir).toHaveBeenCalledOnce()
  })

  it('rodada sem erro: oferece o degrau de cima; sem repetição possível, fica para a próxima', () => {
    guardarNivelDoJogo('tenis', 'facil')
    render(<SugestaoDeNivel jogo="tenis" precisao={100} aoRepetir={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Jogar no Médio' }))
    expect(lerNivelDoJogo('tenis')).toBe('medio')
    expect(screen.getByRole('note').textContent).toContain('a próxima rodada deste jogo vem no Médio')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('rodada mediana, ou jogo sem níveis: não mostra nada', () => {
    const { container, rerender } = render(<SugestaoDeNivel jogo="tenis" precisao={75} aoRepetir={null} />)
    expect(container.innerHTML).toBe('')
    rerender(<SugestaoDeNivel jogo="cadavre" precisao={0} aoRepetir={null} />)
    expect(container.innerHTML).toBe('')
  })
})
