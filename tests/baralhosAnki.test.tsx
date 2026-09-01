// @vitest-environment jsdom
/**
 * BaralhosAnki — o saldo por baralho tem de vir honesto: `descartadas` (a régua recusou, é
 * acionável) e `ausentes` (sumiu do arquivo, é histórico) nunca podem aparecer como a mesma
 * coisa, e o botão "ativar mais" precisa sumir — não ficar morto — quando não resta nada a ativar.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

afterEach(() => cleanup())

vi.mock('../src/data/apiAnki', () => ({
  listarBaralhosAnki: vi.fn(),
  listarNotasDoBaralho: vi.fn(),
  ativarNotasDoBaralho: vi.fn(),
  desativarBaralho: vi.fn(),
  purgarBaralho: vi.fn(),
}))

import BaralhosAnki from '../src/components/views/BaralhosAnki'
import * as apiAnki from '../src/data/apiAnki'

const mocks = apiAnki as unknown as {
  listarBaralhosAnki: ReturnType<typeof vi.fn>
  listarNotasDoBaralho: ReturnType<typeof vi.fn>
  ativarNotasDoBaralho: ReturnType<typeof vi.fn>
  desativarBaralho: ReturnType<typeof vi.fn>
  purgarBaralho: ReturnType<typeof vi.fn>
}

function baralho(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'deck-1',
    nome: '4000 Essential English Words',
    arquivoOrigem: 'essential.apkg',
    estado: 'ativo',
    idiomaOrigem: 'en',
    idiomaAlvo: 'pt',
    createdAt: Date.now(),
    total: 3600,
    ativas: 300,
    descartadas: 40,
    ausentes: 12,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listarNotasDoBaralho.mockResolvedValue({ itens: [], proximoCursor: null, total: 0 })
})

describe('BaralhosAnki', () => {
  it('mostra o saldo "N de M ativadas" e separa descartadas de ausentes', async () => {
    mocks.listarBaralhosAnki.mockResolvedValue([baralho()])
    render(<BaralhosAnki onVoltar={() => {}} onImportar={() => {}} />)

    await waitFor(() => expect(screen.getByText('4000 Essential English Words')).toBeTruthy())

    // O saldo: "300 de 3.600 ativadas"
    expect(screen.getAllByText(/300/).length).toBeGreaterThan(0)
    expect(screen.getByText(/3600|3\.600/)).toBeTruthy()

    // descartadas e ausentes aparecem como rótulos DIFERENTES, não somados (40 + 12 = 52 não deve existir como rótulo único)
    expect(screen.getByText('40 descartadas')).toBeTruthy()
    expect(screen.getByText('12 ausentes')).toBeTruthy()
    expect(screen.queryByText(/52/)).toBeNull()
  })

  it('o botão "ativar mais" some quando não resta nada a ativar (restantes === 0)', async () => {
    // total = ativas + descartadas + ausentes → restantes = 0
    mocks.listarBaralhosAnki.mockResolvedValue([baralho({ total: 352, ativas: 300, descartadas: 40, ausentes: 12 })])
    render(<BaralhosAnki onVoltar={() => {}} onImportar={() => {}} />)

    await waitFor(() => expect(screen.getByText('4000 Essential English Words')).toBeTruthy())
    expect(screen.queryByText(/Ativar mais/)).toBeNull()
  })

  it('mostra o botão "ativar mais N" quando há restantes, e chama a API ao clicar', async () => {
    mocks.listarBaralhosAnki.mockResolvedValue([baralho({ total: 3600, ativas: 300, descartadas: 40, ausentes: 12 })])
    mocks.ativarNotasDoBaralho.mockResolvedValue({ ativadas: 300, restantes: 2948 })
    render(<BaralhosAnki onVoltar={() => {}} onImportar={() => {}} />)

    await waitFor(() => expect(screen.getByText('4000 Essential English Words')).toBeTruthy())
    const botao = screen.getByText(/Ativar mais/)
    fireEvent.click(botao)

    await waitFor(() => expect(mocks.ativarNotasDoBaralho).toHaveBeenCalledWith('deck-1'))
  })

  it('estado vazio: nenhum baralho importado ainda', async () => {
    mocks.listarBaralhosAnki.mockResolvedValue([])
    render(<BaralhosAnki onVoltar={() => {}} onImportar={() => {}} />)

    await waitFor(() => expect(screen.getByText('Nenhum baralho importado ainda')).toBeTruthy())
  })

  it('estado de erro mostra retry, e o retry rechama a API', async () => {
    mocks.listarBaralhosAnki
      .mockRejectedValueOnce(new Error('rede fora do ar'))
      .mockResolvedValueOnce([baralho()])
    render(<BaralhosAnki onVoltar={() => {}} onImportar={() => {}} />)

    await waitFor(() => expect(screen.getByText(/Não consegui carregar seus baralhos/)).toBeTruthy())
    fireEvent.click(screen.getByText('Tentar de novo'))

    await waitFor(() => expect(screen.getByText('4000 Essential English Words')).toBeTruthy())
    expect(mocks.listarBaralhosAnki).toHaveBeenCalledTimes(2)
  })
})
