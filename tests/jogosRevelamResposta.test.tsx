// @vitest-environment jsdom
/**
 * QUEM NÃO CHEGOU LÁ SAI SABENDO A RESPOSTA (QA dos jogos, 2026-09-26).
 *
 * Jogando cada jogo até o fim, cinco deles passavam para o item seguinte SEM mostrar a palavra quando
 * o tempo acabava ou as tentativas esgotavam: Choseong, Bao, Karuta, Shiritori e Tabu (o Tabu nem no
 * erro de escolha — trocava de carta na hora). A pessoa terminava a rodada sem aprender justamente o
 * que não sabia. Só o Rali dizia "Fora! Era: …". Agora todos dizem, com a mesma linha
 * (`casca/AvisoDaJogada`, `role="status"`), e esperam o bastante para ela ser lida.
 *
 * E o Rali passa a usar a régua única de resposta escrita (`core/minigames/resposta`): acento
 * ausente vale (mostrando a grafia certa), acento trocado não, e a outra palavra com a mesma pista
 * vale.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameItem, RoundReport } from '../src/core/minigames/types'

vi.mock('../src/lib/juice', () => ({
  contarAte: vi.fn(async () => {}),
  comemorar: vi.fn(),
  tremor: vi.fn(),
  pontosDoElemento: vi.fn(),
  multiplicador: () => 1,
}))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn() }))
vi.mock('../src/lib/effects', () => ({ emitBurst: vi.fn() }))

const { default: ChoseongGame } = await import('../src/components/minigames/culturais/ChoseongGame')
const { default: BaoGame } = await import('../src/components/minigames/culturais/BaoGame')
const { default: KarutaGame } = await import('../src/components/minigames/culturais/KarutaGame')
const { default: ShiritoriGame } = await import('../src/components/minigames/culturais/ShiritoriGame')
const { default: TabooGame } = await import('../src/components/minigames/culturais/TabooGame')
const { default: TenseTennisGame } = await import('../src/components/minigames/culturais/TenseTennisGame')

const ITENS: MinigameItem[] = [
  { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' },
  { cardId: 'c2', prompt: 'cachorro', answer: 'dog', lang: 'en' },
  { cardId: 'c3', prompt: 'gato', answer: 'cat', lang: 'en' },
  { cardId: 'c4', prompt: 'água', answer: 'water', lang: 'en' },
]

const avancar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const aviso = () => document.querySelector('[data-aviso-da-jogada]')
/** Os relógios dos jogos andam um `setTimeout` por segundo: um `act` por segundo, como no navegador. */
const passarSegundos = (n: number) => {
  for (let i = 0; i < n; i++) avancar(1000)
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('o tempo acabou: a resposta aparece antes do próximo item', () => {
  it('Choseong', () => {
    render(<ChoseongGame items={ITENS} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    passarSegundos(16)
    expect(aviso()?.textContent).toContain('house')
    expect(document.body.textContent).toContain('Palavra 1 de 4') // ainda não trocou
  })

  it('Karuta', () => {
    render(<KarutaGame items={ITENS} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    passarSegundos(9)
    expect(aviso()?.textContent).toContain('house')
  })

  it('Shiritori', () => {
    const corrente: MinigameItem[] = [
      { cardId: 'c1', prompt: 'macaco', answer: 'ape', lang: 'en' },
      { cardId: 'c2', prompt: 'alce', answer: 'elk', lang: 'en' },
      { cardId: 'c3', prompt: 'fim', answer: 'end', lang: 'en' },
      { cardId: 'c4', prompt: 'cachorro', answer: 'dog', lang: 'en' },
    ]
    render(<ShiritoriGame items={corrente} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    passarSegundos(16)
    expect(aviso()?.textContent).toMatch(/end|dog|elk/)
  })

  it('Tabu', () => {
    const defs: MinigameItem[] = [
      { cardId: 'c1', prompt: 'A hospital is a building where doctors treat patients.', answer: 'hospital', lang: 'en' },
      { cardId: 'c2', prompt: 'A library is a building where people borrow literature.', answer: 'library', lang: 'en' },
      { cardId: 'c3', prompt: 'A bicycle is a vehicle with two narrow wheels.', answer: 'bicycle', lang: 'en' },
      { cardId: 'c4', prompt: 'To harvest is to gather a crop that is ready.', answer: 'harvest', lang: 'en' },
    ]
    render(<TabooGame items={defs} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    passarSegundos(31)
    expect(aviso()?.textContent).toContain('hospital')
  })
})

describe('errou de vez: a resposta aparece', () => {
  it('Bao: esgotar os toques revela a palavra montada inteira', () => {
    render(<BaoGame items={ITENS} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    const covas = [...document.querySelectorAll<HTMLButtonElement>('[data-tour="tabuleiro"] .grid button')]
    const errada = covas.find((b) => !'house'.startsWith(b.textContent ?? ''))!
    for (let i = 0; i < 3; i++) fireEvent.click(errada)
    expect(aviso()?.textContent).toContain('house')
  })

  it('Tabu: escolher errado mostra a certa e só depois troca de carta', () => {
    const defs: MinigameItem[] = [
      { cardId: 'c1', prompt: 'A hospital is a building where doctors treat patients.', answer: 'hospital', lang: 'en' },
      { cardId: 'c2', prompt: 'A library is a building where people borrow literature.', answer: 'library', lang: 'en' },
      { cardId: 'c3', prompt: 'A bicycle is a vehicle with two narrow wheels.', answer: 'bicycle', lang: 'en' },
      { cardId: 'c4', prompt: 'To harvest is to gather a crop that is ready.', answer: 'harvest', lang: 'en' },
    ]
    render(<TabooGame items={defs} ageProfile="pro" onFinish={() => {}} onExit={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'library' }))
    expect(aviso()?.textContent).toContain('hospital')
    expect(document.body.textContent).toContain('1 de 4')
    avancar(2000)
    expect(document.body.textContent).toContain('2 de 4')
  })
})

describe('Rali: a régua única de resposta escrita', () => {
  const rali = (items: MinigameItem[], onFinish: (r: RoundReport) => void = () => {}) =>
    render(<TenseTennisGame items={items} ageProfile="pro" onFinish={onFinish} onExit={() => {}} />)
  const devolver = (texto: string) => {
    fireEvent.change(screen.getByLabelText('Sua devolução'), { target: { value: texto } })
    fireEvent.click(screen.getByRole('button', { name: 'Devolver' }))
  }

  it('acento ausente vale e a grafia certa aparece', () => {
    rali([{ cardId: 'p1', prompt: 'heart', answer: 'coração', lang: 'pt' }, ...ITENS])
    devolver('coracao')
    expect(aviso()?.getAttribute('data-aviso-da-jogada')).toBe('certo')
    expect(aviso()?.textContent).toContain('coração')
  })

  it('acento trocado é erro: avó não é avô', () => {
    let relatorio: RoundReport | null = null
    rali([{ cardId: 'p1', prompt: 'grandfather', answer: 'avô', lang: 'pt' }, ...ITENS], (r) => (relatorio = r))
    devolver('avó')
    expect(aviso()?.getAttribute('data-aviso-da-jogada')).toBe('erro')
    expect(aviso()?.textContent).toContain('avô')
    for (const it of ITENS) {
      avancar(1300)
      devolver(it.answer)
    }
    avancar(3000)
    expect(relatorio!.items[0].correct).toBe(false)
  })

  it('outra palavra do acervo com a mesma pista vale', () => {
    let relatorio: RoundReport | null = null
    rali([{ cardId: 'q1', prompt: 'quarto', answer: 'room', lang: 'en', alternativas: ['bedroom'] }, ...ITENS], (r) => (relatorio = r))
    devolver('bedroom')
    expect(aviso()?.textContent).toContain('room')
    for (const it of ITENS) {
      avancar(1300)
      devolver(it.answer)
    }
    avancar(3000)
    expect(relatorio!.items[0].correct).toBe(true)
  })
})
