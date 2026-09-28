// @vitest-environment jsdom
/**
 * A GRADE DE CONQUISTAS v2: agrupada pelos quatro pilares, cada um com a contagem real "feitas/N",
 * e a secreta escondida (só a dica) até ser feita.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import Conquistas from '../src/components/views/Conquistas'
import { CONQUISTAS, PILARES_DE_CONQUISTA } from '../src/core'
import { EMPTY_PROGRESS } from '../src/lib/progress'

afterEach(cleanup)

function renderizar() {
  return render(<Conquistas progress={{ ...EMPTY_PROGRESS, available: true }} ctx={null} />)
}

describe('grade de conquistas por pilar', () => {
  beforeEach(() => localStorage.clear())

  it('um grupo por pilar, com feitas/total de verdade', () => {
    localStorage.setItem('babel.conquistas', JSON.stringify(['caderno-cheio', 'revisor', 'sem-erro']))
    const { container } = renderizar()
    for (const p of PILARES_DE_CONQUISTA) expect(screen.getByText(p.nome)).toBeTruthy()
    const total = (pilar: string) => CONQUISTAS.filter((c) => c.pilar === pilar).length
    const contagens = [...container.querySelectorAll('.entre .tn')]
      .map((e) => e.textContent)
      .filter((t) => /^\d+\/\d+$/.test(t ?? ''))
    expect(contagens).toEqual([
      `2/${total('vocabulario')}`,
      `0/${total('escuta')}`,
      `1/${total('jogos')}`,
      `0/${total('constancia')}`,
    ])
  })

  it('a secreta mostra só a dica até ser feita; feita, aparece com nome', () => {
    const mira = CONQUISTAS.find((c) => c.id === 'mira-fina')!
    renderizar()
    expect(screen.queryByText(mira.nome)).toBeNull()
    expect(screen.getByText(mira.dica!)).toBeTruthy()
    cleanup()
    localStorage.setItem('babel.conquistas', JSON.stringify(['mira-fina']))
    renderizar()
    expect(screen.getByText(mira.nome)).toBeTruthy()
  })

  it('"Como ganhar" não mostra ficha de +0: a regra sem XP (ou sem Seeds) só mostra o que rende', () => {
    const { container } = renderizar()
    const fichas = [...container.querySelectorAll('.badge')].map((b) => (b.textContent ?? '').trim())
    expect(fichas.length).toBeGreaterThan(0)
    expect(fichas.filter((f) => /^\+0\b/.test(f))).toEqual([])
    // Salvar palavra: Seeds sim, XP não.
    const salvar = screen.getByText('Salvar uma palavra nova da captura').closest('.cartao')!
    expect(salvar.textContent).not.toMatch(/XP/)
    expect(salvar.textContent).toMatch(/\+\d+/)
  })
})
