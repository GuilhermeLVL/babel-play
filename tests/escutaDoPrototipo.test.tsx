// @vitest-environment jsdom
/**
 * A ESCUTA DO PROTÓTIPO (`src/components/minigames/EscutaDoPrototipo.tsx`), porte de `jogos2.js:647-689`:
 * o botão grande de ouvir, "devagar", a lista de falas, a tradução depois da resposta e os níveis.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RodadaEscuta, RoundReport } from '../src/core'

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

const { default: EscutaDoPrototipo } = await import('../src/components/minigames/EscutaDoPrototipo')

const fala = (id: string, text: string, translation?: string) => ({
  id,
  text,
  lang: 'en',
  startMs: 0,
  endMs: 0,
  ...(translation ? { translation } : {}),
})
function rodadas(): RodadaEscuta[] {
  const a = fala('a', 'We ship the order today', 'Enviamos o pedido hoje')
  const b = fala('b', 'The storm hit the coast', 'A tempestade atingiu a costa')
  return [
    {
      correta: a,
      opcoes: [
        fala('a2', 'We shape the order today'),
        a,
        fala('a3', 'We chip the order today'),
        fala('a4', 'We shop the order today'),
      ],
    },
    {
      correta: b,
      opcoes: [
        b,
        fala('b2', 'The storm hit the cost'),
        fala('b3', 'The store hit the coast'),
        fala('b4', 'The storm hid the coast'),
      ],
    },
  ]
}

const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const q = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T | null
const qq = (s: string) => [...document.querySelectorAll<HTMLElement>(s)]
const nivel = (n: 'facil' | 'medio' | 'dificil') => localStorage.setItem('babel.nivel.escuta', n)

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
      <EscutaDoPrototipo rodadas={rodadas()} audioUrl="" onFinish={(r) => (relatorio = r)} onExit={() => undefined} />
    </section>,
  )
const opcao = (texto: string) => q<HTMLButtonElement>(`.pj-lista [data-op="${texto}"]`)!
const feito = () => relatorio as RoundReport | null

describe('a cena da Escuta', () => {
  it('tem a instrução, o botão grande, "devagar", a lista e o aviso vazio, na ordem do protótipo', () => {
    montar()
    expect(q('.pj-instr')?.textContent).toBe(
      'Ouça quantas vezes quiser, isso não tira ponto. Depois escolha o que foi dito.',
    )
    expect([...q('.pj-miolo')!.children].map((e) => e.className)).toEqual(['pj-acoes', 'pj-lista', 'mut pj-aviso'])
    expect(q('.pj-acoes > .btn.btn-solid.pj-grande[data-pj="ouvir"]')?.textContent?.trim()).toBe('Ouvir de novo')
    expect(q('.pj-acoes > .btn.btn-outline[data-pj="devagar"]')?.textContent?.trim()).toBe('devagar')
    expect(qq('.pj-lista > button').map((b) => b.textContent)).toEqual([
      'We shape the order today',
      'We ship the order today',
      'We chip the order today',
      'We shop the order today',
    ])
    expect(q('.pj-aviso')?.textContent).toBe('')
    expect(q('[data-pj="rotulo"]')?.textContent).toBe('0 de 2 falas')
    expect(qq('.hud-ajudas .ajuda-jogo').map((b) => b.dataset.ajuda)).toEqual(['resposta'])
  })
})

describe('a jogada da Escuta', () => {
  it('acerto: a certa fica verde, a tradução aparece, e a próxima fala vem em 1000 ms', () => {
    montar()
    fireEvent.click(opcao('We ship the order today'))
    expect(opcao('We ship the order today').className).toBe('certa')
    expect(qq('.pj-lista button').every((b) => (b as HTMLButtonElement).disabled)).toBe(true)
    expect(q('.pj-aviso')?.textContent).toBe('Enviamos o pedido hoje')
    esperar(999)
    expect(q('.pj-lista button')?.textContent).toBe('We shape the order today')
    esperar(1)
    expect(q('.pj-lista button')?.textContent).toBe('The storm hit the coast')
    expect(q('.pj-aviso')?.textContent).toBe('')
    expect(q('[data-pj="rotulo"]')?.textContent).toBe('1 de 2 falas')
  })

  it('erro: a escolhida fica vermelha, a certa aparece, sobe "Ouça novamente" e a próxima vem em 2200 ms', () => {
    montar()
    fireEvent.click(opcao('We chip the order today'))
    expect(opcao('We chip the order today').className).toBe('errada')
    expect(opcao('We ship the order today').className).toBe('certa')
    expect(q('.ganho.erro')?.textContent).toBe('Ouça novamente')
    esperar(2199)
    expect(q('.pj-lista button')?.textContent).toBe('We shape the order today')
    esperar(1)
    fireEvent.click(opcao('The storm hit the coast'))
    esperar(1000 + 900)
    expect(feito()?.gameId).toBe('escuta')
    expect(feito()?.items.map((o) => [o.itemRef, o.correct])).toEqual([
      ['a', false],
      ['b', true],
    ])
  })

  it('o relatório só sai 900 ms depois da última jogada', () => {
    montar()
    fireEvent.click(opcao('We ship the order today'))
    esperar(1000)
    fireEvent.click(opcao('The storm hit the coast'))
    esperar(1000 + 899)
    expect(feito()).toBeNull()
    esperar(1)
    expect(feito()?.items).toHaveLength(2)
  })

  it('"Ver resposta" mostra a fala certa e o acerto seguinte conta como com dica', () => {
    montar()
    fireEvent.click(q('[data-ajuda="resposta"]')!)
    expect(q('.palco-jogo > .pj-resp')?.textContent).toBe('Resposta: We ship the order today')
    fireEvent.click(opcao('We ship the order today'))
    esperar(1000)
    fireEvent.click(opcao('The storm hit the coast'))
    esperar(1000 + 900)
    expect(feito()?.items.map((o) => !!o.hinted)).toEqual([true, false])
  })
})

describe('os níveis da Escuta', () => {
  it('Fácil: três alternativas, e a certa está entre elas', () => {
    nivel('facil')
    montar()
    const ops = qq('.pj-lista > button').map((b) => b.textContent)
    expect(ops).toHaveLength(3)
    expect(ops).toContain('We ship the order today')
    expect(q('[data-pj="devagar"]')).not.toBeNull()
  })

  it('Difícil: quatro alternativas e sem o botão de ouvir devagar', () => {
    nivel('dificil')
    montar()
    expect(qq('.pj-lista > button')).toHaveLength(4)
    expect(q('[data-pj="devagar"]')).toBeNull()
    expect(q('[data-pj="ouvir"]')).not.toBeNull()
  })
})
