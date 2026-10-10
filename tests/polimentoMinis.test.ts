// @vitest-environment jsdom
/**
 * AS MINIATURAS DOS JOGOS SÓ ANIMAM À VISTA (`src/lib/polimento/minis.ts`; auditoria de desempenho de
 * 10/10/2026, G3). O cartão que sai da vista ganha `px-fora-da-vista` (o CSS pausa as animações da
 * miniatura dele); o que volta perde a marca e cada animação é posta no instante em que estaria se nunca
 * tivesse parado. O que está à vista não muda.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { instalarMinis } from '../src/lib/polimento/minis'

interface Vigia {
  ver: (alvo: Element, aVista: boolean) => void
  alvos: Set<Element>
  opcoes: IntersectionObserverInit | undefined
}
let vigias: Vigia[] = []

/** O `IntersectionObserver` de mentira: o teste diz quem entrou e quem saiu da vista. */
class ObservadorFalso {
  alvos = new Set<Element>()
  constructor(
    aoVer: (entradas: Array<{ target: Element; isIntersecting: boolean }>) => void,
    opcoes?: IntersectionObserverInit,
  ) {
    vigias.push({
      ver: (alvo, aVista) => aoVer([{ target: alvo, isIntersecting: aVista }]),
      alvos: this.alvos,
      opcoes,
    })
  }
  observe(el: Element) {
    this.alvos.add(el)
  }
  unobserve(el: Element) {
    this.alvos.delete(el)
  }
  disconnect() {
    this.alvos.clear()
  }
}

const CARTAO = (i: number) =>
  `<button class="q-tile px-com-mini" id="c${i}"><div class="px-mini"><i class="mm-l" id="p${i}"></i></div></button>`
const CARTOES = (n: number, de = 0) => Array.from({ length: n }, (_, i) => CARTAO(de + i)).join('')

const vez = () => new Promise<void>((r) => setTimeout(r, 0))
let desligar: (() => void) | undefined
let agora = 0

beforeEach(() => {
  vigias = []
  agora = 50_000
  ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = ObservadorFalso
  Object.defineProperty(document, 'timeline', { configurable: true, value: { get currentTime() { return agora } } })
  document.body.innerHTML = `<main><div class="q-grade">${CARTOES(3)}</div><button class="q-tile" id="sem-mini"></button></main>`
})
afterEach(() => {
  desligar?.()
  desligar = undefined
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver
  delete (document as unknown as Record<string, unknown>).timeline
  document.body.innerHTML = ''
})

const cartao = (i: number) => document.getElementById(`c${i}`)!

