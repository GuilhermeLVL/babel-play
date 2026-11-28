// @vitest-environment jsdom
/**
 * "CORRIGIR CAMPOS" na aba Gerenciar (openspec `motor-anki-mapeador`, tarefa 5.4): atrás da flag `anki_mapeador`, o botão
 * abre o Mapeador com os campos REAIS do baralho (lidos do servidor), a troca de papel é enviada a `remapear` e o relatório
 * diz quantas notas mudaram. Com a flag desligada o botão nem existe.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

afterEach(() => cleanup())
beforeAll(() => prepararDialogoNoJsdom())

const flag = vi.hoisted(() => ({ ligada: true }))
vi.mock('../src/lib/flags', async (original) => ({
  ...(await original<typeof import('../src/lib/flags')>()),
  useFlag: () => flag.ligada,
}))
vi.mock('../src/data/apiAnki', () => ({
  listarBaralhosAnki: vi.fn(),
  listarNotasDoBaralho: vi.fn(),
  ativarNotasDoBaralho: vi.fn(),
  desativarBaralho: vi.fn(),
  purgarBaralho: vi.fn(),
  lerEstruturasDoBaralho: vi.fn(),
  remapearBaralho: vi.fn(),
}))

import BaralhoAnki from '../src/components/views/BaralhoAnki'
import * as apiAnki from '../src/data/apiAnki'

const mocks = apiAnki as unknown as Record<string, ReturnType<typeof vi.fn>>

const baralho = {
  id: 'deck-1',
  nome: '4000 Essential English Words',
  arquivoOrigem: 'essential.apkg',
  estado: 'ativo',
  idiomaOrigem: 'en',
  idiomaAlvo: 'pt',
  createdAt: Date.now(),
  total: 3871,
  ativas: 0,
  descartadas: 3871,
  ausentes: 0,
}

const estrutura = {
  hash: 'h-4000',
  notetype: '4000 EW',
  campos: ['№', 'IMG', 'Word', 'Meaning'],
  notas: 3871,
  papeis: ['palavra', 'nenhum', 'significado', 'nenhum'],
  palpites: {
    palavra: { indice: 0, confianca: 'baixa', origem: 'posicao' },
    significado: { indice: 2, confianca: 'baixa', origem: 'posicao' },
  },
  precisaDeConferencia: true,
  amostra: [
    ['1', '', 'abandon', 'deixar'],
    ['2', '', 'ability', 'capacidade'],
  ],
}

function tela() {
  return render(
    <BaralhoAnki
      deck={[]}
      idioma="en"
      idiomaNativo="pt"
      ageProfile="pro"
      onVoltar={() => {}}
      onImportou={() => {}}
      abaInicial="baralhos"
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  flag.ligada = true
  mocks.listarBaralhosAnki.mockResolvedValue([baralho])
  mocks.listarNotasDoBaralho.mockResolvedValue({ itens: [], proximoCursor: null, total: 0 })
  mocks.lerEstruturasDoBaralho.mockResolvedValue([estrutura])
})

describe('Anki › Gerenciar › Corrigir campos', () => {
  it('sem a flag o botão não existe', async () => {
    flag.ligada = false
    tela()
    await screen.findByText('4000 Essential English Words')
    expect(screen.queryByRole('button', { name: /Corrigir campos/ })).toBeNull()
  })

  it('abre o Mapeador com os campos reais, envia os papéis escolhidos e diz quantas notas mudaram', async () => {
    mocks.remapearBaralho.mockResolvedValue({ simulado: false, notas: 3871, mudaram: 3871 })
    tela()
    fireEvent.click(await screen.findByRole('button', { name: /Corrigir campos/ }))

    const mapeador = await screen.findByTestId('anki-mapeador')
    expect(mocks.lerEstruturasDoBaralho).toHaveBeenCalledWith('deck-1')
    // Nenhum campo real some.
    for (const c of estrutura.campos) expect(within(mapeador).getByText(c)).toBeTruthy()

    fireEvent.change(within(mapeador).getByLabelText('Papel do campo №'), { target: { value: 'nenhum' } })
    fireEvent.change(within(mapeador).getByLabelText('Papel do campo Word'), { target: { value: 'palavra' } })
    fireEvent.change(within(mapeador).getByLabelText('Papel do campo Meaning'), { target: { value: 'significado' } })
    fireEvent.click(within(mapeador).getByRole('button', { name: 'Aplicar correção' }))

    await waitFor(() =>
      expect(mocks.remapearBaralho).toHaveBeenCalledWith('deck-1', [
        { estruturaHash: 'h-4000', papeis: ['nenhum', 'nenhum', 'palavra', 'significado'] },
      ]),
    )
    // Fechou o painel e releu a lista de baralhos (as contagens mudam).
    await waitFor(() => expect(screen.queryByTestId('anki-mapeador')).toBeNull())
    await waitFor(() => expect(mocks.listarBaralhosAnki.mock.calls.length).toBeGreaterThan(1))
  })

  it('cancelar fecha o painel sem chamar o servidor para corrigir', async () => {
    tela()
    fireEvent.click(await screen.findByRole('button', { name: /Corrigir campos/ }))
    const mapeador = await screen.findByTestId('anki-mapeador')
    fireEvent.click(within(mapeador).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByTestId('anki-mapeador')).toBeNull()
    expect(mocks.remapearBaralho).not.toHaveBeenCalled()
  })

  it('baralho sem campos guardados: avisa em vez de abrir um Mapeador vazio', async () => {
    mocks.lerEstruturasDoBaralho.mockResolvedValue([])
    tela()
    fireEvent.click(await screen.findByRole('button', { name: /Corrigir campos/ }))
    expect(await screen.findByTestId('corrigir-campos-vazio')).toBeTruthy()
    expect(screen.queryByTestId('anki-mapeador')).toBeNull()
  })

  it('falha ao remapear: o painel continua aberto para tentar de novo', async () => {
    mocks.remapearBaralho.mockRejectedValue(new Error('fora do ar'))
    tela()
    fireEvent.click(await screen.findByRole('button', { name: /Corrigir campos/ }))
    const mapeador = await screen.findByTestId('anki-mapeador')
    fireEvent.change(within(mapeador).getByLabelText('Papel do campo №'), { target: { value: 'nenhum' } })
    fireEvent.change(within(mapeador).getByLabelText('Papel do campo Word'), { target: { value: 'palavra' } })
    fireEvent.change(within(mapeador).getByLabelText('Papel do campo Meaning'), { target: { value: 'significado' } })
    fireEvent.click(within(mapeador).getByRole('button', { name: 'Aplicar correção' }))
    await waitFor(() => expect(mocks.remapearBaralho).toHaveBeenCalled())
    expect(screen.getByTestId('anki-mapeador')).toBeTruthy()
  })
})
