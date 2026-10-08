// @vitest-environment jsdom
/**
 * O SHIRITORI DO PROTÓTIPO (`src/components/minigames/culturais/ShiritoriDoPrototipo.tsx`), porte de
 * `jogos2.js:430-480`: a corrente, a palavra na ponta com a última letra em destaque, a letra exigida e
 * três alternativas; a errada é riscada, a certa emenda o elo em 650 ms, o tempo esgotado revela.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameItem, RoundReport } from '../src/core'

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
  glitchDeTela: vi.fn(),
  multiplicador: () => 1,
}))
vi.mock('../src/lib/effects', () => ({ emitBurst: vi.fn() }))
vi.mock('../src/lib/soundFx', () => ({ play: vi.fn(), somMudo: () => true }))
vi.mock('../src/lib/tts', () => ({ speak: vi.fn(), falar: vi.fn(() => true) }))

const { default: ShiritoriDoPrototipo } = await import('../src/components/minigames/culturais/ShiritoriDoPrototipo')

/* Uma corrente só: cat → tree → egg → goat → tiger. */
const itens: MinigameItem[] = [
  { cardId: 'c1', prompt: 'gato', answer: 'cat', lang: 'en' },
  { cardId: 'c2', prompt: 'árvore', answer: 'tree', lang: 'en' },
  { cardId: 'c3', prompt: 'ovo', answer: 'egg', lang: 'en' },
  { cardId: 'c4', prompt: 'cabra', answer: 'goat', lang: 'en' },
  { cardId: 'c5', prompt: 'tigre', answer: 'tiger', lang: 'en' },
]
const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const um = (s: string) => document.querySelector(s)
const todos = (s: string) => [...document.querySelectorAll<HTMLButtonElement>(s)]
const opcao = (w: string) => um(`.opcoes-blitz [data-op="${w}"]`) as HTMLButtonElement
const escolher = (w: string) => fireEvent.click(opcao(w))
const elos = () => todos('.pj-elos > span').map((s) => s.textContent)

let relatorio: RoundReport | null
const montar = () =>
  render(<ShiritoriDoPrototipo items={itens} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: false })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('a cena do Shiritori', () => {
  it('tem a corrente, a palavra na ponta com a última letra em destaque, a tradução e três alternativas', () => {
    montar()
    expect(um('.pj-miolo > .pj-corrente > .label-mono')?.textContent).toBe('A corrente até aqui (1 de 5)')
    expect(elos()).toEqual(['cat'])
    expect(um('.pj-miolo > .pj-centro > .label-mono')?.textContent).toBe('Palavra na ponta')
    expect(um('.pj-centro > p.pj-ponta')?.textContent).toBe('cat')
    expect(um('.pj-ponta > u')?.textContent).toBe('t')
    expect(um('.pj-centro > span.mut')?.textContent).toBe('gato')
    expect(todos('.pj-miolo > .opcoes-blitz.tres > button')).toHaveLength(3)
    expect(opcao('tree')).not.toBeNull()
    expect(um('.hud .mut')?.textContent).toBe('0 de 4 elos')
    for (const ajuda of ['letra', 'tempo', 'resposta']) expect(um(`[data-ajuda="${ajuda}"]`), ajuda).not.toBeNull()
  })

  it('a letra exigida fica escondida até "Ver a letra"', () => {
    montar()
    const letra = um('.pj-centro > p.pj-letra') as HTMLElement
    expect(letra.hidden).toBe(true)
    expect(letra.textContent).toContain('A próxima começa com')
    expect(letra.querySelector('b')?.textContent).toBe('T')
    fireEvent.click(um('[data-ajuda="letra"]') as HTMLElement)
    expect(letra.hidden).toBe(false)
  })
})

describe('emendar o elo', () => {
  it('a errada é riscada e desabilitada, e dá para tentar de novo', () => {
    montar()
    const errada = todos('.opcoes-blitz button').find((b) => b.dataset.op !== 'tree') as HTMLButtonElement
    fireEvent.click(errada)
    expect(errada.className).toBe('pj-fora')
    expect(errada.disabled).toBe(true)
    expect(elos()).toEqual(['cat'])
  })

  it('a certa acende e, 650 ms depois, entra na corrente e vira a ponta', () => {
    montar()
    escolher('tree')
    expect(opcao('tree').className).toBe('certa')
    esperar(650)
    expect(elos()).toEqual(['cat', 'tree'])
    expect(todos('.pj-elos > svg')).toHaveLength(1)
    expect(um('.pj-corrente > .label-mono')?.textContent).toBe('A corrente até aqui (2 de 5)')
    expect(um('.pj-ponta')?.textContent).toBe('tree')
    expect(um('.pj-letra b')?.textContent).toBe('E')
    expect((um('.pj-letra') as HTMLElement).hidden).toBe(true)
    expect(um('.hud .mut')?.textContent).toBe('1 de 4 elos')
  })

  it('o tempo acaba em 15 s: o elo certo acende, e 1,1 s depois vem o próximo', () => {
    montar()
    esperar(15100)
    expect(opcao('tree').className).toBe('certa')
    expect(um('.ganho.erro')?.textContent).toBe('o tempo acabou')
    esperar(1100)
    expect(um('.pj-ponta')?.textContent).toBe('tree')
  })

  it('a rodada inteira: o relatório sai 900 ms depois do último elo', () => {
    montar()
    fireEvent.click(todos('.opcoes-blitz button').find((b) => b.dataset.op !== 'tree') as HTMLButtonElement)
    escolher('tree')
    esperar(650)
    esperar(15100) // deixa o segundo cair
    esperar(1100)
    escolher('goat')
    esperar(650)
    escolher('tiger')
    esperar(650)
    expect(relatorio).toBeNull()
    esperar(900)
    const r = relatorio as RoundReport | null
    expect(r?.gameId).toBe('shiritori')
    expect(r?.items.map((o) => [o.itemRef, o.correct, o.attempts, !!o.revealed])).toEqual([
      ['tree', true, 2, false],
      ['egg', false, 1, true],
      ['goat', true, 1, false],
      ['tiger', true, 1, false],
    ])
  })
})

describe('os níveis do Shiritori', () => {
  it('no Fácil a letra exigida já aparece, e são 23 segundos por elo', () => {
    localStorage.setItem('babel.nivel.shiritori', 'facil')
    montar()
    expect((um('.pj-letra') as HTMLElement).hidden).toBe(false)
    esperar(15100)
    expect(opcao('tree').className).toBe('')
    esperar(8000)
    expect(opcao('tree').className).toBe('certa')
  })

  it('no Difícil são 11 segundos por elo', () => {
    localStorage.setItem('babel.nivel.shiritori', 'dificil')
    montar()
    esperar(11100)
    expect(opcao('tree').className).toBe('certa')
  })
})
