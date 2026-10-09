// @vitest-environment jsdom
/**
 * O RALI DO PROTÓTIPO (`src/components/minigames/culturais/RaliDoPrototipo.tsx`), porte de
 * `jogos3.js:19-173`: a cena (placar, quadra, bola, casas por letra) e as regras de digitação: a letra
 * certa acende, a errada sai sozinha em 380 ms, completar devolve, Enter devolve antes de completar.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameItem, RoundReport } from '../src/core'

/* O aparelho do teste é um computador, com teclado físico: sem ele o relógio da bola é mais folgado. */
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

const { default: RaliDoPrototipo } = await import('../src/components/minigames/culturais/RaliDoPrototipo')

const itens: MinigameItem[] = [
  { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' },
  { cardId: 'c2', prompt: 'avó', answer: 'avó', lang: 'pt' },
  { cardId: 'c3', prompt: 'gato', answer: 'cat', lang: 'en' },
  { cardId: 'c4', prompt: 'bem-vindo', answer: 'well-come', lang: 'en' },
]
const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const campo = () => document.querySelector('.rl-campo') as HTMLInputElement
const digitar = (texto: string) => fireEvent.change(campo(), { target: { value: texto } })
const casas = () => [...document.querySelectorAll('.rl-letras span')].map((s) => `${s.className}:${s.textContent}`)

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: false })
  Element.prototype.animate = (() => ({
    finished: Promise.resolve(),
    cancel: () => undefined,
    pause: () => undefined,
    play: () => undefined,
  })) as never
  ;(globalThis as { DOMMatrix?: unknown }).DOMMatrix = class {
    m41 = 0
    m42 = 0
    a = 1
  }
  render(<RaliDoPrototipo items={itens} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
  esperar(500) // o primeiro saque
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('a cena do Rali', () => {
  it('tem o placar Você × Babel com o rali no meio, a quadra, a bola, as duas raquetes e a placa', () => {
    expect(document.querySelector('.rl-arena > .rl-placar [data-voce]')?.textContent).toBe('0')
    expect(document.querySelector('.rl-placar .rl-rali [data-rali]')?.textContent).toBe('0')
    expect(document.querySelector('.rl-placar [data-ele]')?.textContent).toBe('0')
    for (const peca of ['.rl-chao', '.rl-raq.ele', '.rl-rede', '.rl-sombra', '.rl-bola > i', '.rl-raq.eu', '.rl-msg'])
      expect(document.querySelector(`.rl-quadra ${peca}`), peca).not.toBeNull()
    expect(document.querySelector('.rl-pista small')?.textContent).toBe('Devolva escrevendo')
    expect(document.querySelector('.rl-pista b')?.textContent).toBe('casa')
    expect(document.querySelector('.rl-dica')?.textContent).toBe(
      'Enter devolve antes de completar. Tocar na quadra chama o teclado.',
    )
  })

  it('uma casa por letra; a da vez fica marcada', () => {
    expect(casas()).toEqual(['vez:', ':', ':', ':', ':'])
  })
})

describe('escrever a devolução', () => {
  it('a letra certa acende; a errada fica vermelha e sai sozinha em 380 ms', () => {
    digitar('hox')
    expect(casas()).toEqual(['ok:h', 'ok:o', 'no:x', 'vez:', ':'])
    esperar(380)
    expect(casas()).toEqual(['ok:h', 'ok:o', 'vez:', ':', ':'])
    expect(campo().value).toBe('ho')
  })

  it('completar devolve sozinho: ponto para você, o rali sobe, e vem a próxima bola', () => {
    digitar('house')
    expect(document.querySelector('[data-voce]')?.textContent).toBe('1')
    expect(document.querySelector('[data-rali]')?.textContent).toBe('1')
    esperar(560)
    expect(document.querySelector('.rl-pista b')?.textContent).toBe('avó')
  })

  it('Enter antes de completar é bola fora: ponto do Babel, o rali zera e a palavra aparece', () => {
    digitar('ho')
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(document.querySelector('.rl-msg')?.textContent).toBe('Fora! Era: house')
    expect(document.querySelector('[data-ele]')?.textContent).toBe('1')
    esperar(1700)
    expect(document.querySelector('.rl-msg')?.textContent).toBe('')
    expect(document.querySelector('.rl-pista b')?.textContent).toBe('avó')
  })

  it('a bola que cai é ponto do Babel, e a palavra aparece', () => {
    esperar(8100)
    expect(document.querySelector('.rl-msg')?.textContent).toBe('A bola caiu na quadra. Era: house')
    expect(document.querySelector('[data-ele]')?.textContent).toBe('1')
  })

  it('com as palavras de verdade: acento aceita a letra sem ele, e o hífen entra sozinho', () => {
    digitar('house')
    esperar(560)
    esperar(1) // o saque da bola seguinte
    digitar('avo')
    expect(document.querySelector('[data-voce]')?.textContent).toBe('2')
    esperar(560)
    esperar(1) // o saque da bola seguinte
    digitar('cat')
    esperar(560)
    esperar(1) // o saque da bola seguinte
    digitar('wellc')
    expect(casas().slice(0, 6)).toEqual(['ok:w', 'ok:e', 'ok:l', 'ok:l', 'ok:-', 'ok:c'])
    digitar('wellcome')
    esperar(560 + 1100)
    expect((relatorio as RoundReport | null)?.items.map((o) => o.correct)).toEqual([true, true, true, true])
  })
})
