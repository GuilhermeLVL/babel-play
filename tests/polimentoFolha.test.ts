// @vitest-environment jsdom
/**
 * O PAINEL "MAIS" DA CAMADA DE POLIMENTO (`src/lib/polimento/folha.ts`), porte de
 * `prototipo.js:383-557`: nasce do botão, a tela de trás recua, e sai pelo mesmo caminho mesmo depois
 * de o app já o ter tirado do documento.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { elastico, instalarFolhas } from '../src/lib/polimento/folha'

interface Chamada {
  el: Element
  quadros: Keyframe[]
  o: KeyframeAnimationOptions
}
let chamadas: Chamada[] = []
let terminar: Array<() => void> = []
let desinstalar: (() => void) | undefined
const vez = () => new Promise<void>((r) => setTimeout(r, 0))

const painelHtml = `<div class="q-mais-fundo"><div class="q-mais" role="dialog">
  <div class="q-cab"><h2>Mais</h2></div>
  <div class="q-grade"><button class="q-tile">Ajustes</button><button class="q-tile">Sobre</button></div>
</div></div>`

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
  document.documentElement.dataset.px = 'on'
  document.body.className = 'animations-on'
  document.body.innerHTML =
    '<div class="q-casca"><nav class="q-trilho"><button class="q-item q-mais-botao">Mais</button></nav><main><div class="px-tela"></div></main></div>'
  desinstalar = instalarFolhas()
})
afterEach(() => {
  desinstalar?.()
  delete document.documentElement.dataset.px
})

const abrir = async () => {
  document.querySelector('.q-mais-botao')!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  document.querySelector('.q-casca')!.insertAdjacentHTML('beforeend', painelHtml)
  await vez()
  return document.querySelector('.q-mais-fundo') as HTMLElement
}

describe('o painel Mais', () => {
  it('abre crescendo do botão, com o conteúdo em cascata, e a tela de trás recua', async () => {
    await abrir()
    const painel = chamadas.find((c) => c.el.classList.contains('q-mais'))!
    expect(painel.o.duration).toBe(640)
    expect(painel.quadros[0]).toEqual({ opacity: 0, transform: 'scale(0.55)', filter: 'blur(10px)' })
    expect(painel.quadros[1]).toEqual({ opacity: 1, offset: 0.35 })
    const cab = chamadas.find((c) => c.el.classList.contains('q-cab'))!
    expect([cab.o.duration, cab.o.delay]).toEqual([520, 120])
    const tiles = chamadas.filter((c) => c.el.classList.contains('q-tile'))
    expect(tiles.map((c) => [c.o.duration, c.o.delay])).toEqual([
      [620, 220],
      [620, 275],
    ])
    expect(document.querySelector('main')?.classList.contains('px-recuado')).toBe(true)
  })

  it('o app tira o painel; ele volta como fantasma, sai em 260 ms e some', async () => {
    const el = await abrir()
    chamadas = []
    el.remove()
    await vez()
    const fantasma = document.querySelector('.q-mais-fundo') as HTMLElement
    expect(fantasma).toBe(el)
    expect(fantasma.classList.contains('px-saindo')).toBe(true)
    expect(fantasma.hasAttribute('inert')).toBe(true)
    expect(document.querySelector('main')?.classList.contains('px-recuado')).toBe(false)
    const saida = chamadas.find((c) => c.el.classList.contains('q-mais'))!
    expect(saida.o).toMatchObject({ duration: 260, fill: 'forwards' })
    expect(saida.quadros).toEqual([{ opacity: 0, transform: 'scale(0.6)', filter: 'blur(8px)' }])
    terminar.forEach((f) => f())
    await vez()
    expect(document.querySelector('.q-mais-fundo')).toBeNull()
  })

  it('com a camada desligada o painel some na hora, sem fantasma', async () => {
    const el = await abrir()
    document.documentElement.dataset.px = 'off'
    el.remove()
    await vez()
    expect(document.querySelector('.q-mais-fundo')).toBeNull()
  })
})

describe('o elástico da borda', () => {
  it('é a conta do protótipo: quanto mais longe, menos acompanha', () => {
    expect(elastico(0)).toBe(0)
    expect(elastico(100)).toBeCloseTo((100 * 120 * 0.55) / (120 + 0.55 * 100), 6)
    expect(elastico(-40, 90)).toBeCloseTo((-40 * 90 * 0.55) / (90 + 0.55 * 40), 6)
  })
})
