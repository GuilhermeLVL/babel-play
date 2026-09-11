// @vitest-environment jsdom
/**
 * D-006 — a metade visível do modelo híbrido: um grupo de rádio com as três notas de um acerto.
 * O contrato que importa: é um `radiogroup` (escolha exclusiva, anunciada como tal), a nota
 * pré-selecionada chega marcada, e clicar noutra devolve a nota ao chamador — que é quem manda ao
 * servidor. O intervalo de cada nota vem de fora (do agendador), nunca de string fixa.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import NotaDeRevisao from '../src/components/views/study/NotaDeRevisao'

afterEach(cleanup)

const PREVISAO = { 1: '10 min', 2: '1 d', 3: '3 d', 4: '8 d' } as const

describe('NotaDeRevisao', () => {
  it('é um radiogroup com as três notas do acerto e a padrão marcada', () => {
    render(<NotaDeRevisao opcoes={[2, 3, 4]} selecionada={3} aoEscolher={() => {}} previsao={PREVISAO} />)
    expect(screen.getByRole('radiogroup', { name: 'Nota da revisão' })).toBeTruthy()
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual(['Difícil1 d', 'Bom3 d', 'Fácil8 d'])
    expect(screen.getByRole('radio', { checked: true }).textContent).toContain('Bom')
  })

  it('clicar numa nota devolve o número dela ao chamador', () => {
    const escolhas: number[] = []
    render(
      <NotaDeRevisao opcoes={[2, 3, 4]} selecionada={3} aoEscolher={(n) => escolhas.push(n)} previsao={PREVISAO} />,
    )
    fireEvent.click(screen.getByRole('radio', { name: /Fácil/ }))
    expect(escolhas).toEqual([4])
  })

  it('sem previsão o intervalo é "—", nunca um número inventado', () => {
    render(<NotaDeRevisao opcoes={[2, 3, 4]} selecionada={4} aoEscolher={() => {}} previsao={null} />)
    expect(screen.getByRole('radio', { name: /Fácil/ }).textContent).toContain('—')
  })
})
