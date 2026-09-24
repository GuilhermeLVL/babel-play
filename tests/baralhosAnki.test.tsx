// @vitest-environment jsdom
/**
 * A ABA "GERENCIAR" DA TELA DO ANKI — o saldo por baralho tem de vir honesto: `descartadas` (a
 * régua recusou, é acionável) e `ausentes` (sumiu do arquivo, é histórico) nunca podem aparecer
 * como a mesma coisa, e o botão "Ativar mais" precisa sumir — não ficar morto — quando não resta
 * nada a ativar. Desde 24/09 ela é uma aba de `BaralhoAnki` (protótipo `T.anki`), não uma tela à
 * parte: a lista mora na tela e a aba mostra quantos baralhos há.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

afterEach(() => cleanup())
beforeAll(() => prepararDialogoNoJsdom())

vi.mock('../src/data/apiAnki', () => ({
  listarBaralhosAnki: vi.fn(),
  listarNotasDoBaralho: vi.fn(),
  ativarNotasDoBaralho: vi.fn(),
  desativarBaralho: vi.fn(),
  purgarBaralho: vi.fn(),
}))

import BaralhoAnki from '../src/components/views/BaralhoAnki'
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

function tela(extra: Partial<React.ComponentProps<typeof BaralhoAnki>> = {}) {
  return render(
    <BaralhoAnki
      deck={[]}
      idioma="en"
      idiomaNativo="pt"
      ageProfile="pro"
      onVoltar={() => {}}
      onImportou={() => {}}
      abaInicial="baralhos"
      {...extra}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listarNotasDoBaralho.mockResolvedValue({ itens: [], proximoCursor: null, total: 0 })
})

describe('Anki › Gerenciar', () => {
  it('é uma aba da tela do Anki, com a contagem de baralhos', async () => {
    mocks.listarBaralhosAnki.mockResolvedValue([baralho(), baralho({ id: 'deck-2', nome: 'Japonês' })])
    tela({ abaInicial: 'trazer' })
    const aba = await screen.findByRole('tab', { name: /Gerenciar/ })
    await waitFor(() => expect(aba.textContent).toContain('2'))
    fireEvent.click(aba)
    await waitFor(() => expect(screen.getByText('Japonês')).toBeTruthy())
  })

  it('mostra o saldo "N de M ativadas" e separa descartadas de ausentes', async () => {
    mocks.listarBaralhosAnki.mockResolvedValue([baralho()])
    tela()

    await waitFor(() => expect(screen.getByText('4000 Essential English Words')).toBeTruthy())

    expect(screen.getAllByText(/300/).length).toBeGreaterThan(0)
    expect(screen.getByText(/3600|3\.600/)).toBeTruthy()

    // descartadas e ausentes aparecem como rótulos DIFERENTES, não somados (40 + 12 = 52)
    expect(screen.getByText('40 descartadas')).toBeTruthy()
    expect(screen.getByText('12 ausentes')).toBeTruthy()
    expect(screen.queryByText(/52/)).toBeNull()
  })

  it('o botão "Ativar mais" some quando não resta nada a ativar (restantes === 0)', async () => {
    mocks.listarBaralhosAnki.mockResolvedValue([baralho({ total: 352, ativas: 300, descartadas: 40, ausentes: 12 })])
    tela()

    await waitFor(() => expect(screen.getByText('4000 Essential English Words')).toBeTruthy())
    expect(screen.queryByText(/Ativar mais/)).toBeNull()
  })

  it('mostra "Ativar mais N" quando há restantes, e chama a API com o lote', async () => {
    mocks.listarBaralhosAnki.mockResolvedValue([baralho({ total: 3600, ativas: 300, descartadas: 40, ausentes: 12 })])
    mocks.ativarNotasDoBaralho.mockResolvedValue({ ativadas: 300, restantes: 2948 })
    const onMudouBaralhos = vi.fn()
    tela({ onMudouBaralhos })

    await waitFor(() => expect(screen.getByText('4000 Essential English Words')).toBeTruthy())
    fireEvent.click(screen.getByText(/Ativar mais 300/))

    await waitFor(() => expect(mocks.ativarNotasDoBaralho).toHaveBeenCalledWith('deck-1', 300))
    await waitFor(() => expect(onMudouBaralhos).toHaveBeenCalled())
  })

  it('"Jogar só com este" devolve o baralho e o idioma a quem montou a tela', async () => {
    mocks.listarBaralhosAnki.mockResolvedValue([baralho()])
    const onJogarSoCom = vi.fn()
    tela({ onJogarSoCom })
    fireEvent.click(await screen.findByText(/Jogar só com este/))
    expect(onJogarSoCom).toHaveBeenCalledWith('deck-1', '4000 Essential English Words', 'en')
  })

  it('Apagar pede confirmação num diálogo antes de chamar a API', async () => {
    mocks.listarBaralhosAnki.mockResolvedValue([baralho()])
    mocks.purgarBaralho.mockResolvedValue({ notasApagadas: 3600 })
    tela()
    fireEvent.click(await screen.findByRole('button', { name: /^Apagar$/ }))
    expect(mocks.purgarBaralho).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: /Apagar de vez/ }))
    await waitFor(() => expect(mocks.purgarBaralho).toHaveBeenCalledWith('deck-1'))
    await waitFor(() => expect(screen.queryByText('4000 Essential English Words')).toBeNull())
  })

  it('estado vazio: nenhum baralho trazido ainda, com o caminho para trazer', async () => {
    mocks.listarBaralhosAnki.mockResolvedValue([])
    tela()

    await waitFor(() => expect(screen.getByText('Nenhum baralho trazido ainda')).toBeTruthy())
    fireEvent.click(screen.getByText(/Trazer meu primeiro baralho/))
    expect(screen.getByText(/Solte o arquivo aqui/)).toBeTruthy()
  })

  it('estado de erro mostra retry, e o retry rechama a API', async () => {
    mocks.listarBaralhosAnki.mockRejectedValueOnce(new Error('rede fora do ar')).mockResolvedValueOnce([baralho()])
    tela()

    await waitFor(() => expect(screen.getByText(/Não consegui carregar os seus baralhos/)).toBeTruthy())
    fireEvent.click(screen.getByText('Tentar de novo'))

    await waitFor(() => expect(screen.getByText('4000 Essential English Words')).toBeTruthy())
    expect(mocks.listarBaralhosAnki).toHaveBeenCalledTimes(2)
  })
})
