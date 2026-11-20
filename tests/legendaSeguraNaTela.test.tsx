// @vitest-environment jsdom
/**
 * O MARCADOR DA LEGENDA SEGURA NA TELA (change `legenda-segura-para-menores`, tarefa 2.3): o `•••` tem rótulo acessível
 * ("palavra ocultada") na lista e no painel flutuante (PiP).
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import LinhaDaLegenda from '../src/components/views/captura/legendas/LinhaDaLegenda'
import { TextoComOcultas } from '../src/components/views/captura/legendas/TextoComOcultas'

afterEach(cleanup)

const ROTULO = /Palavra ocultada: o reconhecimento pode ter entendido errado/

describe('TextoComOcultas', () => {
  it('o leitor de tela ouve o rótulo no lugar do marcador', () => {
    const { container } = render(<TextoComOcultas texto="reveal the ••• quest together" />)
    const marcador = screen.getByRole('img', { name: ROTULO })
    expect(marcador.textContent).toBe('•••')
    expect(container.textContent).toBe('reveal the ••• quest together')
  })

  it('sem marcador, o texto volta como veio', () => {
    const { container } = render(<TextoComOcultas texto="nada a ocultar" />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(container.textContent).toBe('nada a ocultar')
  })
})

describe('painel flutuante (PiP)', () => {
  it('original e tradução com o marcador rotulado', () => {
    const { container } = render(
      <LinhaDaLegenda
        fala={{
          id: '1',
          quem: 'Outros',
          original: 'reveal the ••• quest together',
          traducao: 'revelar a busca ••• juntos',
          lado: 'eles',
          lang: 'en',
        }}
        modo="jogo"
        modoDaTraducao="sempre"
        traducaoVisivel
        emFoco
        aoTocarPalavra={() => {}}
        aoCopiar={() => {}}
      />,
    )
    expect(screen.getAllByRole('img', { name: ROTULO })).toHaveLength(2)
    expect(container.textContent).not.toMatch(/porn/i)
  })
})
