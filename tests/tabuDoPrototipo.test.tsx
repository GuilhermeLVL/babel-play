// @vitest-environment jsdom
/**
 * O TABU DO PROTÓTIPO (`src/components/minigames/culturais/TabuDoPrototipo.tsx`), porte de
 * `jogos2.js:526-576`: o cartão da definição com os termos riscados, as alternativas, uma tentativa só
 * por carta contra o relógio, "Liberar 1" e o que cada nível muda.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameItem, RoundReport } from '../src/core'

/* O aparelho do teste é um computador: é onde o desenho novo (e o placar do protótipo) liga. */
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const m = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...m, perfilDoDispositivo: () => ({ ...m.perfilDoDispositivo(), tipo: 'desktop-com-gpu' }) }
})
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

const { default: TabuDoPrototipo } = await import('../src/components/minigames/culturais/TabuDoPrototipo')

const itens: MinigameItem[] = [
  { cardId: 'c1', prompt: 'A hospital is a building where doctors treat patients.', answer: 'hospital', lang: 'en' },
  { cardId: 'c2', prompt: 'A library is a building where people borrow literature.', answer: 'library', lang: 'en' },
  { cardId: 'c3', prompt: 'A bicycle is a vehicle with two narrow wheels.', answer: 'bicycle', lang: 'en' },
  { cardId: 'c4', prompt: 'To harvest is to gather a crop that is ready.', answer: 'harvest', lang: 'en' },
]

const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const q = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T | null
const qq = (s: string) => [...document.querySelectorAll<HTMLElement>(s)]
const nivel = (n: 'facil' | 'medio' | 'dificil') => localStorage.setItem('babel.nivel.taboo', n)

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  localStorage.setItem('babel.desenhoNovo', 'sim')
  vi.useFakeTimers({ shouldAdvanceTime: false })
})
afterEach(() => {
  cleanup()
  document.querySelectorAll('.ganho, .fx-vinheta').forEach((x) => x.remove())
  vi.useRealTimers()
  vi.clearAllMocks()
})

const montar = () =>
  render(
    <section className="palco-jogo">
      <TabuDoPrototipo items={itens} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />
    </section>,
  )
const opcao = (texto: string) => q<HTMLButtonElement>(`.opcoes-blitz [data-op="${texto}"]`)!
const riscadas = () => qq('.pj-tabu s:not(.livre)').length
const titulo = () => q('.pj-tabu .label-mono')?.textContent

describe('a cena do Tabu', () => {
  it('tem a instrução, o cartão com o cabeçalho, os termos riscados e as alternativas do protótipo', () => {
    montar()
    expect(q('.pj-instr')?.textContent).toBe('A definição vem sem os termos mais óbvios. Descubra a palavra.')
    expect(q('.pj-miolo > .pj-tabu > header > .label-mono')?.textContent).toBe('Definição (1 de 4)')
    expect(riscadas()).toBeGreaterThan(0)
    expect(q('.pj-tabu header [data-n]')?.textContent).toBe(
      `${riscadas()} ${riscadas() === 1 ? 'proibida' : 'proibidas'}`,
    )
    expect(q('.pj-tabu p')?.textContent).not.toMatch(/hospital/i)
    const ops = qq('.pj-miolo > .opcoes-blitz > button')
    expect(ops).toHaveLength(4)
    expect(ops.map((b) => b.style.getPropertyValue('--i'))).toEqual(['0', '1', '2', '3'])
    expect(ops.map((b) => b.dataset.op)).toContain('hospital')
    expect(q('[data-pj="rotulo"]')?.textContent).toBe('0 de 4 cartas')
    expect(q('[data-pj="relogio"]')?.textContent).toBe('30s')
  })

  it('as ajudas do placar são as do protótipo: Liberar 1 (sem contagem), +10 s e Ver resposta', () => {
    montar()
    expect(qq('.hud-ajudas .ajuda-jogo').map((b) => b.dataset.ajuda)).toEqual(['liberar', 'tempo', 'resposta'])
    expect(q('[data-ajuda="liberar"] .n')).toBeNull()
    expect(q('[data-ajuda="liberar"]')?.getAttribute('title')).toBe('Conta como dica: zera o combo')
  })
})

