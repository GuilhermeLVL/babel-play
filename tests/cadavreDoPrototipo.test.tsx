// @vitest-environment jsdom
/**
 * O CADAVRE DO PROTÓTIPO (`src/components/minigames/culturais/CadavreDoPrototipo.tsx`), porte de
 * `jogos2.js:483-523`: quatro cartões, o campo da frase e "Conferir"; a palavra usada acende enquanto a
 * pessoa escreve; conferir mostra quantas entraram, e "Continuar" encerra a rodada em 200 ms.
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

const { default: CadavreDoPrototipo } = await import('../src/components/minigames/culturais/CadavreDoPrototipo')
const { falar } = await import('../src/lib/tts')

const itens: MinigameItem[] = [
  { cardId: 'c1', prompt: 'tempestade', answer: 'storm', lang: 'en' },
  { cardId: 'c2', prompt: 'ponte', answer: 'bridge', lang: 'en' },
  { cardId: 'c3', prompt: 'sonho', answer: 'dream', lang: 'en' },
  { cardId: 'c4', prompt: 'janela', answer: 'window', lang: 'en' },
  { cardId: 'c5', prompt: 'de reserva', answer: 'cloud', lang: 'en' },
]
const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const um = (s: string) => document.querySelector(s)
const todos = (s: string) => [...document.querySelectorAll<HTMLElement>(s)]
const campo = () => um('textarea.pj-texto') as HTMLTextAreaElement
const escrever = (texto: string) => fireEvent.change(campo(), { target: { value: texto } })
const conferir = () => um('[data-pj="conferir"]') as HTMLButtonElement
const cartoes = () => todos('.pj-cartao').map((c) => c.className)

let relatorio: RoundReport | null
const montar = () =>
  render(<CadavreDoPrototipo items={itens} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
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

describe('a cena do Cadavre', () => {
  it('tem quatro cartões (palavra e tradução), o rótulo, o campo de 3 linhas e "Conferir" desabilitado', () => {
    montar()
    expect(todos('.pj-miolo > .pj-quatro > .pj-cartao').map((c) => c.dataset.w)).toEqual([
      'storm',
      'bridge',
      'dream',
      'window',
    ])
    expect(um('.pj-cartao > b')?.textContent).toBe('storm')
    expect(um('.pj-cartao > small')?.textContent).toBe('tempestade')
    expect(um('.pj-miolo > span.label-mono')?.textContent).toBe('Escreva UMA frase que use as quatro palavras')
    expect(campo().rows).toBe(3)
    expect(campo().placeholder).toBe('A sua frase pode ser absurda, só precisa usar as quatro.')
    expect(campo().getAttribute('aria-label')).toBe('Sua frase')
    expect(campo().lang).toBe('en')
    expect(um('.pj-miolo > .pj-acoes > button.btn.btn-solid[data-pj="conferir"] svg')).not.toBeNull()
    expect(conferir().disabled).toBe(true)
    expect(um('.pj-miolo > .pj-correcao')?.children).toHaveLength(0)
    expect(um('.hud .mut')?.textContent).toBe('0 de 4 palavras')
    expect(um('.hud-ajudas')?.children).toHaveLength(0)
  })
})

describe('escrever e conferir', () => {
  it('a palavra usada acende enquanto a pessoa escreve, com a flexão valendo', () => {
    montar()
    escrever('The storms')
    expect(cartoes()).toEqual(['pj-cartao usada', 'pj-cartao', 'pj-cartao', 'pj-cartao'])
    expect(conferir().disabled).toBe(false)
    escrever('The storms broke the window')
    expect(cartoes()).toEqual(['pj-cartao usada', 'pj-cartao', 'pj-cartao', 'pj-cartao usada'])
    escrever('The')
    expect(cartoes()).toEqual(['pj-cartao', 'pj-cartao', 'pj-cartao', 'pj-cartao'])
  })

  it('conferir trava o campo, esconde o botão, apaga as que faltaram e diz quantas entraram', () => {
    montar()
    escrever('A storm broke the window')
    fireEvent.click(conferir())
    expect(campo().disabled).toBe(true)
    expect(conferir().hidden).toBe(true)
    expect(cartoes()).toEqual(['pj-cartao usada', 'pj-cartao faltou', 'pj-cartao faltou', 'pj-cartao usada'])
    expect(um('.pj-correcao > p')?.textContent).toBe(
      'palavras usadas: 2/4. Produção livre: esta rodada não agenda revisão.',
    )
    expect(um('.pj-correcao > .pj-acoes > button.btn.btn-outline[data-pj="ouvir-frase"]')?.textContent).toContain(
      'Ouvir',
    )
    expect(um('.pj-correcao > .pj-acoes > button.btn.btn-solid[data-pj="continuar"]')?.textContent).toBe('Continuar')
    /* O placar conta as que faltaram na hora, e as usadas uma a uma, a cada 220 ms. */
    expect(um('.hud .mut')?.textContent).toBe('2 de 4 palavras')
    esperar(0)
    expect(um('.hud .mut')?.textContent).toBe('3 de 4 palavras')
    esperar(220)
    expect(um('.hud .mut')?.textContent).toBe('4 de 4 palavras')
  })

  it('"Ouvir" lê a frase; "Continuar" encerra em 200 ms com um resultado por palavra', () => {
    montar()
    escrever('A storm broke the window')
    fireEvent.click(conferir())
    esperar(220)
    fireEvent.click(um('[data-pj="ouvir-frase"]') as HTMLElement)
    expect(vi.mocked(falar).mock.calls.at(-1)?.slice(0, 2)).toEqual(['A storm broke the window', 'en'])
    fireEvent.click(um('[data-pj="continuar"]') as HTMLElement)
    expect(relatorio).toBeNull()
    esperar(200)
    const r = relatorio as RoundReport | null
    expect(r?.gameId).toBe('cadavre')
    expect(r?.items.map((o) => [o.cardId, o.correct, o.attempts])).toEqual([
      ['c1', true, 1],
      ['c2', false, 1],
      ['c3', false, 1],
      ['c4', true, 1],
    ])
  })

  it('nenhuma palavra usada: tudo apagado, 0/4, e a rodada ainda termina', () => {
    montar()
    escrever('Nothing here')
    fireEvent.click(conferir())
    expect(cartoes()).toEqual(['pj-cartao faltou', 'pj-cartao faltou', 'pj-cartao faltou', 'pj-cartao faltou'])
    expect(um('.pj-correcao > p b')?.textContent).toBe('0/4')
    expect(um('.hud .mut')?.textContent).toBe('4 de 4 palavras')
    fireEvent.click(um('[data-pj="continuar"]') as HTMLElement)
    esperar(200)
    expect((relatorio as RoundReport | null)?.items.every((o) => !o.correct)).toBe(true)
  })
})
