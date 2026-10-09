// @vitest-environment jsdom
/**
 * A MEMÓRIA DO PROTÓTIPO (`src/components/minigames/MemoriaDoPrototipo.tsx`), porte de `jogos5.js:44-111`:
 * a mesa de 4 colunas, o par que fica aberto, o par errado que fecha sozinho (explorar não é errar) e o Espiar.
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

const { default: MemoriaDoPrototipo } = await import('../src/components/minigames/MemoriaDoPrototipo')

const itens: MinigameItem[] = Array.from({ length: 8 }, (_, k) => ({
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
const doPar = (k: number) => $$(`.carta[data-par="${k}"]`)

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  localStorage.setItem('babel.desenhoNovo', 'sim')
  vi.useFakeTimers({ shouldAdvanceTime: false })
  render(<MemoriaDoPrototipo items={itens} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
})
afterEach(() => {
  cleanup()
  document.querySelectorAll('.ganho, .fx-vinheta').forEach((x) => x.remove())
  vi.useRealTimers()
})

describe('a mesa da Memória', () => {
  it('tem 16 cartas de costas em 4 colunas, a instrução e o Espiar com 2', () => {
    const mesa = $('.pj-miolo > .tabuleiro') as HTMLElement
    expect(mesa.style.maxWidth).toBe('720px')
    expect(mesa.getAttribute('aria-label')).toBe('Tabuleiro')
    expect($$('.carta')).toHaveLength(16)
    expect(
      $$('.carta .verso')
        .map((v) => v.textContent)
        .join(''),
    ).toBe('?'.repeat(16))
    expect($('.pj-instr')?.textContent).toBe('Vire duas cartas por vez e feche os pares: a palavra e a tradução dela.')
    expect($('[data-ajuda="espiar"] .n')?.textContent).toBe('2')
    expect($('[data-ajuda="resposta"]')).toBeNull()
    expect(rotulo()).toBe('0 de 8 pares')
  })
})

describe('virar cartas', () => {
  it('o par certo fica aberto depois de 760 ms e conta no placar', () => {
    const [a, b] = doPar(3)
    fireEvent.click(a)
    expect(a.className).toBe('carta virada')
    expect(a.textContent).toBe(a.dataset.texto)
    fireEvent.click(b)
    esperar(759)
    expect(a.className).toBe('carta virada')
    esperar(1)
    expect(a.className).toBe('carta virada par')
    expect(b.className).toBe('carta virada par')
    expect(rotulo()).toBe('1 de 8 pares')
  })

  it('duas cartas nunca vistas que não combinam fecham sozinhas em 520 ms', () => {
    const [a] = doPar(0)
    const [b] = doPar(1)
    fireEvent.click(a)
    fireEvent.click(b)
    esperar(760)
    expect(a.className).toContain('carta virada')
    esperar(520)
    expect(a.className).toBe('carta')
    expect(b.className).toBe('carta')
    expect(a.querySelector('.verso')?.textContent).toBe('?')
  })

  it('com a mesa travada, uma terceira carta não vira', () => {
    fireEvent.click(doPar(0)[0])
    fireEvent.click(doPar(1)[0])
    fireEvent.click(doPar(2)[0])
    expect(doPar(2)[0].className).toBe('carta')
  })

  it('Espiar abre todas por 1700 ms, gasta uma e fecha de novo', () => {
    fireEvent.click($('[data-ajuda="espiar"]') as HTMLElement)
    expect($$('.carta.virada')).toHaveLength(16)
    expect($('[data-ajuda="espiar"] .n')?.textContent).toBe('1')
    esperar(1700)
    expect($$('.carta.virada')).toHaveLength(0)
  })

  it('fechar todos os pares entrega o relatório 900 ms depois', () => {
    for (let k = 0; k < 8; k++) {
      const [a, b] = doPar(k)
      fireEvent.click(a)
      fireEvent.click(b)
      esperar(760)
    }
    expect(relatorio).toBeNull()
    esperar(900)
    const r = relatorio as RoundReport | null
    expect(r?.gameId).toBe('memory')
    expect(r?.items.map((o) => o.correct)).toEqual(Array(8).fill(true))
    /* O cartão de cada par, uma vez só. */
    expect(r?.items.map((o) => o.cardId).sort()).toEqual(itens.map((i) => i.cardId).sort())
  })
})

/* Garantia que veio de `tests/memoriaExplorar.test.tsx` (o tabuleiro de antes): o que conta como erro. */
describe('explorar não é errar', () => {
  const fecharTudo = () => {
    for (let k = 0; k < 8; k++) {
      const [a, b] = doPar(k)
      fireEvent.click(a)
      fireEvent.click(b)
      esperar(760)
    }
    esperar(900)
  }
  const tentativas = () => Object.fromEntries((relatorio as RoundReport).items.map((o) => [o.cardId, o.attempts]))

  it('quem só virou cartas nunca vistas e depois fechou tudo sai com uma tentativa por par', () => {
    fireEvent.click(doPar(0)[0])
    fireEvent.click(doPar(1)[0])
    esperar(760 + 520)
    fireEvent.click(doPar(2)[0])
    fireEvent.click(doPar(3)[0])
    esperar(760 + 520)
    fecharTudo()
    expect(Object.values(tentativas())).toEqual(Array(8).fill(1))
  })

  it('errar com uma carta que já tinha aparecido conta uma tentativa a mais, só para ela', () => {
    fireEvent.click(doPar(0)[0])
    fireEvent.click(doPar(1)[0])
    esperar(760 + 520)
    /* A carta do par 0 já foi vista; a do par 2, não. */
    fireEvent.click(doPar(0)[0])
    fireEvent.click(doPar(2)[0])
    esperar(760 + 520)
    fecharTudo()
    expect(tentativas()).toEqual({ c0: 2, c1: 1, c2: 1, c3: 1, c4: 1, c5: 1, c6: 1, c7: 1 })
  })
})
