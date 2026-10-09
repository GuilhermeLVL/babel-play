// @vitest-environment jsdom
/**
 * O CHOSEONG DO PROTÓTIPO (`src/components/minigames/culturais/ChoseongDoPrototipo.tsx`), porte de
 * `jogos4.js:517-609`: as consoantes à vista, as vogais em caixas, e a conferência que só tira a vogal errada.
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

const { default: ChoseongDoPrototipo } = await import('../src/components/minigames/culturais/ChoseongDoPrototipo')

const itens: MinigameItem[] = [
  { cardId: 'c1', prompt: 'janela', answer: 'window', lang: 'en' },
  { cardId: 'c2', prompt: 'ponte', answer: 'bridge', lang: 'en' },
  { cardId: 'c3', prompt: 'nuvem', answer: 'cloud', lang: 'en' },
  { cardId: 'c4', prompt: 'sonho', answer: 'dream', lang: 'en' },
]
const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const $ = (s: string) => document.querySelector<HTMLElement>(s)
const $$ = (s: string) => [...document.querySelectorAll<HTMLElement>(s)]
/* O placar é o da casca: o teste lê o rótulo e o relógio sem depender de qual desenho ela veste. */
const rotulo = () => $('.hud .entre .mut')?.textContent
const relogio = () => parseInt($('.hud .entre span:nth-child(2)')?.textContent ?? '', 10)
const casas = () => $$('.pj-cho .letra').map((l) => `${l.className.replace('letra ', '')}:${l.textContent}`)
const tecla = (v: string) => fireEvent.click($(`.teclado [data-tecla="${v}"]`) as HTMLElement)

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  localStorage.setItem('babel.desenhoNovo', 'sim')
  vi.useFakeTimers({ shouldAdvanceTime: false })
  render(<ChoseongDoPrototipo items={itens} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
})
afterEach(() => {
  cleanup()
  document.querySelectorAll('.ganho, .fx-vinheta').forEach((x) => x.remove())
  vi.useRealTimers()
})

describe('o tabuleiro do Choseong', () => {
  it('tem o significado, as consoantes à vista, as vogais vazias, o teclado de vogais e o relógio de 15 s', () => {
    expect($('.pj-miolo > .termo-dica .label-mono')?.textContent).toBe('Significa')
    expect($('.termo-dica b')?.textContent).toBe('janela')
    expect($('.pj-miolo > .linha-termo.pj-cho')).not.toBeNull()
    expect(casas()).toEqual(['pj-cons:W', 'pj-vaga:', 'pj-cons:N', 'pj-cons:D', 'pj-vaga:', 'pj-cons:W'])
    expect($$('.pj-miolo > .teclado.vogais > .fila > button').map((b) => b.dataset.tecla)).toEqual([
      'A',
      'E',
      'I',
      'O',
      'U',
      'Backspace',
    ])
    expect($('.teclado .largo')?.getAttribute('aria-label')).toBe('Apagar')
    expect(relogio()).toBe(15)
    expect($('[data-ajuda="vogal"] .n')?.textContent).toBe('2')
    expect($('[data-ajuda="tempo"] .n')?.textContent).toBe('2')
    expect($('[data-ajuda="resposta"] .n')?.textContent).toBe('1')
    expect($('.pj-instr')?.textContent).toBe('As consoantes já estão na mesa. Complete as vogais.')
    expect(rotulo()).toBe('0 de 4 palavras')
  })
})

describe('preencher as vogais', () => {
  it('a vogal entra na primeira caixa vazia; apagar tira a última', () => {
    tecla('I')
    expect(casas()[1]).toBe('pj-vaga cheia:I')
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(casas()[1]).toBe('pj-vaga:')
  })

  it('errou uma: só ela fica vermelha e sai em 520 ms; a certa fica presa', () => {
    tecla('I')
    tecla('A')
    expect(casas()[1]).toBe('pj-vaga cheia:I')
    expect(casas()[4]).toBe('pj-vaga cheia pj-no:A')
    esperar(520)
    expect(casas()[1]).toBe('pj-vaga cheia pj-fixa:I')
    expect(casas()[4]).toBe('pj-vaga:')
    /* Apagar pula a presa. */
    fireEvent.keyDown(window, { key: 'Backspace' })
    expect(casas()[1]).toBe('pj-vaga cheia pj-fixa:I')
    expect(rotulo()).toBe('0 de 4 palavras')
  })

  it('acertou: as vogais ficam verdes, e a próxima palavra vem em 1100 ms', () => {
    fireEvent.keyDown(window, { key: 'i' })
    fireEvent.keyDown(window, { key: 'o' })
    expect($('.pj-cho')?.className).toBe('linha-termo pj-cho venceu')
    expect(casas()[1]).toBe('pj-vaga cheia certa:I')
    esperar(1100)
    expect($('.termo-dica b')?.textContent).toBe('ponte')
    expect(rotulo()).toBe('1 de 4 palavras')
    expect(relogio()).toBe(15)
  })

  it('o tempo acaba: a palavra aparece, e a próxima vem em 1300 ms', () => {
    esperar(15000)
    expect(casas()[1]).toBe('pj-vaga lugar:I')
    expect(casas()[4]).toBe('pj-vaga lugar:O')
    expect($('.ganho.erro')?.textContent).toBe('o tempo acabou')
    expect(rotulo()).toBe('1 de 4 palavras')
    esperar(1300)
    expect($('.termo-dica b')?.textContent).toBe('ponte')
  })

  it('"Abrir uma vogal" prende a primeira que ainda não está certa', () => {
    fireEvent.click($('[data-ajuda="vogal"]') as HTMLElement)
    esperar(0)
    expect(casas()[1]).toBe('pj-vaga cheia pj-fixa:I')
    expect($('[data-ajuda="vogal"] .n')?.textContent).toBe('1')
  })

  it('"+10 s" devolve dez segundos', () => {
    esperar(5000)
    fireEvent.click($('[data-ajuda="tempo"]') as HTMLElement)
    esperar(100)
    expect(relogio()).toBe(20)
  })

  it('a última palavra entrega o relatório 900 ms depois', () => {
    for (const vogais of ['IO', 'IE', 'OU', 'EA']) {
      for (const v of vogais) tecla(v)
      esperar(1100)
    }
    expect(relatorio).toBeNull()
    esperar(900)
    expect((relatorio as RoundReport | null)?.items.map((o) => o.correct)).toEqual([true, true, true, true])
  })

  /* Garantias que vieram de `tests/choseongGame.test.tsx` (o tabuleiro de antes): o que é gravado. */
  it('abrir uma vogal marca só aquela palavra como "com dica"; o erro conta tentativa', () => {
    fireEvent.click($('[data-ajuda="vogal"]') as HTMLElement) // prende o I de "window"
    esperar(0)
    tecla('O')
    esperar(1100)
    tecla('A') // "bridge": errou a primeira vogal
    tecla('E')
    esperar(520)
    tecla('I')
    esperar(1100)
    for (const vogais of ['OU', 'EA']) {
      for (const v of vogais) tecla(v)
      esperar(1100)
    }
    esperar(900)
    const r = relatorio as RoundReport | null
    expect(r?.gameId).toBe('choseong')
    expect(r?.items.map((o) => [o.cardId, o.correct, !!o.hinted])).toEqual([
      ['c1', true, true],
      ['c2', true, false],
      ['c3', true, false],
      ['c4', true, false],
    ])
    expect(r?.items[1].attempts).toBeGreaterThan(1)
  })
})
