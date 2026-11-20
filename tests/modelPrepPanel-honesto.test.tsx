// @vitest-environment jsdom
/**
 * O PRIMEIRO DOWNLOAD DIZ O QUE ESTÁ ACONTECENDO E QUANTO FALTA (carga-rapida-no-celular, 4.1 a 4.3): as duas barras
 * desde o aceite (o tradutor "na fila"), a velocidade medida, quando a legenda começa, as falas guardadas e, com a
 * estimativa acima de 2 min, as saídas (o modelo menor; só a transcrição quando o tradutor baixa junto).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ModelPrepPanel, { type ModelPrepState } from '../src/components/ModelPrepPanel'

afterEach(() => cleanup())

const MB = 1024 * 1024
const em3g: ModelPrepState = {
  whisper: 0.1,
  mt: null,
  mtNaFila: true,
  mbTradutor: 113,
  whisperBytes: { loaded: 8 * MB, total: 76 * MB },
  vazaoMbps: 1.3,
  trechosGuardados: 3,
  fromCache: false,
  error: null,
  done: false,
}

describe('ModelPrepPanel no primeiro download', () => {
  it('o tradutor aparece desde o aceite, na fila, e a ordem fica dita', () => {
    render(<ModelPrepPanel state={em3g} />)
    expect(screen.getByText('Transcrição (Whisper)')).toBeTruthy()
    expect(screen.getByText('Tradutor (opus-mt)')).toBeTruthy()
    expect(screen.getByText('na fila')).toBeTruthy()
    expect(screen.getByText(/O tradutor começa a baixar quando a transcrição terminar/)).toBeTruthy()
  })

  it('a velocidade medida, quando a legenda começa e as falas guardadas', () => {
    render(<ModelPrepPanel state={em3g} />)
    expect(screen.getByTestId('estimativa-do-preparo').textContent).toMatch(
      /A legenda começa em cerca de \d+ a \d+ min/,
    )
    expect(screen.getByTestId('estimativa-do-preparo').textContent).toMatch(/1,3 Mbit\/s/)
    expect(screen.getByText(/3 falas guardadas/)).toBeTruthy()
  })

  it('acima de 2 min, oferece o modelo menor; só a transcrição só quando o tradutor baixa junto', () => {
    const aoModeloMenor = vi.fn()
    const aoSoTranscricao = vi.fn()
    const { rerender } = render(<ModelPrepPanel state={em3g} saidas={{ aoModeloMenor, aoSoTranscricao }} />)
    expect(screen.queryByRole('button', { name: /Começar só com a transcrição/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Usar um modelo menor/ }))
    expect(aoModeloMenor).toHaveBeenCalledTimes(1)

    rerender(
      <ModelPrepPanel
        state={{ ...em3g, mt: 0.05, mtNaFila: false, mtBytes: { loaded: 5 * MB, total: 113 * MB } }}
        saidas={{ aoModeloMenor, aoSoTranscricao }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Começar só com a transcrição/ }))
    expect(aoSoTranscricao).toHaveBeenCalledTimes(1)
  })

  it('rede boa (menos de 2 min): sem as saídas', () => {
    render(
      <ModelPrepPanel
        state={{ ...em3g, vazaoMbps: 40 }}
        saidas={{ aoModeloMenor: () => undefined, aoSoTranscricao: () => undefined }}
      />,
    )
    expect(screen.queryByRole('button', { name: /Usar um modelo menor/ })).toBeNull()
  })
})
