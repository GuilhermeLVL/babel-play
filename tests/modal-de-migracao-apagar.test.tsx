// @vitest-environment jsdom
/**
 * O AVISO DE ENTRADA com dados do visitante: a pessoa escolhe "guardar na conta" ou "apagar" (com confirmação), nunca
 * fica só com "agora não". Risco residual da auditoria `docs/auditoria/2026-11-25-dados-locais-por-conta.md`.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  inventarioLocal: vi.fn(),
  migrarParaConta: vi.fn(),
  limparTudo: vi.fn(async () => {}),
  apagarDadosDoVisitante: vi.fn(async () => {}),
  trazerDadosDoVisitante: vi.fn(),
}))
vi.mock('../src/data/migracao', () => ({ inventarioLocal: m.inventarioLocal, migrarParaConta: m.migrarParaConta }))
vi.mock('../src/data/efemero/store', () => ({ limparTudo: m.limparTudo }))
vi.mock('../src/lib/armazensDoAparelhoDaConta', () => ({
  apagarDadosDoVisitante: m.apagarDadosDoVisitante,
  trazerDadosDoVisitante: m.trazerDadosDoVisitante,
}))

import ModalDeMigracao from '../src/components/conta/ModalDeMigracao'

const botao = (nome: string) => screen.getByRole('button', { name: nome })

beforeEach(() => {
  vi.clearAllMocks()
  /* Só os armazéns do aparelho (livros etc.): nenhuma sessão nem cartão no modo sem conta. */
  m.inventarioLocal.mockResolvedValue({ sessoes: 0, cartoes: 0, comAudio: 0, rodadas: 0 })
})
afterEach(cleanup)

describe('o aviso de entrada com o que o visitante deixou', () => {
  it('explica, oferece guardar, apagar e agora não, e não diz "0 sessões"', async () => {
    render(<ModalDeMigracao aberto onFechar={() => {}} onMigrou={() => {}} />)
    await waitFor(() => expect(botao('Guardar na conta')).toBeTruthy())
    expect(screen.getByRole('dialog').textContent).toMatch(/coisas de quando você usava sem conta/)
    expect(screen.getByRole('dialog').textContent).not.toMatch(/Encontrei/)
    expect(botao('Apagar deste navegador')).toBeTruthy()
    expect(botao('Agora não')).toBeTruthy()
  })

  it('apagar pede confirmação; voltar não apaga; confirmar apaga o modo sem conta e os armazéns do aparelho', async () => {
    render(<ModalDeMigracao aberto onFechar={() => {}} onMigrou={() => {}} />)
    await waitFor(() => expect(botao('Apagar deste navegador')).toBeTruthy())
    fireEvent.click(botao('Apagar deste navegador'))
    expect(screen.getByRole('alert').textContent).toMatch(/Não dá para desfazer/)
    fireEvent.click(botao('Voltar'))
    expect(m.limparTudo).not.toHaveBeenCalled()
    fireEvent.click(botao('Apagar deste navegador'))
    await act(async () => {
      fireEvent.click(botao('Sim, apagar'))
    })
    expect(m.limparTudo).toHaveBeenCalledWith({ soDoModoSemConta: true })
    expect(m.apagarDadosDoVisitante).toHaveBeenCalledTimes(1)
    expect(m.migrarParaConta).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toMatch(/foi apagado/)
  })

  it('guardar na conta traz os dados dos armazéns do aparelho para a conta e sobe o resto', async () => {
    m.migrarParaConta.mockResolvedValue({
      sessoes: 0,
      jaExistiam: 0,
      audios: 0,
      cartoes: 0,
      audiosPendentes: 0,
      falhas: [],
    })
    render(<ModalDeMigracao aberto onFechar={() => {}} onMigrou={() => {}} />)
    await waitFor(() => expect(botao('Guardar na conta')).toBeTruthy())
    await act(async () => {
      fireEvent.click(botao('Guardar na conta'))
    })
    expect(m.trazerDadosDoVisitante).toHaveBeenCalledTimes(1)
    expect(m.migrarParaConta).toHaveBeenCalledTimes(1)
    expect(m.limparTudo).not.toHaveBeenCalled()
  })
})
