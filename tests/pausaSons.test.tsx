// @vitest-environment jsdom
/**
 * O INTERRUPTOR "SONS" DA PAUSA liga e desliga o som DO APP (decisão do dono, 24/09): é o mesmo
 * `soundEnabled`/`toggleSound` do `App.tsx`, não um estado só da rodada.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import CascaDaRodada from '../src/components/minigames/casca/CascaDaRodada'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

function ComSom() {
  const [ligado, setLigado] = useState(true)
  return (
    <>
      <span data-testid="estado">{ligado ? 'ligado' : 'desligado'}</span>
      <CascaDaRodada
        jogo="memory"
        titulo="Memória"
        total={6}
        unidade="palavras"
        ageProfile="pro"
        onRecomecar={() => {}}
        onSair={() => {}}
        som={{ ligado, alternar: () => setLigado((v) => !v) }}
      >
        <p>tabuleiro</p>
      </CascaDaRodada>
    </>
  )
}

describe('pausa da rodada — Sons', () => {
  beforeAll(() => prepararDialogoNoJsdom())
  /* A explicação da primeira partida já foi vista: a rodada começa direto, e o Esc pausa. */
  beforeEach(() => localStorage.setItem('babel_tour_memory', '1'))
  afterEach(() => {
    cleanup()
    localStorage.clear()
  })
  /* O cabeçalho do protótipo não tem "Pausar": quem pausa é o Esc (ou o P). */
  const pausar = () => fireEvent.keyDown(window, { key: 'Escape' })

  it('mostra o interruptor com o estado do app e alterna o som de verdade', () => {
    render(<ComSom />)
    pausar()
    const sw = screen.getByRole('switch', { name: 'Sons do jogo' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    expect(screen.getByTestId('estado').textContent).toBe('desligado')
    expect(screen.getByRole('switch', { name: 'Sons do jogo' }).getAttribute('aria-checked')).toBe('false')
  })

  it('sem o som do app (uso isolado), a linha não aparece', () => {
    render(
      <CascaDaRodada
        jogo="memory"
        titulo="Memória"
        total={6}
        unidade="palavras"
        ageProfile="pro"
        onRecomecar={() => {}}
        onSair={() => {}}
      >
        <p>tabuleiro</p>
      </CascaDaRodada>,
    )
    pausar()
    expect(screen.queryByRole('switch', { name: 'Sons do jogo' })).toBeNull()
  })
})