describe('a jogada do Tabu', () => {
  it('acerto: a certa fica marcada, tudo desliga, e a próxima carta vem em 700 ms', () => {
    montar()
    fireEvent.click(opcao('hospital'))
    expect(opcao('hospital').className).toBe('certa')
    expect(qq('.opcoes-blitz button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    expect(q('[data-pj="rotulo"]')?.textContent).toBe('1 de 4 cartas')
    esperar(699)
    expect(titulo()).toBe('Definição (1 de 4)')
    esperar(1)
    expect(titulo()).toBe('Definição (2 de 4)')
  })

  it('erro: é uma tentativa só; a escolhida fica vermelha, a certa aparece, e a próxima vem em 1300 ms', () => {
    montar()
    const errada = qq('.opcoes-blitz button').find((b) => b.dataset.op !== 'hospital') as HTMLButtonElement
    fireEvent.click(errada)
    expect(errada.className).toBe('errada')
    expect(opcao('hospital').className).toBe('certa')
    fireEvent.click(opcao('hospital'))
    esperar(1299)
    expect(titulo()).toBe('Definição (1 de 4)')
    esperar(1)
    expect(titulo()).toBe('Definição (2 de 4)')
  })

  it('o tempo acaba em 30 s: a certa aparece, sobe "o tempo acabou" e a carta conta como revelada', () => {
    montar()
    esperar(30100)
    expect(opcao('hospital').className).toBe('certa')
    expect(q('.ganho.erro')?.textContent).toBe('o tempo acabou')
    esperar(1300)
    for (const r of ['library', 'bicycle', 'harvest']) {
      fireEvent.click(opcao(r))
      esperar(700)
    }
    esperar(900)
    const feito = relatorio as RoundReport | null
    expect(feito?.gameId).toBe('taboo')
    expect(feito?.items.map((o) => o.correct)).toEqual([false, true, true, true])
    expect(feito?.items[0].revealed).toBe(true)
  })

  it('Liberar 1 solta a primeira riscada, sobra sempre uma, e o acerto conta como com dica', () => {
    montar()
    const antes = riscadas()
    const liberar = q<HTMLButtonElement>('[data-ajuda="liberar"]')!
    for (let k = 0; k < 5; k++) fireEvent.click(liberar)
    expect(riscadas()).toBe(1)
    expect(qq('.pj-tabu s.livre').length).toBe(antes - 1)
    expect(q('.pj-tabu header [data-n]')?.textContent).toBe('1 proibida')
    fireEvent.click(opcao('hospital'))
    esperar(700)
    for (const r of ['library', 'bicycle', 'harvest']) {
      fireEvent.click(opcao(r))
      esperar(700)
    }
    esperar(900)
    expect((relatorio as RoundReport | null)?.items.map((o) => !!o.hinted)).toEqual([antes > 1, false, false, false])
  })
})

describe('os níveis do Tabu', () => {
  it('Fácil: 45 s, três alternativas e a primeira proibida já vem solta', () => {
    montar()
    const noMedio = riscadas()
    cleanup()
    nivel('facil')
    montar()
    expect(q('[data-pj="relogio"]')?.textContent).toBe('45s')
    expect(qq('.opcoes-blitz button')).toHaveLength(3)
    expect(noMedio).toBeGreaterThan(1)
    expect(q('.pj-tabu s')?.className).toBe('livre')
    expect(riscadas()).toBe(noMedio - 1)
  })

  it('Difícil: 23 s por carta (o que o código do protótipo dá) e quatro alternativas', () => {
    nivel('dificil')
    montar()
    expect(q('[data-pj="relogio"]')?.textContent).toBe('23s')
    expect(qq('.opcoes-blitz button')).toHaveLength(4)
  })
})
