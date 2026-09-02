// @vitest-environment jsdom
/**
 * BaralhoAnki — o fluxo de importação mudou de "ler depois gravar" para "a rota já grava".
 *
 * `POST /api/import/anki` hoje devolve o RESULTADO da importação (baralho + notas já gravados no
 * acervo), não uma prévia para confirmar. Estes testes prendem o que a tela precisa dizer com
 * isso: o saldo do acervo (novas/atualizadas/iguais/descartadas), que NADA foi para a fila de
 * estudo ainda, que ativar é um passo separado e explícito, que o botão de ativar não aparece
 * quando não há nada ativável, que erro na importação aparece como erro (não como "0 notas"), e
 * que `truncado` é dito quando o arquivo tem mais notas do que o teto de leitura.
 */
import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

afterEach(() => cleanup())

vi.mock('../src/data/api', () => ({
  apiFetch: vi.fn(),
  exportarApkg: vi.fn(),
}))

vi.mock('../src/data/apiAnki', () => ({
  ativarNotasDoBaralho: vi.fn(),
}))

import BaralhoAnki from '../src/components/views/BaralhoAnki'
import * as api from '../src/data/api'
import * as apiAnki from '../src/data/apiAnki'

const mocks = api as unknown as {
  apiFetch: ReturnType<typeof vi.fn>
  exportarApkg: ReturnType<typeof vi.fn>
}
const mocksAnki = apiAnki as unknown as {
  ativarNotasDoBaralho: ReturnType<typeof vi.fn>
}

function respostaImport(overrides: Record<string, unknown> = {}) {
  return {
    importId: 'imp-1',
    deckId: 'deck-1',
    resumo: {
      notas: 300,
      novas: 260,
      atualizadas: 10,
      iguais: 5,
      descartadas: 25,
      porMotivo: { 'palavra-curta': 20, 'sem-traducao': 5 },
    },
    campos: ['Front', 'Back'],
    notetype: 'Basic',
    baralhos: ['4000 Essential English Words'],
    formato: 'apkg',
    truncado: false,
    totalNoArquivo: 300,
    amostra: [{ frente: 'apple', verso: 'maçã', exemplo: null }],
    ...overrides,
  }
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body }
}

function props(over: Record<string, unknown> = {}) {
  return {
    deck: [],
    idioma: 'en',
    idiomaNativo: 'pt',
    ageProfile: 'pro' as const,
    onVoltar: vi.fn(),
    onImportou: vi.fn(),
    ...over,
  }
}

function escolherArquivo(nome = 'baralho.apkg') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const arquivo = new File(['conteudo'], nome, { type: 'application/octet-stream' })
  Object.defineProperty(input, 'files', { value: [arquivo] })
  fireEvent.change(input)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BaralhoAnki — importar', () => {
  it('mostra o saldo do acervo (novas/atualizadas/iguais/descartadas) depois de importar', async () => {
    mocks.apiFetch.mockResolvedValue(jsonResponse(respostaImport()))
    render(<BaralhoAnki {...props()} />)

    escolherArquivo()

    await waitFor(() => expect(screen.getByText('260')).toBeTruthy())
    expect(screen.getByText(/atualizadas/)).toBeTruthy()
    expect(screen.getByText(/iguais ao que já tinha/)).toBeTruthy()
    expect(screen.getByText(/25 não entraram/)).toBeTruthy()
  })

  it('deixa explícito que nada foi para a fila de estudo ainda', async () => {
    mocks.apiFetch.mockResolvedValue(jsonResponse(respostaImport()))
    render(<BaralhoAnki {...props()} />)

    escolherArquivo()

    await waitFor(() => expect(screen.getByText(/nenhuma foi para a sua fila de estudo ainda/)).toBeTruthy())
  })

  it('o botão de ativar chama a API e mostra o resultado, avisando das restantes', async () => {
    mocks.apiFetch.mockResolvedValue(jsonResponse(respostaImport()))
    mocksAnki.ativarNotasDoBaralho.mockResolvedValue({ ativadas: 275, restantes: 25 })
    render(<BaralhoAnki {...props()} />)

    escolherArquivo()
    await waitFor(() => expect(screen.getByText(/Começar com as primeiras/)).toBeTruthy())

    fireEvent.click(screen.getByText(/Começar com as primeiras/))

    await waitFor(() => expect(mocksAnki.ativarNotasDoBaralho).toHaveBeenCalledWith('deck-1', 275))
    await waitFor(() => expect(screen.getByText(/275 entraram na sua fila/)).toBeTruthy())
    expect(screen.getByText(/Ainda há 25 guardadas no baralho/)).toBeTruthy()
  })

  it('quando não há nada ativável (tudo descartado) o botão não aparece', async () => {
    mocks.apiFetch.mockResolvedValue(jsonResponse(respostaImport({
      resumo: { notas: 10, novas: 0, atualizadas: 0, iguais: 0, descartadas: 10, porMotivo: { 'palavra-curta': 10 } },
    })))
    render(<BaralhoAnki {...props()} />)

    escolherArquivo()

    await waitFor(() => expect(screen.getByText(/10 não entraram/)).toBeTruthy())
    expect(screen.queryByText(/Começar com as primeiras/)).toBeNull()
    expect(screen.getByText(/Nenhuma nota deste baralho passou pela régua/)).toBeTruthy()
  })

  it('erro na importação aparece como erro, não como "0 notas"', async () => {
    mocks.apiFetch.mockResolvedValue(jsonResponse({ error: 'zip corrompido' }, false))
    render(<BaralhoAnki {...props()} />)

    escolherArquivo()

    await waitFor(() => expect(screen.getByText('zip corrompido')).toBeTruthy())
    expect(screen.queryByText(/0 notas/)).toBeNull()
    expect(screen.queryByText(/notas lidas/)).toBeNull()
  })

  it('diz quando o arquivo foi truncado (mais notas do que o teto de leitura)', async () => {
    mocks.apiFetch.mockResolvedValue(jsonResponse(respostaImport({
      truncado: true,
      totalNoArquivo: 60000,
      resumo: { notas: 50000, novas: 50000, atualizadas: 0, iguais: 0, descartadas: 0, porMotivo: {} },
    })))
    render(<BaralhoAnki {...props()} />)

    escolherArquivo()

    await waitFor(() => expect(screen.getByText(/60000/)).toBeTruthy())
    expect(screen.getByText(/mais do que dá para ler de uma vez/)).toBeTruthy()
  })
})