describe('a pausa das miniaturas fora da vista', () => {
  it('vigia só os cartões com miniatura, com folga em volta da janela, inclusive os que montam depois', async () => {
    desligar = instalarMinis()
    expect(vigias).toHaveLength(1)
    expect([...vigias[0].alvos].map((e) => e.id)).toEqual(['c0', 'c1', 'c2'])
    expect(vigias[0].opcoes?.rootMargin).toBe('160px')
    const novos = document.createElement('div')
    novos.innerHTML = CARTOES(2, 3)
    document.querySelector('.q-grade')!.append(novos)
    await vez()
    expect([...vigias[0].alvos].map((e) => e.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4'])
  })

  it('o cartão que sai da vista é marcado; o que está à vista, não; o que volta perde a marca', () => {
    desligar = instalarMinis()
    vigias[0].ver(cartao(0), true)
    vigias[0].ver(cartao(2), false)
    expect(cartao(0).classList.contains('px-fora-da-vista')).toBe(false)
    expect(cartao(1).classList.contains('px-fora-da-vista')).toBe(false)
    expect(cartao(2).classList.contains('px-fora-da-vista')).toBe(true)
    vigias[0].ver(cartao(2), true)
    expect(cartao(2).classList.contains('px-fora-da-vista')).toBe(false)
  })

  it('ao voltar, a animação está no instante em que estaria sem a pausa', () => {
    desligar = instalarMinis()
    const peca = document.getElementById('p2')!
    /* Rodando desde t = 48 000 da linha do tempo; a do cartão em si (a entrada) não é da miniatura. */
    const daMini = {
      animationName: 'mm-pop',
      playState: 'running',
      startTime: 48_000 as number | null,
      currentTime: 2_000,
      effect: { target: peca },
    }
    const doCartao = { startTime: 49_000, currentTime: 1_000, effect: { target: cartao(2) } }
    const pedir = vi.fn(() => [daMini, doCartao] as unknown as Animation[])
    cartao(2).getAnimations = pedir
    vigias[0].ver(cartao(2), false)
    /* Sair da vista só anota a hora e põe a marca: não pede as animações ao navegador (eram 132 a 142 ms
       ao entrar no Jogar, com 14 cartões saindo de uma vez). */
    expect(pedir).not.toHaveBeenCalled()
    /* Pausada: o navegador segura o instante e esquece o começo. Ficou 11,5 s fora da vista. */
    daMini.startTime = null
    agora = 61_500
    vigias[0].ver(cartao(2), true)
    expect(pedir).toHaveBeenCalledTimes(1)
    expect(daMini.currentTime).toBe(2_000 + 11_500)
    expect(doCartao.currentTime).toBe(1_000)
  })

  it('o cartão que nasce fora da vista (pausado antes do primeiro quadro) também volta no passo certo', () => {
    desligar = instalarMinis()
    /* Ainda sem começo na linha do tempo: o navegador não chegou a rodar o primeiro quadro dela. */
    const nova = {
      animationName: 'mm-pop',
      playState: 'running',
      startTime: null,
      currentTime: 0,
      effect: { target: document.getElementById('p2')! },
    }
    cartao(2).getAnimations = () => [nova] as unknown as Animation[]
    vigias[0].ver(cartao(2), false)
    agora = 57_250
    vigias[0].ver(cartao(2), true)
    expect(nova.currentTime).toBe(7_250)
  })

  it('animação que já estava parada (aparelho com mouse, sem o ponteiro em cima) fica como está', () => {
    desligar = instalarMinis()
    const parada = {
      animationName: 'mm-pop',
      playState: 'paused',
      startTime: null,
      currentTime: 700,
      effect: { target: document.getElementById('p1')! },
    }
    cartao(1).getAnimations = () => [parada] as unknown as Animation[]
    vigias[0].ver(cartao(1), false)
    agora = 90_000
    vigias[0].ver(cartao(1), true)
    expect(parada.currentTime).toBe(700)
  })

  it('o cartão que saiu do documento deixa de ser vigiado; desligar tira as marcas', () => {
    desligar = instalarMinis()
    vigias[0].ver(cartao(1), false)
    const fora = cartao(2)
    fora.remove()
    vigias[0].ver(fora, false)
    expect(vigias[0].alvos.has(fora)).toBe(false)
    desligar()
    desligar = undefined
    expect(document.querySelector('.px-fora-da-vista')).toBeNull()
  })
})

describe('o CSS da pausa', () => {
  const css = readFileSync(join(__dirname, '../src/styles/polimentoDesempenho.css'), 'utf8')

  it('pausa as peças da miniatura e os `::before`/`::after` delas, só no cartão marcado', () => {
    const regra = /\.q-tile\.px-fora-da-vista \.px-mini \*,\s*\.q-tile\.px-fora-da-vista \.px-mini \*::before,\s*\.q-tile\.px-fora-da-vista \.px-mini \*::after\s*\{([^}]*)\}/.exec(css)
    expect(regra).not.toBeNull()
    expect(regra![1].trim()).toBe('animation-play-state: paused !important;')
  })

  it('entra na camada por último, depois das folhas copiadas do protótipo', () => {
    const estilos = readFileSync(join(__dirname, '../src/lib/polimento/estilos.ts'), 'utf8')
    const imports = [...estilos.matchAll(/^import '([^']+)';/gm)].map((m) => m[1])
    expect(imports.at(-1)).toBe('../../styles/polimentoDesempenho.css')
  })
})
