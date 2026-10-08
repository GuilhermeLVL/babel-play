// @vitest-environment jsdom
/**
 * A FRASE EMBARALHADA DO PROTÓTIPO (`src/components/minigames/FraseDoPrototipo.tsx`), porte de
 * `jogos4.js:415-514`: a linha, o banco que guarda o lugar de cada palavra, e a conferência que devolve
 * sozinha o que estava fora de ordem.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RodadaFrase, RoundReport } from '../src/core'

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

const { default: FraseDoPrototipo } = await import('../src/components/minigames/FraseDoPrototipo')

const rodadas: RodadaFrase[] = [
  {
    sentenceId: 's1',
    correta: ['Put', 'the', 'towel', 'here'],
    embaralhada: ['towel', 'here', 'Put', 'the'],
    traducao: 'Ponha a toalha aqui',
    lang: 'en',
  },
  {
    sentenceId: 's2',
    correta: ['She', 'had', 'a', 'dream'],
    embaralhada: ['dream', 'a', 'She', 'had'],
    traducao: 'Ela teve um sonho',
    lang: 'en',
  },
]
const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const $ = (s: string) => document.querySelector<HTMLElement>(s)
const $$ = (s: string) => [...document.querySelectorAll<HTMLElement>(s)]
/* O placar é o da casca: o teste lê o rótulo e o relógio sem depender de qual desenho ela veste. */
const rotulo = () => $('.hud .entre .mut')?.textContent
const tocar = (palavra: string) =>
  fireEvent.click($$('.pj-pecas .pj-peca:not(.fantasma)').find((b) => b.textContent === palavra) as HTMLElement)
const naLinha = () =>
  $$('.pj-linha .pj-peca').map((b) => `${b.className.replace('pj-peca na-linha', '').trim()}:${b.textContent}`)
const conferir = () => $('[data-pj="conferir"]') as HTMLButtonElement

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  localStorage.setItem('babel.desenhoNovo', 'sim')
  vi.useFakeTimers({ shouldAdvanceTime: false })
  render(<FraseDoPrototipo rodadas={rodadas} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
})
afterEach(() => {
  cleanup()
  document.querySelectorAll('.ganho, .fx-vinheta').forEach((x) => x.remove())
  vi.useRealTimers()
})

describe('o tabuleiro da Frase embaralhada', () => {
  it('tem o significado, a linha vazia, o banco, as ações e o pular', () => {
    expect($('.pj-miolo > .pj-centro .label-mono')?.textContent).toBe('Esta frase significa')
    expect($('.pj-centro .pj-traducao')?.textContent).toBe('Ponha a toalha aqui')
    expect($('.pj-miolo > .pj-linha[data-linha] .pj-vazio')?.textContent).toBe('Toque nas palavras na ordem certa.')
    expect($('.pj-miolo > .pj-aviso')?.getAttribute('role')).toBe('status')
    expect($$('.pj-miolo > .pj-pecas[data-banco] > .pj-peca').map((b) => b.textContent)).toEqual([
      'towel',
      'here',
      'Put',
      'the',
    ])
    expect($$('.pj-miolo > .pj-acoes > button').map((b) => b.textContent)).toEqual([' Recomeçar', ' Conferir'])
    expect(($('[data-pj="limpar"]') as HTMLButtonElement).disabled).toBe(true)
    expect(conferir().disabled).toBe(true)
    expect($('.pj-miolo > .pj-link')?.textContent).toBe('pular esta frase')
    expect($('[data-ajuda="dica"] .n')?.textContent).toBe('3')
    expect($('[data-ajuda="ouvir"] .n')).toBeNull()
    expect(rotulo()).toBe('0 de 2 frases')
  })
})

describe('montar e conferir', () => {
  it('a palavra tocada vai para a linha e deixa um fantasma no banco; tocar na linha devolve', () => {
    tocar('Put')
    expect(naLinha()).toEqual([':Put'])
    expect($$('.pj-pecas .pj-peca').map((b) => b.className)).toEqual([
      'pj-peca',
      'pj-peca',
      'pj-peca fantasma',
      'pj-peca',
    ])
    expect($('.pj-linha .pj-peca')?.title).toBe('Toque para tirar da frase')
    fireEvent.click($('.pj-linha .pj-peca') as HTMLElement)
    expect($('.pj-linha .pj-vazio')).not.toBeNull()
  })

  it('ordem errada: o começo certo fica verde, o resto fica vermelho e volta sozinho em 750 ms', () => {
    for (const p of ['Put', 'the', 'here', 'towel']) tocar(p)
    expect(conferir().disabled).toBe(false)
    fireEvent.click(conferir())
    expect($('.pj-linha')?.className).toBe('pj-linha errada')
    expect(naLinha()).toEqual([':Put', ':the', 'errou:here', 'errou:towel'])
    expect($('.pj-aviso')?.textContent).toBe('2 palavras ficaram no lugar certo. As outras voltaram: continue daqui.')
    expect($('.ganho.erro')?.textContent).toBe('Ordem incorreta')
    esperar(750)
    expect($('.pj-linha')?.className).toBe('pj-linha')
    expect(naLinha()).toEqual(['fixa:Put', 'fixa:the'])
  })

  it('nenhuma no lugar: o aviso manda começar por outra', () => {
    for (const p of ['the', 'Put', 'here', 'towel']) tocar(p)
    fireEvent.click(conferir())
    expect($('.pj-aviso')?.textContent).toBe('Ainda não. As palavras voltaram: tente começar por outra.')
    esperar(750)
    expect($('.pj-linha .pj-vazio')).not.toBeNull()
  })

  it('a Dica encaixa a próxima palavra certa, presa', () => {
    tocar('the')
    fireEvent.click($('[data-ajuda="dica"]') as HTMLElement)
    expect(naLinha()).toEqual(['fixa:Put'])
    expect($('.ganho')?.textContent).toBe('palavra 1')
    expect($('[data-ajuda="dica"] .n')?.textContent).toBe('2')
  })

  it('ordem certa: a linha fica verde, e a próxima frase vem em 1400 ms', () => {
    for (const p of ['Put', 'the', 'towel', 'here']) tocar(p)
    fireEvent.click(conferir())
    expect($('.pj-linha')?.className).toBe('pj-linha certa')
    expect(naLinha().every((x) => x.startsWith('fixa:'))).toBe(true)
    esperar(1400)
    expect($('.pj-traducao')?.textContent).toBe('Ela teve um sonho')
    expect(rotulo()).toBe('1 de 2 frases')
  })

  it('pular conta erro; a última frase entrega o relatório 900 ms depois', () => {
    fireEvent.click($('[data-pj="pular"]') as HTMLElement)
    expect($('.pj-traducao')?.textContent).toBe('Ela teve um sonho')
    for (const p of ['She', 'had', 'a', 'dream']) tocar(p)
    fireEvent.click(conferir())
    esperar(1400)
    expect(relatorio).toBeNull()
    esperar(900)
    const r = relatorio as RoundReport | null
    expect(r?.items.map((o) => [o.itemRef, o.correct])).toEqual([
      ['s1', false],
      ['s2', true],
    ])
  })
})
