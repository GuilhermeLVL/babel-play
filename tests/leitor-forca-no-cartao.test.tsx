// @vitest-environment jsdom
/**
 * A FORÇA NO CARTÃO DA PALAVRA DO LEITOR (openspec `status-da-palavra-na-legenda`, 3.2): `HistoricoNaFolha` mostra
 * `ForcaDaPalavra` (1 a 4) como a legenda, só com a flag `forca_na_legenda` ligada e a palavra no caderno.
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const flag = vi.hoisted(() => ({ ligada: true }))
vi.mock('../src/lib/flags', async (original) => ({
  ...(await original<typeof import('../src/lib/flags')>()),
  useFlag: () => flag.ligada,
}))

import { HistoricoNaFolha } from '../src/components/views/leitor/ganchosDaPalavra'
import { esquecerIndiceDeEtiquetas, marcarSalva } from '../src/lib/etiquetas/indiceDeEtiquetas'

beforeEach(() => {
  flag.ligada = true
  esquecerIndiceDeEtiquetas()
})
afterEach(cleanup)

describe('HistoricoNaFolha (força no cartão do leitor)', () => {
  it.each([
    [1, 'nova'],
    [2, 'reconhecida'],
    [3, 'familiar'],
    [4, 'firme'],
  ] as const)('força %i aparece com o texto acessível', (forca, nome) => {
    marcarSalva('lantern', 'en', forca)
    render(<HistoricoNaFolha palavra="lantern" idioma="en" />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('data-forca')).toBe(String(forca))
    expect(img.getAttribute('aria-label')).toBe(`Força ${forca} de 4: ${nome}`)
  })

  it('palavra fora do caderno: nada', () => {
    const { container } = render(<HistoricoNaFolha palavra="ghost" idioma="en" />)
    expect(container.innerHTML).toBe('')
  })

  it('flag desligada: nada, mesmo com a palavra no caderno', () => {
    marcarSalva('lantern', 'en', 3)
    flag.ligada = false
    const { container } = render(<HistoricoNaFolha palavra="lantern" idioma="en" />)
    expect(container.innerHTML).toBe('')
  })
})

void React
