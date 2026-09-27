// @vitest-environment jsdom
/**
 * AS TECLAS 1–9 ESCOLHEM A ALTERNATIVA (QA dos jogos, 2026-09-26).
 *
 * Nos jogos de múltipla escolha (Duelo, Qual foi?, Karuta, Vitendawili, Tabu, Shiritori) quem joga
 * pelo teclado tinha de TABULAR até a alternativa — no Duelo, contra o relógio. A casca já tinha
 * atalho para pausar (Esc/P); faltava o da jogada. A regra é uma só (`casca/atalhos`): o número é a
 * posição da alternativa na tela, e digitar num campo de texto nunca dispara atalho.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameItem, RoundReport } from '../src/core/minigames/types'

vi.mock('../src/lib/juice', () => ({
  contarAte: vi.fn(async () => {}),
  comemorar: vi.fn(),
  pontosDoElemento: vi.fn(),
  pontosFlutuantes: vi.fn(),
  tremor: vi.fn(),
  tremorDeTela: vi.fn(),
  pulsoDeZoom: vi.fn(),
  flashDeTela: vi.fn(),
  vibrar: vi.fn(),
  executarEfeito: vi.fn(),
  multiplicador: () => 1,
}))
vi.mock('../src/lib/eventosDeJogo', () => ({ sortearEventoRaro: () => null, eventosCondicionais: () => [] }))
vi.mock('../src/lib/ranking', () => ({
  enviarParaRanking: vi.fn(),
  lerApelido: () => '',
  salvarApelido: vi.fn(),
  apelidoValido: () => false,
}))
vi.mock('../src/lib/effects', () => ({ emitBurst: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))
vi.mock('../src/lib/tts', () => ({ speak: vi.fn(), falar: vi.fn(() => true) }))

const { default: BlitzGame } = await import('../src/components/minigames/BlitzGame')
const { default: VitendawiliGame } = await import('../src/components/minigames/culturais/VitendawiliGame')

const ITENS: MinigameItem[] = [
  { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en', sentence: 'I left my house early.' },
  { cardId: 'c2', prompt: 'jardim', answer: 'garden', lang: 'en', sentence: 'The garden is full of flowers.' },
  { cardId: 'c3', prompt: 'janela', answer: 'window', lang: 'en', sentence: 'She opened the window slowly.' },
  { cardId: 'c4', prompt: 'mesa', answer: 'table', lang: 'en', sentence: 'Put the plates on the table.' },
]

const avancar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: false }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('atalhos 1–9 nas alternativas', () => {
  it('Duelo: a tecla 1 responde a primeira alternativa', () => {
    let relatorio: RoundReport | null = null
    render(<BlitzGame items={ITENS} ageProfile="pro" onFinish={(r) => (relatorio = r)} onExit={() => {}} />)
    const primeira = document.querySelectorAll<HTMLButtonElement>('[data-tour="alternativas"] button')[0]
    expect(primeira.getAttribute('aria-keyshortcuts')).toBe('1')
    fireEvent.keyDown(window, { key: '1' })
    // respondida: as alternativas travam até o próximo item (reconsultadas: no erro o palco remonta)
    const depois = document.querySelectorAll<HTMLButtonElement>('[data-tour="alternativas"] button')[0]
    expect(depois.disabled).toBe(true)
    expect(screen.getByText(/Item 1 de 4/)).toBeTruthy()
    for (let i = 0; i < 3; i++) {
      avancar(700)
      fireEvent.keyDown(window, { key: '2' })
    }
    avancar(700)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(relatorio!.items).toHaveLength(4)
  })

  it('Vitendawili: número fora da lista não faz nada; dentro, escolhe', () => {
    render(<VitendawiliGame items={ITENS} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    const botoes = () => [...document.querySelectorAll<HTMLButtonElement>('[data-tour="alternativas"] button')]
    fireEvent.keyDown(window, { key: '9' })
    expect(botoes().every((b) => !b.disabled)).toBe(true)
    const errada = botoes().findIndex((b) => b.textContent !== 'house')
    fireEvent.keyDown(window, { key: String(errada + 1) })
    expect(botoes()[errada].disabled).toBe(true)
  })

  it('digitando num campo, o número é texto e não jogada', () => {
    render(<BlitzGame items={ITENS} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    const campo = document.createElement('input')
    document.body.appendChild(campo)
    campo.focus()
    fireEvent.keyDown(campo, { key: '1' })
    const alts = [...document.querySelectorAll<HTMLButtonElement>('[data-tour="alternativas"] button')]
    expect(alts.every((b) => !b.disabled)).toBe(true)
    campo.remove()
  })
})
