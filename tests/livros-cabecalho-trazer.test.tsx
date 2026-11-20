// @vitest-environment jsdom
/**
 * O DESTAQUE DE "TRAZER UM LIVRO SEU": o botão primário no cabeçalho da tela Livros aparece em todas as abas
 * (inclusive no estado vazio de Meus livros e no catálogo vazio) e leva direto à aba "Trazer o seu".
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/livros/catalogo', () => ({
  carregarCatalogo: vi.fn(async () => ({
    versao: 1,
    ano: 2026,
    anoLimite: 1955,
    geradoEm: '2026-10-26T12:00:00.000Z',
    livros: [],
    exclusoes: [],
  })),
}))

import Livros from '../src/components/views/Livros'

afterEach(cleanup)

const montar = () => render(<Livros livroAberto={null} ageProfile={'adult' as never} />)

describe('botão "Trazer um livro seu" no cabeçalho', () => {
  it('aparece no catálogo, em Meus livros (vazio) e leva à aba Trazer o seu', async () => {
    montar()
    const botao = await screen.findByTestId('trazer-um-livro-seu')
    expect(botao.textContent).toMatch(/Trazer um livro seu/)
    fireEvent.click(screen.getByRole('tab', { name: /Meus livros/ }))
    expect(screen.getByTestId('meus-livros')).toBeTruthy()
    expect(screen.getByTestId('trazer-um-livro-seu')).toBeTruthy()
    fireEvent.click(screen.getByTestId('trazer-um-livro-seu'))
    await waitFor(() => expect(screen.getByTestId('trazer-o-seu')).toBeTruthy())
    expect(screen.getByRole('tab', { name: /Trazer o seu/ }).getAttribute('aria-selected')).toBe('true')
    /* e continua lá, na própria aba */
    expect(screen.getByTestId('trazer-um-livro-seu')).toBeTruthy()
  })
})
