// @vitest-environment jsdom
/**
 * O SOLETRAR DO PROTÓTIPO (`src/components/minigames/TermoDoPrototipo.tsx`), porte de `jogos4.js:263-412`:
 * a escada de 1 e depois 2 tabuleiros, o teclado, as cores do palpite e a linha nova com as verdes presas.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RodadaTermo, RoundReport } from '../src/core'

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

const { default: TermoDoPrototipo } = await import('../src/components/minigames/TermoDoPrototipo')

const rodada = (resposta: string, pista: string): RodadaTermo => ({
  cardId: resposta,
  resposta,
  palavra: resposta.toLowerCase(),
  pista,
  lang: 'en',
})
const rodadas = [rodada('STORM', 'tempestade'), rodada('SHELF', 'prateleira'), rodada('TOWEL', 'toalha')]
const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const $ = (s: string) => document.querySelector<HTMLElement>(s)
const $$ = (s: string) => [...document.querySelectorAll<HTMLElement>(s)]
/* O placar é o da casca: o teste lê o rótulo e o relógio sem depender de qual desenho ela veste. */
const rotulo = () => $('.hud .entre .mut')?.textContent
const linha = (tab: number, n: number) =>
  $$(`[data-tab="${tab}"] .linha-termo:nth-child(${n}) .letra`).map(
    (l) => `${l.className.replace('letra', '').trim()}:${l.textContent}`,
  )
const escrever = (palavra: string) => {
  for (const c of palavra) fireEvent.keyDown(window, { key: c })
}
const enviar = () => fireEvent.keyDown(window, { key: 'Enter' })
/** O julgamento leva 5 × 110 + 420 ms. */
const JULGAR = 970

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  localStorage.setItem('babel.desenhoNovo', 'sim')
  vi.useFakeTimers({ shouldAdvanceTime: false })
  render(<TermoDoPrototipo rodadas={rodadas} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
})
afterEach(() => {
  cleanup()
  document.querySelectorAll('.ganho, .fx-vinheta').forEach((x) => x.remove())
  vi.useRealTimers()
})

describe('o tabuleiro do Soletrar', () => {
  it('começa com um tabuleiro de 6 linhas, a pista, o teclado e as ajudas', () => {
    expect($('.pj-miolo > .tabs-termo.pj-tabs')?.getAttribute('data-n')).toBe('1')
    expect($('.tab-termo header .pista')?.textContent).toBe('tempestade')
    expect($('.tab-termo header .revela')?.textContent).toBe('')
    expect($$('.grade-termo .linha-termo')).toHaveLength(6)
    expect($$('.linha-termo.atual')).toHaveLength(1)
    expect($$('.linha-termo.atual .letra')).toHaveLength(5)
    expect($$('.pj-miolo > .teclado .fila').map((f) => f.children.length)).toEqual([10, 9, 9])
    expect($('.teclado [data-tecla="Enter"]')?.getAttribute('aria-label')).toBe('Enviar palpite')
    expect($('.teclado [data-tecla="Backspace"]')?.getAttribute('aria-label')).toBe('Apagar')
    expect($('[data-ajuda="letra"] .n')?.textContent).toBe('2')
    expect($('[data-ajuda="ouvir"] .n')).toBeNull()
    expect($('[data-ajuda="resposta"] .n')?.textContent).toBe('1')
    expect(rotulo()).toBe('0 de 3 palavras')
  })
})

