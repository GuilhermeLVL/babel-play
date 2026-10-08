// @vitest-environment jsdom
/**
 * A TROCA DE TELA DA CAMADA DE POLIMENTO (`src/lib/polimento/telas.ts`), porte de
 * `prototipo.js:154-380`. Os números aqui são os do protótipo: se um mudar, o teste acusa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EG, EIO, EO, MOLA, mola, MOLA_SUAVE } from '../src/lib/polimento/base'
import { instalarTelas, trocarDeTela } from '../src/lib/polimento/telas'

interface Chamada {
  el: Element
  quadros: Keyframe[]
  o: KeyframeAnimationOptions
}
let chamadas: Chamada[] = []
let terminar: Array<() => void> = []
let desinstalar: (() => void) | undefined

const quadro = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

beforeEach(() => {
  chamadas = []
  terminar = []
  Element.prototype.animate = function (this: Element, quadros: Keyframe[], o: KeyframeAnimationOptions) {
    chamadas.push({ el: this, quadros, o })
    let fim: () => void = () => undefined
    const finished = new Promise<void>((r) => (fim = r))
    terminar.push(fim)
    return { finished, cancel: () => undefined } as unknown as Animation
  } as never
  Element.prototype.getAnimations = () => []
  ;(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as { CSS?: unknown }).CSS ??= { escape: (s: string) => s, supports: () => true }
  document.documentElement.dataset.px = 'on'
  document.body.className = 'animations-on'
  document.body.innerHTML = `
    <nav class="q-trilho">
      <button class="q-item" data-px-rota="hub" aria-current="page"><svg></svg></button>
      <button class="q-item" data-px-rota="play"><svg></svg></button>
      <button class="q-item q-mais-botao"><svg></svg></button>
    </nav>
    <main><div class="px-tela"><div class="q-palco"><div class="q-cab"><p class="q-sobre">Bom dia</p><h1>O que vamos fazer?</h1></div></div></div></main>`
})
afterEach(() => {
  desinstalar?.()
  desinstalar = undefined
  delete document.documentElement.dataset.px
  vi.useRealTimers()
})

describe('as curvas são as do protótipo', () => {
  it('três curvas e duas molas de 45 pontos com 4 casas', () => {
    expect(EO).toBe('cubic-bezier(0.23, 1, 0.32, 1)')
    expect(EIO).toBe('cubic-bezier(0.77, 0, 0.175, 1)')
    expect(EG).toBe('cubic-bezier(0.32, 0.72, 0, 1)')
    expect(mola(0.5).startsWith('linear(0, 0.0441, 0.1563, 0.309, 0.4785,')).toBe(true)
    expect(mola(0.5).split(',')).toHaveLength(45)
    expect(mola(0.72).startsWith('linear(0, 0.0213, 0.0766, 0.1545,')).toBe(true)
    expect([MOLA, MOLA_SUAVE].every((m) => m.startsWith('linear(') || m.startsWith('cubic-bezier('))).toBe(true)
  })
})

describe('a saída da tela', () => {
  it('sai em 150 ms para o lado do destino, e só então troca', async () => {
    const trocar = vi.fn()
    trocarDeTela('play', 'hub', trocar)
    const saida = chamadas.find((c) => c.el.classList.contains('px-tela'))!
    expect(saida.o).toMatchObject({ duration: 150, easing: 'ease-out', fill: 'forwards' })
    expect(saida.quadros[0]).toEqual({ opacity: 0, transform: 'translateY(-18px) scale(0.985)', filter: 'blur(5px)' })
    expect(trocar).not.toHaveBeenCalled()
    // A pílula responde no toque: o trilho já marca o destino.
    expect(document.querySelector('.q-item[aria-current="page"]')?.getAttribute('data-px-rota')).toBe('play')
    terminar.forEach((f) => f())
    await Promise.resolve()
    await Promise.resolve()
    expect(trocar).toHaveBeenCalledOnce()
  })

  it('voltar para um destino de antes no menu sai para o outro lado', () => {
    document.querySelector('[data-px-rota="hub"]')?.removeAttribute('aria-current')
    trocarDeTela('hub', 'play', () => undefined)
    const saida = chamadas.find((c) => c.el.classList.contains('px-tela'))!
    expect(saida.quadros[0]).toMatchObject({ transform: 'translateY(18px) scale(0.985)' })
  })

  it('pelo teclado, e com a camada desligada, troca na hora', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    desinstalar = instalarTelas()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    const trocar = vi.fn()
    trocarDeTela('play', 'hub', trocar)
    expect(trocar).toHaveBeenCalledOnce()
    expect(chamadas.some((c) => c.el.classList.contains('px-tela'))).toBe(false)

    document.documentElement.dataset.px = 'off'
    const outra = vi.fn()
    trocarDeTela('hub', 'play', outra)
    expect(outra).toHaveBeenCalledOnce()
  })

  it('a troca não fica presa se a animação nunca terminar', () => {
    vi.useFakeTimers()
    const trocar = vi.fn()
    trocarDeTela('play', 'hub', trocar)
    vi.advanceTimersByTime(400)
    expect(trocar).toHaveBeenCalledOnce()
  })
})

describe('a entrada da tela e a pílula', () => {
  it('a tela nova entra: título palavra por palavra, sobrancelha e blocos em cascata', async () => {
    desinstalar = instalarTelas()
    await quadro()
    // Uma navegação por clique está no ar (é ela que diz o lado e que não veio do teclado).
    window.dispatchEvent(new Event('pointerdown'))
    trocarDeTela('play', 'hub', () => undefined)
    chamadas = []
    const tela = document.querySelector('.px-tela')!
    tela.innerHTML =
      '<div class="q-palco"><div class="q-cab"><p class="q-sobre">8 palavras</p><h1>Jogar agora</h1></div><section>a</section><section>b</section></div>'
    for (const s of tela.querySelectorAll('section'))
      Object.defineProperty(s, 'offsetParent', { get: () => tela, configurable: true })
    await quadro()
    await quadro()
    const palavras = chamadas.filter((c) => c.el.parentElement?.classList.contains('px-pal'))
    expect(palavras.map((c) => [c.o.duration, c.o.delay])).toEqual([
      [760, 60],
      [760, 135],
    ])
    expect(palavras[0].quadros[0]).toEqual({ transform: 'translateY(115%) rotate(7deg)' })
    const sobre = chamadas.find((c) => c.el.classList.contains('q-sobre'))!
    expect(sobre.o.duration).toBe(520)
    const blocos = chamadas.filter((c) => c.el.tagName === 'SECTION')
    expect(blocos.map((c) => [c.o.duration, c.o.delay])).toEqual([
      [700, 90],
      [700, 150],
    ])
    expect(blocos[0].quadros[0]).toEqual({ opacity: 0, transform: 'translateY(30px) scale(0.96)', filter: 'blur(8px)' })
  })

  it('o trilho e as abas ganham a pílula do protótipo', async () => {
    desinstalar = instalarTelas()
    await quadro()
    const pilula = document.querySelector('.q-trilho > .px-pilula')
    expect(pilula).not.toBeNull()
    expect(document.querySelector('.q-trilho')?.firstElementChild).toBe(pilula)
    expect(document.querySelector('.q-trilho')?.classList.contains('px-com-pilula')).toBe(true)
    desinstalar()
    desinstalar = undefined
    expect(document.querySelector('.px-pilula')).toBeNull()
  })
})
