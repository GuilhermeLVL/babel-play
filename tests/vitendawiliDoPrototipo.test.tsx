// @vitest-environment jsdom
/**
 * O VITENDAWILI DO PROTÓTIPO (`src/components/minigames/culturais/VitendawiliDoPrototipo.tsx`), porte de
 * `jogos2.js:378-427`: a frase com a lacuna, as alternativas, e as regras: a errada é riscada e dá para
 * tentar de novo (menos no Difícil), a certa encaixa na lacuna e o enigma seguinte vem em 1,3 s.
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

const { default: VitendawiliDoPrototipo } = await import('../src/components/minigames/culturais/VitendawiliDoPrototipo')
const { falar } = await import('../src/lib/tts')

const itens: MinigameItem[] = [
  { cardId: 'c1', prompt: 'tempestade', answer: 'storm', sentence: 'The storm hit the coast last night', lang: 'en' },
  { cardId: 'c2', prompt: 'ponte', answer: 'bridge', sentence: 'We crossed the bridge at dawn', lang: 'en' },
  { cardId: 'c3', prompt: 'sonho', answer: 'dream', sentence: 'I had a strange dream', lang: 'en' },
  { cardId: 'c4', prompt: 'janela', answer: 'window', sentence: 'Open the window, please', lang: 'en' },
  { cardId: 'c5', prompt: 'sem frase', answer: 'cloud', lang: 'en' },
]
const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const um = (s: string) => document.querySelector(s)
const todos = (s: string) => [...document.querySelectorAll<HTMLButtonElement>(s)]
const opcao = (w: string) => um(`.opcoes-blitz [data-op="${w}"]`) as HTMLButtonElement
const escolher = (w: string) => fireEvent.click(opcao(w))
const enigma = () => um('.pj-enigma')?.textContent

let relatorio: RoundReport | null
const montar = () =>
  render(<VitendawiliDoPrototipo items={itens} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
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

describe('a cena do Vitendawili', () => {
  it('tem a frase com a lacuna e quatro alternativas; item sem frase não entra', () => {
    montar()
    expect(um('.pj-miolo > p.pj-enigma > span.pj-lacuna')?.getAttribute('aria-label')).toBe('palavra apagada')
    expect(enigma()).toBe('The   hit the coast last night')
    expect(um('.pj-miolo > .mut')).toBeNull()
    expect(todos('.pj-miolo > .opcoes-blitz > button')).toHaveLength(4)
    expect(todos('.opcoes-blitz button').map((b) => b.style.getPropertyValue('--i'))).toEqual(['0', '1', '2', '3'])
    expect(opcao('storm')).not.toBeNull()
    expect(opcao('cloud')).toBeNull()
    expect(um('.hud .mut')?.textContent).toBe('0 de 4 enigmas')
    expect(um('[data-ajuda="ouvir"]')?.getAttribute('title')).toBe('De graça')
    expect(um('[data-ajuda="resposta"]')).not.toBeNull()
  })

  it('a frase é narrada com uma pausa na lacuna, e "Ouvir" repete', () => {
    montar()
    expect(vi.mocked(falar).mock.calls[0].slice(0, 2)).toEqual(['The ,  hit the coast last night', 'en'])
    fireEvent.click(um('[data-ajuda="ouvir"]') as HTMLElement)
    expect(vi.mocked(falar)).toHaveBeenCalledTimes(2)
  })
})

describe('fechar o enigma', () => {
  it('a errada é riscada e desabilitada, e dá para tentar de novo', () => {
    montar()
    const errada = todos('.opcoes-blitz button').find((b) => b.dataset.op !== 'storm') as HTMLButtonElement
    fireEvent.click(errada)
    expect(errada.className).toBe('pj-fora')
    expect(errada.disabled).toBe(true)
    expect(um('.pj-lacuna.cheia')).toBeNull()
    escolher('storm')
    expect(um('.pj-lacuna.cheia')?.textContent).toBe('storm')
  })

  it('a certa encaixa na lacuna, a frase inteira é dita, e 1,3 s depois vem o próximo enigma', () => {
    montar()
    escolher('storm')
    expect(um('.pj-lacuna.cheia')?.textContent).toBe('storm')
    expect(opcao('storm').className).toBe('certa')
    expect(vi.mocked(falar).mock.calls.at(-1)?.slice(0, 2)).toEqual(['The storm hit the coast last night', 'en'])
    esperar(1300)
    expect(enigma()).toBe('We crossed the   at dawn')
    expect(um('.hud .mut')?.textContent).toBe('1 de 4 enigmas')
  })

  it('a rodada inteira: o relatório sai 900 ms depois, com as tentativas de cada enigma', () => {
    montar()
    fireEvent.click(todos('.opcoes-blitz button').find((b) => b.dataset.op !== 'storm') as HTMLButtonElement)
    for (const w of ['storm', 'bridge', 'dream', 'window']) {
      escolher(w)
      esperar(1300)
    }
    expect(relatorio).toBeNull()
    esperar(900)
    const r = relatorio as RoundReport | null
    expect(r?.gameId).toBe('vitendawili')
    expect(r?.items.map((o) => [o.cardId, o.correct, o.attempts])).toEqual([
      ['c1', true, 2],
      ['c2', true, 1],
      ['c3', true, 1],
      ['c4', true, 1],
    ])
  })
})

describe('os níveis do Vitendawili', () => {
  it('no Fácil são 3 alternativas e a tradução à vista', () => {
    localStorage.setItem('babel.nivel.vitendawili', 'facil')
    montar()
    expect(todos('.opcoes-blitz button')).toHaveLength(3)
    expect(um('.pj-miolo > p.mut')?.textContent).toBe('tempestade')
  })

  it('no Difícil o primeiro erro encerra o enigma: a certa acende, e 1,4 s depois vem o próximo', () => {
    localStorage.setItem('babel.nivel.vitendawili', 'dificil')
    montar()
    const errada = todos('.opcoes-blitz button').find((b) => b.dataset.op !== 'storm') as HTMLButtonElement
    fireEvent.click(errada)
    expect(errada.className).toBe('pj-fora')
    expect(opcao('storm').className).toBe('certa')
    expect(um('.pj-lacuna.cheia')).toBeNull()
    escolher('storm')
    expect(um('.pj-lacuna.cheia')).toBeNull()
    esperar(1400)
    expect(enigma()).toBe('We crossed the   at dawn')
    for (const w of ['bridge', 'dream', 'window']) {
      escolher(w)
      esperar(1300)
    }
    esperar(900)
    expect((relatorio as RoundReport | null)?.items.map((o) => [o.cardId, o.correct, o.attempts])).toEqual([
      ['c1', false, 1],
      ['c2', true, 1],
      ['c3', true, 1],
      ['c4', true, 1],
    ])
  })
})