describe('escrever e enviar', () => {
  it('a letra entra na primeira casa vazia, pelo teclado físico ou pelo da tela', () => {
    escrever('st')
    fireEvent.click($('.teclado [data-tecla="O"]') as HTMLElement)
    expect(linha(0, 1)).toEqual(['cheia:S', 'cheia:T', 'cheia:O', ':', ':'])
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(linha(0, 1)).toEqual(['cheia:S', 'cheia:T', ':', ':', ':'])
  })

  it('Enter com casa vazia não envia', () => {
    escrever('sto')
    enviar()
    expect(linha(0, 1)).toEqual(['cheia:S', 'cheia:T', 'cheia:O', ':', ':'])
    expect($$('.linha-termo.atual')).toHaveLength(1)
  })

  it('o palpite errado ganha as cores, pinta o teclado, e a linha nova já vem com as verdes presas', () => {
    escrever('stamp')
    enviar()
    expect(linha(0, 1)).toEqual(['cheia certa:S', 'cheia certa:T', 'cheia fora:A', 'cheia lugar:M', 'cheia fora:P'])
    expect($('.teclado [data-tecla="S"]')?.className).toBe('')
    esperar(JULGAR)
    expect($('.teclado [data-tecla="S"]')?.className).toBe('certa')
    expect($('.teclado [data-tecla="M"]')?.className).toBe('lugar')
    expect($('.teclado [data-tecla="A"]')?.className).toBe('fora')
    expect(linha(0, 2)).toEqual(['cheia pj-fixa:S', 'cheia pj-fixa:T', ':', ':', ':'])
    expect($$('.linha-termo.atual')).toHaveLength(1)
    /* A pessoa só digita o que falta, e apagar pula as presas. */
    escrever('or')
    fireEvent.keyDown(window, { key: 'Backspace' })
    fireEvent.keyDown(window, { key: 'Backspace' })
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(linha(0, 2)).toEqual(['cheia pj-fixa:S', 'cheia pj-fixa:T', ':', ':', ':'])
  })

  it('acertar sela o tabuleiro e sobe o degrau: duas palavras com o mesmo palpite', () => {
    escrever('storm')
    enviar()
    expect($('.linha-termo.venceu')).not.toBeNull()
    expect($('.tab-termo.resolvido')).toBeNull()
    esperar(JULGAR)
    expect($('.tab-termo.resolvido .selo.ok')?.textContent).toBe(' certa')
    expect(rotulo()).toBe('1 de 3 palavras')
    expect($('.pj-instr')?.textContent).toBe('Subiu! Agora são duas ao mesmo tempo: o mesmo palpite vale para as duas.')
    esperar(1500)
    expect($('.tabs-termo')?.getAttribute('data-n')).toBe('2')
    expect($$('.tab-termo .pista').map((p) => p.textContent)).toEqual(['prateleira', 'toalha'])
    expect($$('[data-tab="0"] .linha-termo')).toHaveLength(7)
    escrever('shell')
    enviar()
    expect(linha(0, 1).map((x) => x.split(':')[0])).toEqual([
      'cheia certa',
      'cheia certa',
      'cheia certa',
      'cheia certa',
      'cheia fora',
    ])
    expect(linha(1, 1).map((x) => x.split(':')[0])).toEqual([
      'cheia fora',
      'cheia fora',
      'cheia lugar',
      'cheia fora',
      'cheia certa',
    ])
    esperar(JULGAR)
    /* Com dois tabuleiros a linha nova vem vazia; o que se sabe aparece no cabeçalho. */
    expect(linha(0, 2)).toEqual([':', ':', ':', ':', ':'])
    expect($$('.tab-termo .revela').map((r) => r.textContent)).toEqual(['SHEL·', '····L'])
  })

  it('a Dica prende a próxima letra desconhecida e gasta uma', () => {
    fireEvent.click($('[data-ajuda="letra"]') as HTMLElement)
    expect(linha(0, 1)).toEqual(['cheia pj-fixa:S', ':', ':', ':', ':'])
    expect($('.ganho')?.textContent).toBe('letra 1')
    expect($('[data-ajuda="letra"] .n')?.textContent).toBe('1')
  })

  it('a escada inteira entrega o relatório 900 ms depois do último julgamento', () => {
    escrever('storm')
    enviar()
    esperar(JULGAR + 1500)
    escrever('shelf')
    enviar()
    esperar(JULGAR)
    expect($$('.tab-termo.resolvido')).toHaveLength(1)
    escrever('towel')
    enviar()
    esperar(JULGAR)
    expect(relatorio).toBeNull()
    esperar(900)
    const r = relatorio as RoundReport | null
    expect(r?.items.map((o) => [o.itemRef, o.correct, o.attempts])).toEqual([
      ['storm', true, 1],
      ['shelf', true, 1],
      ['towel', true, 2],
    ])
  })

  it('acabar as tentativas mostra a palavra e encerra', () => {
    for (let n = 0; n < 6; n++) {
      escrever('xxxxx')
      enviar()
      esperar(JULGAR)
    }
    expect($('.tab-termo.falhou .selo.erro')?.textContent).toBe('STORM')
    esperar(900)
    expect((relatorio as RoundReport | null)?.items.map((o) => o.correct)).toEqual([false])
  })
})
