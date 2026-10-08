// @vitest-environment jsdom
/**
 * O KARAOKÊ DO PROTÓTIPO (`src/components/minigames/KaraokeDoPrototipo.tsx`), porte de `jogos2.js:579-644`:
 * a frase com uma peça por palavra, "Ouvir", "devagar", "Falar agora", a nota e "Próxima". No protótipo a
 * nota é sorteada; aqui é a do reconhecimento de fala de verdade, com a aparência dele.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RoundReport } from '../src/core'

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

const { default: KaraokeDoPrototipo } = await import('../src/components/minigames/KaraokeDoPrototipo')

const falas = () => [
  { id: 'k1', texto: 'We ship the order today', traducao: 'Enviamos o pedido hoje', lang: 'en', startMs: 0, endMs: 0 },
  { id: 'k2', texto: 'Good morning', traducao: 'Bom dia', lang: 'en', startMs: 0, endMs: 0 },
]

/** O reconhecimento de fala de mentira: o teste diz o que ele "ouviu". */
interface Rec {
  onresult?: (e: unknown) => void
  onend?: () => void
}
const estado: { rec: Rec | null } = { rec: null }
class Reconhecimento implements Rec {
  lang = ''
  interimResults = false
  maxAlternatives = 1
  onresult?: (e: unknown) => void
  onend?: () => void
  start() {
    estado.rec = this
  }
  stop() {}
  abort() {}
}
const global = window as unknown as Record<string, unknown>
const ouvir = (dito: string) =>
  act(() => {
    estado.rec?.onresult?.({ results: [[{ transcript: dito }]] })
    estado.rec?.onend?.()
    vi.advanceTimersByTime(20) // o quadro em que o "+N" sobe
  })

const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const q = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T | null
const qq = (s: string) => [...document.querySelectorAll<HTMLElement>(s)]

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  estado.rec = null
  global.webkitSpeechRecognition = Reconhecimento
  localStorage.clear()
  localStorage.setItem('babel.desenhoNovo', 'sim')
  vi.useFakeTimers({ shouldAdvanceTime: false })
})
afterEach(() => {
  cleanup()
  document.querySelectorAll('.ganho, .fx-vinheta').forEach((x) => x.remove())
  delete global.webkitSpeechRecognition
  vi.useRealTimers()
  vi.clearAllMocks()
})

const montar = () =>
  render(
    <section className="palco-jogo">
      <KaraokeDoPrototipo falas={falas()} audioUrl="" onFinish={(r) => (relatorio = r)} onExit={() => undefined} />
    </section>,
  )
const classes = () => qq('.pj-frase > span').map((s) => s.className)
const falar = () => fireEvent.click(q('[data-pj="falar"]')!)
const pular = () => fireEvent.click(q('[data-pj="pular"]')!)
const feito = () => relatorio as RoundReport | null

describe('a cena do Karaokê', () => {
  it('tem a instrução e as peças do protótipo, na ordem', () => {
    montar()
    expect(q('.pj-instr')?.textContent).toBe('Ouça a fala, repita em voz alta e receba a nota, palavra por palavra.')
    expect([...q('.pj-miolo')!.children].map((e) => `${e.tagName.toLowerCase()}.${e.className}`)).toEqual([
      'p.pj-frase',
      'p.mut',
      'div.pj-acoes',
      'div.pj-nota',
      'button.btn btn-outline peq',
    ])
    expect(qq('.pj-frase > span').map((s) => s.textContent)).toEqual(['We', 'ship', 'the', 'order', 'today'])
    expect(q('.pj-miolo > p.mut')?.textContent).toBe('Enviamos o pedido hoje')
    expect(qq('.pj-acoes > button').map((b) => [b.className, b.dataset.pj, b.textContent?.trim()])).toEqual([
      ['btn btn-outline', 'ouvir', 'Ouvir'],
      ['btn btn-outline', 'devagar', 'devagar'],
      ['btn btn-solid', 'falar', 'Falar agora'],
    ])
    expect(q('[data-pj="devagar"]')?.getAttribute('title')).toBe(
      'Toca a mesma fala mais devagar, sem mudar o tom da voz',
    )
    expect(q('.pj-nota')?.getAttribute('role')).toBe('status')
    expect(q('.pj-nota')?.childElementCount).toBe(0)
    expect(q('[data-pj="pular"]')?.textContent?.trim()).toBe('Próxima')
    expect(q('[data-pj="rotulo"]')?.textContent).toBe('0 de 2 falas')
    // Sem níveis e sem ajudas (jogos4.js:194).
    expect(qq('.hud-ajudas .ajuda-jogo')).toHaveLength(0)
  })
})

