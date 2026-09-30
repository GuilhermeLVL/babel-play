// @vitest-environment jsdom
/**
 * A FOLHA DA FRASE ganha "Ouvir tradução" (E3 da Fase E): até aqui todo "Ouvir" falava o ORIGINAL.
 * O botão lê a tradução, no idioma DELA; sem tradução (ou com o "…" de quando ela ainda vem), não
 * aparece.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import FolhaDaFrase, { type FalaTocada } from '../src/components/views/captura/celular/FolhaDaFrase'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

beforeAll(prepararDialogoNoJsdom)
afterEach(() => cleanup())

function montar(fala: FalaTocada) {
  const aoOuvir = vi.fn()
  render(<FolhaDaFrase fala={fala} aoOuvir={aoOuvir} aoTocarPalavra={vi.fn()} aoFechar={vi.fn()} />)
  return { aoOuvir }
}

describe('FolhaDaFrase: Ouvir tradução', () => {
  it('lê a tradução no idioma dela', () => {
    const { aoOuvir } = montar({
      id: 'a',
      texto: 'bom dia',
      traducao: 'good morning',
      lang: 'pt-BR',
      langDaTraducao: 'en-US',
    })
    fireEvent.click(screen.getByRole('button', { name: /Ouvir tradução/ }))
    expect(aoOuvir).toHaveBeenCalledWith('good morning', 'en-US', false)
  })

  it('o Ouvir de sempre continua lendo o original', () => {
    const { aoOuvir } = montar({
      id: 'a',
      texto: 'bom dia',
      traducao: 'good morning',
      lang: 'pt-BR',
      langDaTraducao: 'en-US',
    })
    fireEvent.click(screen.getByRole('button', { name: /^Ouvir$/ }))
    expect(aoOuvir).toHaveBeenCalledWith('bom dia', 'pt-BR', false)
  })

  it('sem tradução (ou ainda a caminho), o botão não aparece', () => {
    montar({ id: 'a', texto: 'bom dia', traducao: '…', lang: 'pt-BR', langDaTraducao: 'en-US' })
    expect(screen.queryByRole('button', { name: /Ouvir tradução/ })).toBeNull()
    cleanup()
    montar({ id: 'b', texto: 'bom dia', traducao: 'good morning', lang: 'pt-BR' })
    expect(screen.queryByRole('button', { name: /Ouvir tradução/ })).toBeNull()
  })
})
