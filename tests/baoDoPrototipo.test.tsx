// @vitest-environment jsdom
/**
 * O BAO DO PROTÓTIPO (`src/components/minigames/culturais/BaoDoPrototipo.tsx`), porte de
 * `jogos2.js:286-375`: a pista, a palavra montada (o que falta em pontos), as covas, e as regras: corte a
 * cada 2 letras com 3 a 6 pedaços, a cova errada desmarca sozinha em 700 ms, 3 erros por palavra no Médio,
 * a Dica semeia o próximo pedaço uma vez por palavra.
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

const { default: BaoDoPrototipo, partirEmPedacos } = await import(
  '../src/components/minigames/culturais/BaoDoPrototipo'
)

const itens: MinigameItem[] = [
  { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' },
  { cardId: 'c2', prompt: 'banana', answer: 'banana', lang: 'en' },
  { cardId: 'c3', prompt: 'ponte', answer: 'bridge', lang: 'en' },
  { cardId: 'c4', prompt: 'janela', answer: 'window', lang: 'en' },
]
const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const um = (s: string) => document.querySelector(s)
const todos = (s: string) => [...document.querySelectorAll<HTMLButtonElement>(s)]
/** A primeira cova ainda livre com este pedaço. */
const cova = (texto: string) =>
  todos('.pj-cova:not(.semeada)').find((b) => b.textContent === texto) as HTMLButtonElement
const semear = (...pedacos: string[]) => pedacos.forEach((p) => fireEvent.click(cova(p)))
const montada = () => um('[data-montada]')?.textContent
const aviso = () => um('.pj-aviso')?.textContent

let relatorio: RoundReport | null
const montar = () => render(<BaoDoPrototipo items={itens} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: false })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('o corte da palavra', () => {
  it('é a cada 2 letras, com no mínimo 3 e no máximo 6 pedaços', () => {
    expect(partirEmPedacos('HOUSE')).toEqual(['HO', 'US', 'E'])
    expect(partirEmPedacos('BANANA')).toEqual(['BA', 'NA', 'NA'])
    expect(partirEmPedacos('SUN')).toEqual(['S', 'U', 'N'])
    expect(partirEmPedacos('MEDICINE')).toEqual(['ME', 'DI', 'CI', 'NE'])
    expect(partirEmPedacos('UNDERSTANDING')).toEqual(['UND', 'ER', 'ST', 'AN', 'DI', 'NG'])
  })
})

describe('a cena do Bao', () => {
  it('tem a pista, a palavra montada em pontos, a contagem, as covas e o aviso', () => {
    montar()
    expect(um('.pj-miolo > .termo-dica > .label-mono')?.textContent).toBe('Pista')
    expect(um('.termo-dica > b')?.textContent).toBe('casa')
    expect(um('.pj-bao > .pj-montada > .label-mono')?.textContent?.trim()).toBe('Palavra montada')
    expect(um('.pj-montada > .label-mono > svg')).not.toBeNull()
    expect(um('[data-montada] > i')?.textContent).toBe('·····')
    expect(um('[data-conta]')?.textContent).toBe('0 de 3 pedaços')
    expect(
      todos('.pj-bao > .pj-covas > button.pj-cova')
        .map((b) => b.textContent)
        .sort(),
    ).toEqual(['E', 'HO', 'US'])
    /* Nunca na ordem certa: semear na ordem dada seria vitória de graça. */
    expect(todos('.pj-cova').map((b) => b.textContent)).not.toEqual(['HO', 'US', 'E'])
    expect(um('.pj-bao > p.pj-aviso.erro')?.getAttribute('role')).toBe('status')
    expect(um('[data-ajuda="dica"]')?.getAttribute('title')).toBe('Conta como dica: zera o combo')
    expect(um('[data-ajuda="resposta"]')).not.toBeNull()
    expect(um('[data-ajuda="tempo"]')).toBeNull()
  })
})

