// @vitest-environment jsdom
/**
 * O KARUTA DO PROTÓTIPO (`src/components/minigames/culturais/KarutaDoPrototipo.tsx`), porte de
 * `jogos2.js:13-60`: a pista em pílula com o equalizador, a mesa com as cartas da rodada, e as regras: a
 * errada pisca 420 ms e dá para tentar outra, a certa fica apagada no lugar, o tempo esgotado revela.
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

const { default: KarutaDoPrototipo } = await import('../src/components/minigames/culturais/KarutaDoPrototipo')
const { falar } = await import('../src/lib/tts')

const itens: MinigameItem[] = [
  { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' },
  { cardId: 'c2', prompt: 'cachorro', answer: 'dog', lang: 'en' },
  { cardId: 'c3', prompt: 'gato', answer: 'cat', lang: 'en' },
  { cardId: 'c4', prompt: 'livro', answer: 'book', lang: 'en' },
  { cardId: 'c5', prompt: 'rio', answer: 'river', lang: 'en' },
  { cardId: 'c6', prompt: 'luz', answer: 'light', lang: 'en' },
  { cardId: 'c7', prompt: 'pão', answer: 'bread', lang: 'en' },
  { cardId: 'c8', prompt: 'nuvem', answer: 'cloud', lang: 'en' },
]
const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const um = (s: string) => document.querySelector(s)
const todos = (s: string) => [...document.querySelectorAll(s)]
const carta = (w: string) => um(`.pj-mesa [data-op="${w}"]`) as HTMLButtonElement
const pegar = (w: string) => fireEvent.click(carta(w))
const pista = () => um('.pj-pista > span:last-child')?.textContent

let relatorio: RoundReport | null
const montar = () =>
  render(<KarutaDoPrototipo items={itens} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  vi.mocked(falar).mockClear()
  vi.useFakeTimers({ shouldAdvanceTime: false })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('a cena do Karuta', () => {
  it('tem a pista em pílula (ícone, equalizador de 5 barras, texto) e a mesa com 6 cartas', () => {
    montar()
    expect(um('.pj-miolo > [data-pista] > .pj-pista > svg')).not.toBeNull()
    expect(todos('.pj-pista > .pj-eq > i')).toHaveLength(5)
    expect(pista()).toBe('casa')
    expect(todos('.pj-miolo > .pj-mesa > button.pj-carta')).toHaveLength(6)
    expect(
      todos('.pj-carta')
        .map((b) => b.textContent)
        .sort(),
    ).toEqual(['book', 'cat', 'dog', 'house', 'light', 'river'])
    expect(um('[data-ajuda="ouvir"]')?.textContent).toContain('Ouvir de novo')
    expect(um('[data-ajuda="tempo"]')).not.toBeNull()
    expect(um('[data-ajuda="resposta"]')).not.toBeNull()
  })

  it('o narrador fala o significado, e "Ouvir de novo" repete', () => {
    montar()
    expect(vi.mocked(falar).mock.calls[0].slice(0, 1)).toEqual(['casa'])
    expect(um('.pj-pista.falando.tocando')).not.toBeNull()
    fireEvent.click(um('[data-ajuda="ouvir"]') as HTMLElement)
    expect(vi.mocked(falar).mock.calls.filter((c) => c[0] === 'casa')).toHaveLength(2)
  })
})

describe('pegar a carta', () => {
  it('a errada pisca em vermelho por 420 ms e dá para tentar outra', () => {
    montar()
    pegar('dog')
    expect(carta('dog').className).toContain('errada')
    esperar(420)
    expect(carta('dog').className).not.toContain('errada')
    expect(carta('dog').disabled).toBe(false)
    expect(pista()).toBe('casa')
  })

  it('a certa acende, é dita, e 800 ms depois fica apagada no lugar e vem a próxima pista', () => {
    montar()
    pegar('house')
    expect(carta('house').className).toContain('certa')
    expect(carta('house').disabled).toBe(true)
    expect(vi.mocked(falar).mock.calls.at(-1)?.slice(0, 2)).toEqual(['house', 'en'])
    esperar(800)
    expect(carta('house').className).toContain('pega')
    expect(pista()).toBe('cachorro')
    expect(um('.hud .mut')?.textContent).toBe('1 de 6 cartas')
  })

  it('o tempo acaba em 8 s: a carta certa é revelada, e 1 s depois vem a próxima', () => {
    montar()
    esperar(8100)
    expect(carta('house').className).toContain('certa')
    expect(carta('house').className).toContain('pega')
    expect(um('.ganho.erro')?.textContent).toBe('o tempo acabou')
    esperar(1000)
    expect(pista()).toBe('cachorro')
  })

  it('a rodada inteira: o relatório sai 900 ms depois da última carta, com tentativas e revelações', () => {
    montar()
    pegar('dog') // erra uma vez na primeira
    pegar('house')
    esperar(800)
    esperar(8100) // deixa a segunda cair
    esperar(1000)
    for (const w of ['cat', 'book', 'river', 'light']) {
      pegar(w)
      esperar(800)
    }
    expect(relatorio).toBeNull()
    esperar(900)
    const r = relatorio as RoundReport | null
    expect(r?.gameId).toBe('karuta')
    expect(r?.items.map((o) => [o.itemRef, o.correct, o.attempts, !!o.revealed])).toEqual([
      ['house', true, 2, false],
      ['dog', false, 1, true],
      ['cat', true, 1, false],
      ['book', true, 1, false],
      ['river', true, 1, false],
      ['light', true, 1, false],
    ])
  })
})

describe('os níveis do Karuta', () => {
  it('no Fácil são 4 cartas na mesa e 12 segundos por carta', () => {
    localStorage.setItem('babel.nivel.karuta', 'facil')
    montar()
    expect(todos('.pj-carta')).toHaveLength(4)
    esperar(8100)
    expect(carta('house').className).not.toContain('certa')
    esperar(4000)
    expect(carta('house').className).toContain('certa')
  })

  it('no Difícil são 6 segundos por carta', () => {
    localStorage.setItem('babel.nivel.karuta', 'dificil')
    montar()
    expect(todos('.pj-carta')).toHaveLength(6)
    esperar(6100)
    expect(carta('house').className).toContain('certa')
  })
})