describe('falar e receber a nota de verdade', () => {
  it('"Falar agora" mostra "ouvindo você…" com as sete barras', () => {
    montar()
    falar()
    expect(q('.pj-nota > .pj-ouvindo')?.textContent?.trim()).toBe('ouvindo você…')
    expect(qq('.pj-ouvindo > .pj-eq > i').map((b) => b.style.getPropertyValue('--i'))).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ])
  })

  it('a nota sai do que o microfone ouviu; as palavras são pintadas uma a cada 90 ms', () => {
    montar()
    falar()
    ouvir('we ship the order today')
    expect(q('.pj-nota > .pj-pct')?.textContent).toBe('100%')
    expect(q<HTMLElement>('.pj-pct')?.style.color).toBe('var(--good)')
    expect(q('.pj-nota > p')?.textContent).toBe('5 de 5 palavras')
    expect(q('.pj-nota > small')?.textContent).toBe('o que entendemos: “we ship the order today”')
    const certas = () => classes().filter((c) => c === 'certa').length
    expect(certas()).toBeLessThan(5)
    esperar(90 * 5)
    expect(classes()).toEqual(['certa', 'certa', 'certa', 'certa', 'certa'])
    expect(q('[data-pj="rotulo"]')?.textContent).toBe('1 de 2 falas')
  })

  it('a palavra que escapou fica marcada e é dita na nota', () => {
    montar()
    falar()
    ouvir('we ship the order tomorrow')
    esperar(90 * 5)
    expect(classes()).toEqual(['certa', 'certa', 'certa', 'certa', 'escapou'])
    expect(q('.pj-nota > p')?.textContent).toBe('4 de 5 palavras · escapou: today')
  })

  it('dá para regravar: a fala continua uma só no relatório, com as tentativas somadas', () => {
    montar()
    falar()
    ouvir('nothing like it')
    falar()
    ouvir('we ship the order today')
    pular()
    expect(q('[data-pj="pular"]')?.textContent?.trim()).toBe('Terminar')
    expect(qq('.pj-frase > span').map((s) => s.textContent)).toEqual(['Good', 'morning'])
    expect(q('.pj-nota')?.childElementCount).toBe(0)
    pular()
    esperar(899)
    expect(feito()).toBeNull()
    esperar(1)
    expect(feito()?.gameId).toBe('karaoke')
    expect(feito()?.items).toHaveLength(2)
    expect(feito()?.items[0]).toMatchObject({ itemRef: 'k1', correct: true, attempts: 2 })
    // Seguir sem falar conta como erro (jogos2.js:618), registrado como desistência.
    expect(feito()?.items[1]).toMatchObject({ itemRef: 'k2', correct: false, revealed: true })
  })
})

describe('sem reconhecimento de fala', () => {
  it('o botão de falar não aparece e a tela diz por quê; ouvir e seguir continuam', () => {
    delete global.webkitSpeechRecognition
    montar()
    expect(q('[data-pj="falar"]')).toBeNull()
    expect(q('.pj-nota > small')?.textContent).toMatch(/não tem reconhecimento de voz/)
    expect(q('[data-pj="ouvir"]')).not.toBeNull()
    expect(q('[data-pj="pular"]')).not.toBeNull()
  })
})