describe('semear', () => {
  it('o pedaço certo entra na palavra, e a cova vira um "certo" desabilitado', () => {
    montar()
    const ho = cova('HO')
    fireEvent.click(ho)
    expect(montada()).toBe('HO···')
    expect(um('[data-conta]')?.textContent).toBe('1 de 3 pedaços')
    expect(ho.className).toContain('semeada')
    expect(ho.disabled).toBe(true)
    expect(ho.querySelector('svg')).not.toBeNull()
  })

  it('a cova errada fica vermelha, avisa quantos restam e desmarca sozinha em 700 ms', () => {
    montar()
    const us = cova('US')
    fireEvent.click(us)
    expect(us.className).toContain('errada')
    expect(aviso()).toBe('Este pedaço não abre a palavra aqui. Restam 2.')
    esperar(700)
    expect(us.className).not.toContain('errada')
    expect(us.disabled).toBe(false)
    /* O pedaço certo apaga o aviso. */
    semear('HO')
    expect(aviso()).toBe('')
  })

  it('palavra completa: 1 s depois vem a próxima', () => {
    montar()
    semear('HO', 'US', 'E')
    expect(montada()).toBe('HOUSE')
    esperar(1000)
    expect(um('.termo-dica > b')?.textContent).toBe('banana')
    expect(um('.hud .mut')?.textContent).toBe('1 de 4 palavras')
  })

  it('3 erros no Médio: a palavra aparece no aviso, e 1,6 s depois vem a próxima', () => {
    montar()
    semear('US', 'E', 'US')
    expect(aviso()).toBe('A palavra era HOUSE.')
    fireEvent.click(cova('HO'))
    expect(montada()).toBe('·····')
    esperar(1600)
    expect(um('.termo-dica > b')?.textContent).toBe('banana')
  })

  it('pedaço repetido: qualquer cova com o mesmo texto serve (BANANA tem dois NA)', () => {
    montar()
    semear('HO', 'US', 'E')
    esperar(1000)
    const [na1, na2] = todos('.pj-cova').filter((b) => b.textContent === 'NA')
    semear('BA')
    fireEvent.click(na2)
    expect(montada()).toBe('BANA··')
    fireEvent.click(na1)
    expect(montada()).toBe('BANANA')
  })

  it('a Dica semeia o próximo pedaço, uma vez por palavra', () => {
    montar()
    fireEvent.click(um('[data-ajuda="dica"]') as HTMLElement)
    esperar(0)
    expect(montada()).toBe('HO···')
    fireEvent.click(um('[data-ajuda="dica"]') as HTMLElement)
    esperar(0)
    expect(montada()).toBe('HO···')
  })

  it('a rodada inteira: o relatório sai 900 ms depois, com erros e dica por palavra', () => {
    montar()
    semear('US', 'HO', 'US', 'E') // um erro
    esperar(1000)
    fireEvent.click(um('[data-ajuda="dica"]') as HTMLElement) // com dica
    esperar(0)
    semear('NA', 'NA')
    esperar(1000)
    semear('GE', 'GE', 'GE') // perde: três erros
    esperar(1600)
    semear('WI', 'ND', 'OW')
    esperar(1000)
    expect(relatorio).toBeNull()
    esperar(900)
    const r = relatorio as RoundReport | null
    expect(r?.gameId).toBe('bao')
    expect(r?.items.map((o) => [o.itemRef, o.correct, o.attempts, !!o.hinted])).toEqual([
      ['house', true, 2, false],
      ['banana', true, 1, true],
      ['bridge', false, 4, false],
      ['window', true, 1, false],
    ])
  })
})

describe('os níveis do Bao', () => {
  it('no Fácil são 4 erros por palavra', () => {
    localStorage.setItem('babel.nivel.bao', 'facil')
    montar()
    semear('US')
    expect(aviso()).toBe('Este pedaço não abre a palavra aqui. Restam 3.')
  })

  it('no Difícil são 2', () => {
    localStorage.setItem('babel.nivel.bao', 'dificil')
    montar()
    semear('US')
    expect(aviso()).toBe('Este pedaço não abre a palavra aqui. Restam 1.')
    semear('E')
    expect(aviso()).toBe('A palavra era HOUSE.')
  })
})
