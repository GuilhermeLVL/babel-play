// @vitest-environment jsdom
/**
 * O CAÇA-PALAVRAS DO PROTÓTIPO (`src/components/minigames/CacaPalavrasDoPrototipo.tsx`), porte de
 * `jogos.js:534-637`: a grade 8×8, a lista de significados, o traço certo, o errado e o Radar.
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

const { default: CacaPalavrasDoPrototipo } = await import('../src/components/minigames/CacaPalavrasDoPrototipo')

const itens: MinigameItem[] = [
  { cardId: 'c1', prompt: 'tempestade', answer: 'storm', lang: 'en' },
  { cardId: 'c2', prompt: 'ponte', answer: 'bridge', lang: 'en' },
  { cardId: 'c3', prompt: 'nuvem', answer: 'cloud', lang: 'en' },
]
const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const $ = (s: string) => document.querySelector<HTMLElement>(s)
const $$ = (s: string) => [...document.querySelectorAll<HTMLElement>(s)]
/* O placar é o da casca: o teste lê o rótulo e o relógio sem depender de qual desenho ela veste. */
const rotulo = () => $('.hud .entre .mut')?.textContent
const cel = (i: number) => $(`.grade-caca [data-c="${i}"]`) as HTMLElement
const DIRECOES = [
  [0, 1],
  [1, 0],
  [1, 1],
]
/** As células de uma palavra, achadas na grade (Médio: para a direita, para baixo ou na diagonal). */
function acharNaGrade(w: string): number[] {
  const g = $$('.grade-caca [data-c]').map((c) => c.textContent)
  for (let p = 0; p < 64; p++)
    for (const [dr, dc] of DIRECOES) {
      const r = Math.floor(p / 8)
      const c = p % 8
      if (r + dr * (w.length - 1) > 7 || c + dc * (w.length - 1) > 7) continue
      const cs = [...w].map((_, k) => (r + dr * k) * 8 + c + dc * k)
      if (cs.every((x, k) => g[x] === w[k])) return cs
    }
  throw new Error('não achei ' + w)
}
/** Arrasta de `a` a `b`: o jsdom não tem `elementFromPoint`, o teste diz qual célula está sob o ponteiro. */
function arrastar(a: number, b: number) {
  fireEvent.pointerDown(cel(a))
  document.elementFromPoint = () => cel(b)
  fireEvent.pointerMove(cel(b))
  fireEvent.pointerUp(cel(b))
}

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  localStorage.setItem('babel.desenhoNovo', 'sim')
  vi.useFakeTimers({ shouldAdvanceTime: false })
  render(<CacaPalavrasDoPrototipo items={itens} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
})
afterEach(() => {
  cleanup()
  document.querySelectorAll('.ganho, .fx-vinheta').forEach((x) => x.remove())
  vi.useRealTimers()
})

describe('o tabuleiro do Caça-palavras', () => {
  it('tem a grade 8×8 e a lista de significados, sem a palavra', () => {
    expect(($('.pj-miolo > .caca > .grade-caca') as HTMLElement).style.getPropertyValue('--n')).toBe('8')
    expect($$('.grade-caca [data-c]')).toHaveLength(64)
    expect($('.caca .label-mono')?.textContent).toBe('Ache a palavra que significa:')
    expect($$('.pistas li').map((li) => li.textContent)).toEqual(['tempestade', 'ponte', 'nuvem'])
    expect($('.pistas li svg')).not.toBeNull()
    expect($('.pj-ini')).toBeNull()
    expect($('[data-ajuda="radar"] .n')?.textContent).toBe('3')
    expect($('[data-ajuda="resposta"] .n')?.textContent).toBe('1')
    expect(rotulo()).toBe('0 de 3 palavras')
  })
})

describe('traçar', () => {
  it('o traço certo acende a palavra, risca a pista e mostra a palavra ao lado', () => {
    const cs = acharNaGrade('STORM')
    arrastar(cs[0], cs[4])
    expect(cs.every((c) => cel(c).className === 'achada')).toBe(true)
    expect(cel(cs[2]).style.getPropertyValue('--k')).toBe('2')
    expect($('.pistas li.feita')?.textContent).toBe('tempestadeSTORM')
    expect(rotulo()).toBe('1 de 3 palavras')
  })

  it('de trás para a frente também vale', () => {
    const cs = acharNaGrade('CLOUD')
    arrastar(cs[4], cs[0])
    expect($('.pistas li.feita b')?.textContent).toBe('CLOUD')
  })

  it('tocar na primeira letra e depois na última também traça', () => {
    const cs = acharNaGrade('CLOUD')
    fireEvent.pointerDown(cel(cs[0]))
    fireEvent.pointerUp(cel(cs[0]))
    fireEvent.pointerDown(cel(cs[4]))
    fireEvent.pointerUp(cel(cs[4]))
    expect($('.pistas li.feita b')?.textContent).toBe('CLOUD')
  })

  it('o traço errado diz "Tente de novo" e não marca nada', () => {
    const cs = acharNaGrade('STORM')
    arrastar(cs[0], cs[1])
    expect($('.ganho.erro')?.textContent).toBe('Tente de novo')
    expect($$('.grade-caca .achada, .grade-caca .sel')).toHaveLength(0)
    expect(rotulo()).toBe('0 de 3 palavras')
  })

  it('o Radar acende as duas pontas de uma palavra por 4 s', () => {
    fireEvent.click($('[data-ajuda="radar"]') as HTMLElement)
    expect($$('.grade-caca .dica')).toHaveLength(2)
    expect($('.ganho')?.textContent).toBe('achei as pontas')
    expect($('[data-ajuda="radar"] .n')?.textContent).toBe('2')
    esperar(4000)
    expect($$('.grade-caca .dica')).toHaveLength(0)
  })

  it('achar todas entrega o relatório 900 ms depois', () => {
    for (const w of ['STORM', 'BRIDGE', 'CLOUD']) {
      const cs = acharNaGrade(w)
      arrastar(cs[0], cs[cs.length - 1])
    }
    expect(relatorio).toBeNull()
    esperar(900)
    expect((relatorio as RoundReport | null)?.items.map((o) => o.correct)).toEqual([true, true, true])
  })
})
