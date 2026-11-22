// @vitest-environment jsdom
/**
 * PARES MÍNIMOS (`src/components/minigames/ParesMinimos.tsx`): ouvir (normal e devagar), duas opções grandes
 * com as teclas 1/2, o feedback com os dois sons (texto além da cor), o resumo dos contrastes errados e o
 * relatório da rodada (sem relógio).
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameItem, RoundReport } from '../src/core'
import { palavraTocada, sortearRodada } from '../src/core'

const falas: { texto: string; idioma: string; rate?: number }[] = []

vi.mock('../src/components/minigames/noQuest', async (original) => {
  const m = await original<typeof import('../src/components/minigames/noQuest')>()
  return {
    ...m,
    useVozNoJogo: () => (globalThis as { __haVoz?: boolean }).__haVoz !== false,
    falarNoJogo: (texto: string, idioma: string, opts: { rate?: number } = {}) => {
      falas.push({ texto, idioma, rate: opts.rate })
      return true
    },
  }
})
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

const { ParesMinimos } = await import('../src/components/minigames/ParesMinimos')

const rodada = sortearRodada('en', { quantidade: 5, semente: 'componente' })
const itens = (): MinigameItem[] =>
  rodada.map((x) => ({ itemRef: x.id, prompt: '', answer: palavraTocada(x), lang: 'en', par: x }))

const q = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T | null
const qq = (s: string) => [...document.querySelectorAll<HTMLElement>(s)]

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  falas.length = 0
  localStorage.clear()
  localStorage.setItem('babel.desenhoNovo', 'sim')
  ;(globalThis as { __haVoz?: boolean }).__haVoz = true
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const montar = (lista = itens()) =>
  render(
    <section className="palco-jogo">
      <ParesMinimos items={lista} ageProfile="pro" onFinish={(r) => (relatorio = r)} onExit={() => undefined} />
    </section>,
  )
const opcoes = () => qq('.pm-opcao')
const clicar = (el: HTMLElement) => act(() => void fireEvent.click(el))
const proximo = () => q<HTMLButtonElement>('[data-pj="proxima"]')!

/** Escolhe a posição certa (ou a errada) da pergunta `i`. */
const responder = (i: number, certo: boolean) => {
  const k = certo ? rodada[i].tocada : rodada[i].tocada === 0 ? 1 : 0
  clicar(opcoes()[k])
}

describe('ParesMinimos', () => {
  it('mostra duas opções grandes, com a tecla de cada uma, e botões de ouvir normal e devagar', () => {
    montar()
    expect(opcoes()).toHaveLength(2)
    expect(opcoes().map((o) => o.querySelector('.pm-tecla')?.textContent)).toEqual(['1', '2'])
    expect(opcoes().map((o) => o.dataset.op)).toEqual(rodada[0].opcoes.map((o) => o.palavra))
    expect(q('[data-pj="ouvir"]')).toBeTruthy()
    expect(q('[data-pj="devagar"]')).toBeTruthy()
  })

  it('Ouvir fala a palavra tocada no idioma; Ouvir devagar usa velocidade menor', () => {
    montar()
    clicar(q('[data-pj="ouvir"]')!)
    clicar(q('[data-pj="devagar"]')!)
    expect(falas[0]).toMatchObject({ texto: palavraTocada(rodada[0]), idioma: 'en', rate: undefined })
    expect(falas[1].texto).toBe(palavraTocada(rodada[0]))
    expect(falas[1].rate).toBeLessThan(1)
  })

  it('as teclas 1 e 2 escolhem pela posição', () => {
    montar()
    act(() => void fireEvent.keyDown(window, { key: String(rodada[0].tocada + 1) }))
    expect(q('.pm-resultado')?.textContent).toContain('Acertou!')
  })

  it('o feedback mostra os dois sons e o contraste, com texto além da cor', () => {
    montar()
    responder(0, false)
    const [e, d] = opcoes()
    const doPar = rodada[0]
    expect(e.textContent).toContain(`/${doPar.opcoes[0].som}/`)
    expect(d.textContent).toContain(`/${doPar.opcoes[1].som}/`)
    expect(opcoes()[doPar.tocada].textContent).toContain('Tocou')
    expect(opcoes()[doPar.tocada === 0 ? 1 : 0].textContent).toContain('Sua escolha')
    expect(q('.pm-contraste')?.textContent).toContain(doPar.contraste)
    expect(q('.pm-resultado')?.textContent).toContain('Não foi essa.')
    /* Dá para ouvir as duas palavras. */
    const ouvirDoFeedback = qq('[data-pj="ouvir-opcao"]')
    expect(ouvirDoFeedback).toHaveLength(2)
    clicar(ouvirDoFeedback[1])
    expect(falas.at(-1)?.texto).toBe(doPar.opcoes[1].palavra)
    /* Depois de responder, as opções travam. */
    expect(opcoes().every((o) => (o as HTMLButtonElement).disabled)).toBe(true)
  })

  it('termina com o resumo dos contrastes errados e relata a rodada sem tempo no placar', () => {
    montar()
    const certas = [true, false, true, false, true]
    certas.forEach((c, i) => {
      responder(i, c)
      clicar(proximo())
    })
    const resumo = q('.pm-resumo')!
    expect(resumo).toBeTruthy()
    const esperado = rodada.filter((_, i) => !certas[i]).map((x) => x.contraste)
    for (const c of esperado) {
      const [a, b] = c.split(' × ')
      expect(document.body.textContent).toContain(`Seu ouvido confunde ${a} e ${b}`)
    }
    expect(document.body.textContent).toContain('Você acertou 3 de 5.')
    clicar(proximo())
    expect(relatorio?.gameId).toBe('paresMinimos')
    expect(relatorio?.items.map((o) => o.correct)).toEqual(certas)
    expect(relatorio?.items.every((o) => o.itemRef && o.attempts === 1 && !o.hinted && !o.revealed)).toBe(true)
  })

  it('sem erros, o resumo diz que o ouvido separou tudo', () => {
    montar()
    rodada.forEach((_, i) => {
      responder(i, true)
      clicar(proximo())
    })
    expect(q('.pm-resumo')).toBeNull()
    expect(document.body.textContent).toContain('Seu ouvido separou todos os sons desta rodada.')
  })

  it('sem voz no aparelho, os botões de ouvir somem e o aviso aparece', () => {
    ;(globalThis as { __haVoz?: boolean }).__haVoz = false
    montar()
    expect(q('[data-pj="ouvir"]')).toBeNull()
    expect(q('.qj-sem-voz')).toBeTruthy()
  })

  it('sem pares, mostra a tela amigável', () => {
    montar([])
    expect(q('.ef-vazio')?.textContent).toContain('Ainda não há pares de sons')
  })
})
