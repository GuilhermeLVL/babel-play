// @vitest-environment jsdom
/**
 * O CACHE É POR PEÇA (dono, 23/10/2026: "toda vez que abro parece que baixa de novo"). O título do
 * painel segue o modelo de transcrição: com ele no navegador, a tela diz "Carregando (já em cache)",
 * mesmo que o tradutor local nunca tenha baixado (no Chrome traduz a Translator API). Só quando o
 * tradutor de fato baixa o título fala dele.
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import ModelPrepPanel from '../src/components/ModelPrepPanel'

afterEach(() => cleanup())

describe('ModelPrepPanel e o cache', () => {
  it('Whisper no cache e nenhum tradutor local carregando: "Carregando (já em cache)"', () => {
    render(
      <ModelPrepPanel
        state={{ whisper: 0.3, mt: null, fromCache: true, mtFromCache: false, error: null, done: false }}
      />,
    )
    expect(screen.getByText(/Carregando modelo \(já em cache\)/)).toBeTruthy()
    expect(screen.queryByText(/Baixando/)).toBeNull()
  })

  it('Whisper no cache e o tradutor baixando de verdade: o título fala só do tradutor', () => {
    render(
      <ModelPrepPanel state={{ whisper: 1, mt: 0.2, fromCache: true, mtFromCache: false, error: null, done: false }} />,
    )
    expect(screen.getByText(/Baixando o tradutor \(uma vez só\)/)).toBeTruthy()
    expect(screen.queryByText(/Baixando modelo/)).toBeNull()
  })

  it('nada no cache: "Baixando modelo (uma vez só)"', () => {
    render(
      <ModelPrepPanel
        state={{ whisper: 0.1, mt: null, fromCache: false, mtFromCache: false, error: null, done: false }}
      />,
    )
    expect(screen.getByText(/Baixando modelo \(uma vez só\)/)).toBeTruthy()
  })
})
