// @vitest-environment jsdom
/**
 * A TELA DO TESTE RÁPIDO DE VOCABULÁRIO (openspec `teste-de-vocabulario`): uma palavra por vez com "Sei"/"Não sei"
 * (botões e teclas), resultado com o número de palavras, marcação em LOTE (uma requisição e uma publicação do índice)
 * e desfazer em lote. Sem tempo e sem pontos.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  geracaoDeEscritas: vi.fn(() => 0),
  fetchDeck: vi.fn(async () => []),
  fetchSessions: vi.fn(async () => []),
  fetchPalavrasVistas: vi.fn(async () => null),
  fetchPalavrasMarcadas: vi.fn(async () => []),
  marcarPalavra: vi.fn(),
  desmarcarPalavra: vi.fn(),
  marcarLotePalavras: vi.fn(),
  desfazerLotePalavras: vi.fn(),
}))
vi.mock('../src/data/api', () => api)

import TesteDeVocabulario from '../src/components/views/vocab/TesteDeVocabulario'
import { PSEUDOPALAVRAS } from '../src/core/vocabulario/pseudopalavras'
import { esquecerIndiceDeEtiquetas, lerSnapshotDasEtiquetas } from '../src/lib/etiquetas/indiceDeEtiquetas'
import { _reiniciarIdentidade } from '../src/lib/identidade'
import { prepararDialogoNoJsdom } from './_dialogoNoJsdom'

prepararDialogoNoJsdom()

const palavraNaTela = () => document.querySelector('.teste-vocab-palavra')?.textContent ?? ''
const ehPseudo = (p: string) => PSEUDOPALAVRAS.en!.includes(p)

/** Responde pelo teclado até a tela de resultado: `sei(palavra)` decide S ou N. */
function responderTudo(sei: (palavra: string) => boolean) {
  for (let i = 0; i < 200 && document.querySelector('.teste-vocab-palavra'); i++) {
    fireEvent.keyDown(window, { key: sei(palavraNaTela()) ? 's' : 'n' })
  }
}

beforeEach(() => {
  esquecerIndiceDeEtiquetas()
  _reiniciarIdentidade()
  vi.clearAllMocks()
  api.fetchPalavrasMarcadas.mockResolvedValue([])
  api.marcarLotePalavras.mockImplementation(async (_l: string, chaves: string[]) => ({
    criadas: chaves,
    jaConhecidas: 0,
    ignoradas: 0,
    comCartao: 0,
  }))
  api.desfazerLotePalavras.mockImplementation(async (_l: string, chaves: string[]) => chaves)
})
afterEach(cleanup)

