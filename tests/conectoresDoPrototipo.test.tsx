// @vitest-environment jsdom
/**
 * O CAÇA-CONECTORES DO PROTÓTIPO (`src/components/minigames/ConectoresDoPrototipo.tsx`), porte de
 * `jogos2.js:766-814`: a frase com um botão por palavra, a tradução, "Conferir", a nota e os níveis.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RodadaConectores, RoundReport } from '../src/core'

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

const { default: ConectoresDoPrototipo } = await import('../src/components/minigames/ConectoresDoPrototipo')

const fala = (id: string, text: string, translation: string) => ({
  id,
  text,
  lang: 'en',
  startMs: 0,
  endMs: 0,
  translation,
})
const rodadas = (): RodadaConectores[] => [
  {
    fala: fala('c1', 'She stayed home because it rained so we read', 'Ela ficou em casa'),
    tokens: ['She', 'stayed', 'home', 'because', 'it', 'rained', 'so', 'we', 'read'],
    alvos: [3, 6],
  },
  {
    fala: fala('c2', 'We wanted to ship but it failed', 'Queríamos enviar'),
    tokens: ['We', 'wanted', 'to', 'ship', 'but', 'it', 'failed'],
    alvos: [4],
  },
]

const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const q = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T | null
const qq = (s: string) => [...document.querySelectorAll<HTMLElement>(s)]
const nivel = (n: 'facil' | 'medio' | 'dificil') => localStorage.setItem('babel.nivel.conectores', n)

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  localStorage.setItem('babel.desenhoNovo', 'sim')
  vi.useFakeTimers({ shouldAdvanceTime: false })
})
afterEach(() => {
  cleanup()
  document.querySelectorAll('.ganho, .fx-vinheta').forEach((x) => x.remove())
  vi.useRealTimers()
  vi.clearAllMocks()
})

const montar = () =>
  render(
    <section className="palco-jogo">
      <ConectoresDoPrototipo rodadas={rodadas()} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />
    </section>,
  )
const palavra = (w: string) => q<HTMLButtonElement>(`.pj-conect [data-w="${w}"]`)!
const marcar = (...ws: string[]) => ws.forEach((w) => fireEvent.click(palavra(w)))
const conferir = () => fireEvent.click(q('[data-pj="conferir"]')!)
const feito = () => relatorio as RoundReport | null

describe('a cena do Caça-conectores', () => {
  it('tem a instrução e as peças do protótipo, na ordem', () => {
    montar()
    expect(q('.pj-instr')?.textContent).toBe('Marque as palavras que amarram as ideias, as que mudam o rumo da frase.')
    expect([...q('.pj-miolo')!.children].map((e) => `${e.tagName.toLowerCase()}.${e.className}`)).toEqual([
      'p.pj-conect',
      'p.mut',
      'div.pj-acoes',
      'div.pj-nota',
    ])
    const botoes = qq('.pj-conect > button')
    expect(botoes.map((b) => b.textContent)).toEqual([
      'She',
      'stayed',
      'home',
      'because',
      'it',
      'rained',
      'so',
      'we',
      'read',
    ])
    expect(botoes.every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(botoes[0].dataset.w).toBe('she')
    expect(q('.pj-miolo > p.mut')?.textContent).toBe('Ela ficou em casa')
    expect(q('.pj-acoes > .btn.btn-solid[data-pj="conferir"]')?.textContent?.trim()).toBe('Conferir')
    expect(q('.pj-nota')?.getAttribute('role')).toBe('status')
    expect(q('.pj-nota')?.childElementCount).toBe(0)
    expect(q('.pj-miolo > .label-mono')).toBeNull()
    expect(q('[data-pj="rotulo"]')?.textContent).toBe('0 de 2 frases')
    expect(qq('.hud-ajudas .ajuda-jogo').map((b) => b.dataset.ajuda)).toEqual(['resposta'])
  })
})

describe('a jogada do Caça-conectores', () => {
  it('marcar e desmarcar à vontade antes de conferir', () => {
    montar()
    marcar('because')
    expect(palavra('because').getAttribute('aria-pressed')).toBe('true')
    marcar('because')
    expect(palavra('because').getAttribute('aria-pressed')).toBe('false')
  })

  it('conferir certo: os alvos ficam verdes, o botão some, sai a nota, e a próxima frase vem em 1500 ms', () => {
    montar()
    marcar('because', 'so')
    conferir()
    expect(palavra('because').className).toBe('alvo-ok')
    expect(palavra('so').className).toBe('alvo-ok')
    expect(qq('.pj-conect button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    expect(qq('.pj-conect button').every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(q<HTMLElement>('[data-pj="conferir"]')?.hidden).toBe(true)
    expect(q('.pj-nota > p')?.textContent).toBe('100 pontos de precisão')
    expect(q('.pj-nota > small')?.textContent).toBe('2 certos')
    esperar(1499)
    expect(q('.pj-conect button')?.textContent).toBe('She')
    esperar(1)
    expect(q('.pj-conect button')?.textContent).toBe('We')
    expect(q('.pj-nota')?.childElementCount).toBe(0)
    expect(q<HTMLElement>('[data-pj="conferir"]')?.hidden).toBe(false)
    expect(q('[data-pj="rotulo"]')?.textContent).toBe('1 de 2 frases')
  })

  it('conferir errado: à toa, passou batido, "Revise os conectores" e 2800 ms', () => {
    montar()
    marcar('because', 'home')
    conferir()
    expect(palavra('because').className).toBe('alvo-ok')
    expect(palavra('so').className).toBe('alvo-perdido')
    expect(palavra('home').className).toBe('a-toa')
    // F1 = 200c / (2c + f + p) = 200 / 4.
    expect(q('.pj-nota > p')?.textContent).toBe('50 pontos de precisão')
    expect(q('.pj-nota > small')?.textContent).toBe('1 certo · 1 marcado à toa · 1 passou batido')
    expect(q('.ganho.erro')?.textContent).toBe('Revise os conectores')
    esperar(2799)
    expect(q('.pj-conect button')?.textContent).toBe('She')
    esperar(1)
    marcar('but')
    conferir()
    esperar(1500 + 899)
    expect(feito()).toBeNull()
    esperar(1)
    expect(feito()?.gameId).toBe('conectores')
    expect(feito()?.items.map((o) => [o.itemRef, o.correct])).toEqual([
      ['c1', false],
      ['c2', true],
    ])
  })

  it('"Ver resposta" mostra os conectores da frase', () => {
    montar()
    fireEvent.click(q('[data-ajuda="resposta"]')!)
    expect(q('.palco-jogo > .pj-resp')?.textContent).toBe('Resposta: because, so')
  })
})

describe('os níveis do Caça-conectores', () => {
  it('Fácil: a tela diz quantos conectores procurar, e 60 pontos bastam', () => {
    nivel('facil')
    montar()
    expect(q('.pj-miolo > .label-mono')?.textContent).toBe('2 conectores nesta frase')
    // Um certo, um passou batido: 200 / 3 = 67.
    marcar('because')
    conferir()
    expect(q('.pj-nota > p')?.textContent).toBe('67 pontos de precisão')
    expect(q('.ganho.erro')).toBeNull()
    esperar(1500)
    expect(q('.pj-miolo > .label-mono')?.textContent).toBe('1 conector nesta frase')
  })

  it('Médio: 67 pontos não passam (o limiar é 70)', () => {
    montar()
    marcar('because')
    conferir()
    expect(q('.pj-nota > p')?.textContent).toBe('67 pontos de precisão')
    expect(q('.ganho.erro')).not.toBeNull()
  })

  it('Médio passa com 80; Difícil também, e não com 67', () => {
    // Dois certos e um à toa: 400 / 5 = 80.
    montar()
    marcar('because', 'so', 'home')
    conferir()
    expect(q('.pj-nota > p')?.textContent).toBe('80 pontos de precisão')
    expect(q('.ganho.erro')).toBeNull()
    cleanup()
    nivel('dificil')
    montar()
    marcar('because', 'so', 'home')
    conferir()
    expect(q('.ganho.erro')).toBeNull()
    cleanup()
    document.querySelectorAll('.ganho').forEach((x) => x.remove())
    montar()
    marcar('because')
    conferir()
    expect(q('.ganho.erro')?.textContent).toBe('Revise os conectores')
  })
})
