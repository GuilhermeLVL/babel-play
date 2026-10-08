// @vitest-environment jsdom
/**
 * O DUELO DO PROTÓTIPO (`src/components/minigames/DueloDoPrototipo.tsx`), porte de `jogos.js:724-790`:
 * a pergunta, as quatro alternativas com tecla, o acerto, o erro que tira 2 s, o Cortar 2 e o fim por tempo.
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

const { default: DueloDoPrototipo } = await import('../src/components/minigames/DueloDoPrototipo')

const itens: MinigameItem[] = Array.from({ length: 6 }, (_, k) => ({
  cardId: `c${k}`,
  prompt: `pt${k}`,
  answer: `en${k}`,
  lang: 'en',
}))
const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const $ = (s: string) => document.querySelector<HTMLElement>(s)
const $$ = (s: string) => [...document.querySelectorAll<HTMLElement>(s)]
/* O placar é o da casca: o teste lê o rótulo e o relógio sem depender de qual desenho ela veste. */
const rotulo = () => $('.hud .entre .mut')?.textContent
const relogio = () => parseInt($('.hud .entre span:nth-child(2)')?.textContent ?? '', 10)
const pergunta = () => $('.blitz-palavra b')?.textContent
const certa = () => $$('.opcoes-blitz button').find((b) => b.dataset.op === 'en' + pergunta()?.slice(2)) as HTMLElement
const errada = () => $$('.opcoes-blitz button').find((b) => b !== certa()) as HTMLElement
const segundos = relogio

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  localStorage.setItem('babel.desenhoNovo', 'sim')
  vi.useFakeTimers({ shouldAdvanceTime: false })
  render(<DueloDoPrototipo items={itens} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
})
afterEach(() => {
  cleanup()
  document.querySelectorAll('.ganho, .fx-vinheta').forEach((x) => x.remove())
  vi.useRealTimers()
})

describe('o tabuleiro do Duelo', () => {
  it('tem a pergunta, quatro alternativas com as teclas 1 a 4, o relógio de 60 s e as três ajudas', () => {
    expect($('.pj-miolo > .blitz-palavra .label-mono')?.textContent).toBe('Que palavra é')
    expect(pergunta()).toBe('pt0')
    expect($$('.pj-miolo > .opcoes-blitz > button')).toHaveLength(4)
    expect($$('.opcoes-blitz kbd').map((k) => k.textContent)).toEqual(['1', '2', '3', '4'])
    expect($('.pj-instr')?.textContent).toBe('Sessenta segundos. Acerto rápido devolve tempo; erro tira 2 segundos.')
    expect(segundos()).toBe(60)
    expect($('[data-ajuda="cortar"] .n')?.textContent).toBe('2')
    expect($('[data-ajuda="tempo"] .n')?.textContent).toBe('2')
    expect($('[data-ajuda="resposta"] .n')?.textContent).toBe('1')
    expect(rotulo()).toBe('0 de 6 palavras')
  })
})

describe('responder', () => {
  it('o acerto pinta a certa, trava as outras e traz a próxima em 420 ms', () => {
    const b = certa()
    fireEvent.click(b)
    expect(b.className).toBe('certa')
    expect($$('.opcoes-blitz button').every((x) => (x as HTMLButtonElement).disabled)).toBe(true)
    esperar(420)
    expect(pergunta()).toBe('pt1')
    expect(rotulo()).toBe('1 de 6 palavras')
  })

  it('o erro pinta a escolhida e a certa, diz "−2s", tira 2 s e traz a próxima em 650 ms', () => {
    esperar(5000)
    const b = errada()
    const c = certa()
    fireEvent.click(b)
    expect(b.className).toBe('errada')
    expect(c.className).toBe('certa')
    expect($('.ganho.erro')?.textContent).toBe('−2s')
    esperar(600)
    expect(pergunta()).toBe('pt0')
    expect(segundos()).toBe(53)
    esperar(50)
    expect(pergunta()).toBe('pt1')
  })

  it('a tecla 1 escolhe a primeira alternativa', () => {
    fireEvent.keyDown(window, { key: '1' })
    expect($$('.opcoes-blitz button').some((x) => x.className.includes('certa'))).toBe(true)
  })

  it('Cortar 2 risca duas erradas, uma vez por pergunta', () => {
    fireEvent.click($('[data-ajuda="cortar"]') as HTMLElement)
    expect($$('.opcoes-blitz .pj-fora')).toHaveLength(2)
    expect(certa().className).toBe('')
    expect($('.ganho')?.textContent).toBe('sobraram 2')
    fireEvent.click($('[data-ajuda="cortar"]') as HTMLElement)
    expect($('[data-ajuda="cortar"] .n')?.textContent).toBe('1')
  })

  it('"+10 s" devolve dez segundos ao relógio', () => {
    esperar(20000)
    fireEvent.click($('[data-ajuda="tempo"]') as HTMLElement)
    esperar(100)
    expect(segundos()).toBe(50)
  })

  it('o tempo acaba: o relatório sai 200 ms depois, só com o que foi respondido', () => {
    esperar(4000)
    fireEvent.click(certa())
    esperar(56000)
    expect(relatorio).toBeNull()
    esperar(200)
    expect((relatorio as RoundReport | null)?.items).toHaveLength(1)
  })

  it('a última palavra respondida: o relatório sai 900 ms depois da jogada', () => {
    for (let k = 0; k < 6; k++) {
      fireEvent.click(certa())
      esperar(420)
    }
    expect(relatorio).toBeNull()
    esperar(900)
    expect((relatorio as RoundReport | null)?.items).toHaveLength(6)
  })
})
