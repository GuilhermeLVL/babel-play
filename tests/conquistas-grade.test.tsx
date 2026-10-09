// @vitest-environment jsdom
/**
 * A GRADE DE CONQUISTAS v2: agrupada pelos quatro pilares, cada um com a contagem real "feitas/N",
 * e a secreta escondida (só a dica) até ser feita.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

  it('um botão por pilar, com feitas/total de verdade, e o pilar escolhido filtra a grade', () => {
    localStorage.setItem('babel.conquistas', JSON.stringify(['caderno-cheio', 'revisor', 'sem-erro']))
    const { container } = renderizar()
    const pilares = within(screen.getByRole('group', { name: 'Pilares das conquistas' }))
    const total = (pilar: string) => CONQUISTAS.filter((c) => c.pilar === pilar).length
    const contagem = (nome: string) =>
      pilares.getByRole('button', { name: new RegExp(`^${nome}`) }).querySelector('.n')?.textContent
    expect(contagem('Todos')).toBe(`3/${CONQUISTAS.length}`)
    const feitas: Record<string, number> = { vocabulario: 2, escuta: 0, jogos: 1, constancia: 0 }
    for (const p of PILARES_DE_CONQUISTA) expect(contagem(p.nome), p.id).toBe(`${feitas[p.id]}/${total(p.id)}`)

    expect(container.querySelectorAll('.conq')).toHaveLength(CONQUISTAS.length)
    const jogos = PILARES_DE_CONQUISTA.find((p) => p.id === 'jogos')!
    fireEvent.click(pilares.getByRole('button', { name: new RegExp(`^${jogos.nome}`) }))
    expect(container.querySelectorAll('.conq')).toHaveLength(total('jogos'))
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
    renderizar()
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Partes dos desafios' })).getByRole('button', { name: /Como ganhar/ }),
    )
    const secao = screen.getByText('Como ganhar Seeds e XP').closest('section')!
    /* Nenhum ganho de zero em lugar nenhum da parte. */
    expect(secao.textContent).not.toMatch(/\+0(?![\d.,])/)
    // Salvar palavra: Seeds sim, XP não.
    const frase = within(secao).getByText('Salvar uma palavra nova da captura')
    let salvar: HTMLElement = frase
    while (salvar.parentElement && salvar.parentElement !== secao && !/\+\d/.test(salvar.textContent ?? ''))
      salvar = salvar.parentElement
    expect(salvar.textContent).toMatch(/\+\d+/)
    expect(salvar.textContent).not.toMatch(/XP/)
  })
})
