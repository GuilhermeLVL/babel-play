// @vitest-environment jsdom
/**
 * TRAZER DO ANKI: O RELATÓRIO VEM ANTES (cartões 7.2) E COLAR UMA LISTA (7.3).
 *
 *  · abrir o fluxo LÊ o arquivo no navegador e mostra o que achou; nenhuma requisição ao servidor sai antes de
 *    "Trazer" (o envio é `enviarBaralhoLido`);
 *  · "Colar uma lista" entrega o texto como um `.txt` em memória ao mesmo fluxo, e o mesmo leitor o entende.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { lerTextoAnki } from '../src/core/anki'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const espia = vi.hoisted(() => ({
  ler: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
  enviar: null as unknown as ReturnType<(typeof import('vitest'))['vi']['fn']>,
}))

vi.mock('../src/data/importarAnki', () => {
  espia.ler = vi.fn(async (arquivo: File) => ({ arquivo, leitura: lerTextoAnki(await arquivo.text()) }))
  espia.enviar = vi.fn(async () => ({
    importId: 'imp',
    deckId: 'deck',
    resumo: { notas: 2, novas: 2, atualizadas: 0, iguais: 0, descartadas: 0, porMotivo: {}, ativadas: 0 },
    campos: [],
    notetype: null,
    formato: 'texto',
    truncado: false,
    totalNoArquivo: 2,
    amostra: [],
  }))
  return { lerBaralhoParaImportar: espia.ler, enviarBaralhoLido: espia.enviar }
})
vi.mock('../src/data/apiAnki', () => ({ ativarNotasDoBaralho: vi.fn(), purgarBaralho: vi.fn() }))

import { ColarUmaLista, FluxoDoAnki } from '../src/components/views/cartoes/TrazerELevar'

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => cleanup())

describe('o relatório vem antes de trazer', () => {
  it('lê e mostra o que achou; o servidor só é chamado depois de "Trazer"', async () => {
    const arquivo = new File(['house,casa\nwater,água'], 'lista.txt')
    render(<FluxoDoAnki arquivo={arquivo} idioma="en" idiomaNativo="pt" aoFechar={() => {}} />)
    const previa = await screen.findByTestId('anki-previa')
    expect(previa.textContent).toContain('Li 2 notas neste aparelho. Nada foi ao servidor')
    expect(within(previa).getByText('house')).toBeTruthy()
    expect(espia.ler).toHaveBeenCalledTimes(1)
    expect(espia.enviar).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Trazer 2 notas' }))
    })
    await waitFor(() => expect(espia.enviar).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('anki-lido')).toBeTruthy()
  })

  it('arquivo sem nenhuma nota: avisa e não oferece trazer', async () => {
    render(<FluxoDoAnki arquivo={new File(['\n\n'], 'vazio.txt')} idioma="en" idiomaNativo="pt" aoFechar={() => {}} />)
    const previa = await screen.findByTestId('anki-previa')
    expect(previa.textContent).toContain('Não achei nenhuma nota neste arquivo. Nada foi enviado.')
    expect(screen.queryByRole('button', { name: /^Trazer \d+ nota/ })).toBeNull()
    expect(espia.enviar).not.toHaveBeenCalled()
  })
})

describe('colar uma lista', () => {
  it('"Continuar" só vale com texto e entrega um .txt com o que foi colado', async () => {
    const continuar = vi.fn()
    render(<ColarUmaLista aoContinuar={continuar} aoFechar={() => {}} />)
    const botao = screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement
    expect(botao.disabled).toBe(true)
    fireEvent.change(screen.getByTestId('lista-colada'), { target: { value: 'house, casa\n\nwater\tágua\n' } })
    expect(screen.getByText('2 linhas para conferir.')).toBeTruthy()
    fireEvent.click(botao)
    await waitFor(() => expect(continuar).toHaveBeenCalledTimes(1))
    const arquivo = continuar.mock.calls[0][0] as File
    expect(arquivo.name).toBe('lista-colada.txt')
    expect(await arquivo.text()).toBe('house, casa\n\nwater\tágua\n')
    // Nada foi ao servidor só por colar.
    expect(espia.enviar).not.toHaveBeenCalled()
  })
})