const abrir = () => {
  render(<TesteDeVocabulario lang="en" semente="tela" aoFechar={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Começar' }))
}

describe('TesteDeVocabulario (tela)', () => {
  it('avisa que há palavras inventadas e não tem tempo nem pontos', () => {
    render(<TesteDeVocabulario lang="en" semente="tela" aoFechar={() => {}} />)
    expect(screen.getByText(/algumas palavras foram inventadas/)).toBeTruthy()
    expect(screen.getByText(/Sem tempo e sem pontos/)).toBeTruthy()
    expect(document.querySelector('[role="timer"]')).toBeNull()
  })

  it('mostra uma palavra por vez e responde por teclado (S/N e setas) e por botão', () => {
    abrir()
    const primeira = palavraNaTela()
    expect(primeira).not.toBe('')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    const segunda = palavraNaTela()
    expect(segunda).not.toBe(primeira)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(palavraNaTela()).not.toBe(segunda)
    fireEvent.click(screen.getByRole('button', { name: 'Sei' }))
    expect(screen.getByRole('progressbar')).toBeTruthy()
  })

  it('quem conhece tudo e não chuta: marca em UM pedido e publica o índice uma vez; desfaz em lote', async () => {
    abrir()
    responderTudo((p) => !ehPseudo(p))
    expect(screen.getByTestId('teste-resultado').getAttribute('data-motivo')).toBe('ok')
    expect(screen.getByText(/Seu nível estimado em/)).toBeTruthy()

    const antes = lerSnapshotDasEtiquetas().listaDeMarcadas
    fireEvent.click(screen.getByRole('button', { name: 'Marcar palavras' }))
    await waitFor(() => expect(screen.getByText(/Pronto: marcamos/)).toBeTruthy())
    expect(api.marcarLotePalavras).toHaveBeenCalledTimes(1)
    expect(api.marcarPalavra).not.toHaveBeenCalled()
    const chaves = api.marcarLotePalavras.mock.calls[0]![1] as string[]
    expect(chaves.length).toBeGreaterThan(2000)
    expect(chaves.length).toBeLessThanOrEqual(3000)
    const depois = lerSnapshotDasEtiquetas()
    expect(antes).toHaveLength(0)
    expect(depois.listaDeMarcadas).toHaveLength(chaves.length)
    expect(depois.marcadas?.get('en')?.get('about')).toBe('conhecida')

    fireEvent.click(screen.getByRole('button', { name: 'Desfazer todas' }))
    await waitFor(() => expect(screen.getByText(/Desfeito/)).toBeTruthy())
    expect(api.desfazerLotePalavras).toHaveBeenCalledTimes(1)
    expect(lerSnapshotDasEtiquetas().listaDeMarcadas).toHaveLength(0)
  })

  it('ignora tecla repetida e foco em campo de texto', () => {
    abrir()
    const primeira = palavraNaTela()
    fireEvent.keyDown(window, { key: 's', repeat: true })
    expect(palavraNaTela()).toBe(primeira)
    const campo = document.createElement('input')
    document.body.appendChild(campo)
    fireEvent.keyDown(campo, { key: 's' })
    expect(palavraNaTela()).toBe(primeira)
    campo.remove()
    fireEvent.keyDown(window, { key: 's' })
    expect(palavraNaTela()).not.toBe(primeira)
  })

  it('desfazer envia só as chaves criadas, não a marcação anterior da pessoa', async () => {
    api.fetchPalavrasMarcadas.mockResolvedValue([
      { lang: 'en', chave: 'above', estado: 'conhecida', atualizadoEm: 2 },
    ] as never)
    abrir()
    responderTudo((p) => !ehPseudo(p))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Marcar palavras' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Marcar palavras' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desfazer todas' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer todas' }))
    await waitFor(() => expect(api.desfazerLotePalavras).toHaveBeenCalledTimes(1))
    const enviadas = api.desfazerLotePalavras.mock.calls[0]![1] as string[]
    expect(enviadas).not.toContain('above')
    expect(enviadas.length).toBeGreaterThan(2000)
    expect(lerSnapshotDasEtiquetas().marcadas?.get('en')?.get('above')).toBe('conhecida')
  })

  it('chute alto: resultado gentil, sem botão de marcar e nada enviado', () => {
    abrir()
    responderTudo(() => true)
    const r = screen.getByTestId('teste-resultado')
    expect(r.getAttribute('data-motivo')).toBe('chute')
    expect(screen.getByText(/não vamos marcar nada agora/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Marcar palavras' })).toBeNull()
    expect(api.marcarLotePalavras).not.toHaveBeenCalled()
  })

  it('o contador honesto não inclui o que já conta nem o que está ignorado', async () => {
    api.fetchPalavrasMarcadas.mockResolvedValue([
      { lang: 'en', chave: 'about', estado: 'ignorada', atualizadoEm: 1 },
      { lang: 'en', chave: 'above', estado: 'conhecida', atualizadoEm: 2 },
    ] as never)
    abrir()
    responderTudo((p) => !ehPseudo(p))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Marcar palavras' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Marcar palavras' }))
    await waitFor(() => expect(api.marcarLotePalavras).toHaveBeenCalled())
    const chaves = api.marcarLotePalavras.mock.calls[0]![1] as string[]
    expect(chaves).not.toContain('about')
    expect(chaves).not.toContain('above')
  })

  it('falha ao gravar: avisa com gentileza e não troca de tela', async () => {
    api.marcarLotePalavras.mockResolvedValue(null)
    abrir()
    responderTudo((p) => !ehPseudo(p))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Marcar palavras' }))
    })
    expect(await screen.findByText(/Não deu para salvar agora/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Marcar palavras' })).toBeTruthy()
  })
})
