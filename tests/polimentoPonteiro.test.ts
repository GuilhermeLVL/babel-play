// @vitest-environment jsdom
/**
 * OS LAÇOS DO PONTEIRO DORMEM (`src/lib/polimento/ponteiro.ts`; auditoria de desempenho de 10/10/2026,
 * G4 e G9). A aura e a inclinação 3D perseguem um alvo com uma fração do caminho por quadro (7% e 16%,
 * os números do protótipo). Antes pediam um quadro por vsync para sempre; o que este arquivo trava é que,
 * com a tela parada, NÃO HÁ `requestAnimationFrame` pendente, e que o próximo movimento acorda o laço.
 *
 * O relógio de quadros é de mentira: cada `rodar()` é um quadro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { instalarPonteiro, moverPonteiro } from '../src/lib/polimento/ponteiro'

let quadros: Array<() => void> = []
const rodar = () => {
  const fila = quadros
  quadros = []
  fila.forEach((f) => f())
}
/** Roda quadros até ninguém pedir mais nenhum; devolve quantos rodou. */
const rodarAteDormir = (teto = 3000) => {
  let n = 0
  while (quadros.length && n < teto) {
    rodar()
    n++
  }
  return n
}
const mover = (alvo: Element, x: number, y: number) =>
  alvo.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }))
const microtarefas = () => new Promise<void>((r) => setTimeout(r, 0))

let desligar: (() => void) | undefined
const main = () => document.querySelector<HTMLElement>('main')!
const aura = () => document.querySelector<HTMLElement>('.px-aura')
/** O ponto da aura na janela, lido do que foi escrito (o `main` do jsdom fica em 0,0). */
const pontoDaAura = () => {
  const m = /translate\((-?[\d.e-]+)px, (-?[\d.e-]+)px\)/.exec(aura()!.style.transform)!
  return [Number(m[1]) + 310, Number(m[2]) + 310]
}

beforeEach(() => {
  quadros = []
  vi.stubGlobal('requestAnimationFrame', (f: () => void) => quadros.push(f))
  vi.stubGlobal('cancelAnimationFrame', () => undefined)
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
  document.documentElement.dataset.px = 'on'
  document.body.className = 'animations-on'
  document.body.innerHTML = `<main><div class="px-tela"><div class="q-palco">
    <button class="q-tile" id="cartao">Jogar</button><p id="texto">texto</p></div></div></main>`
})
afterEach(() => {
  desligar?.()
  desligar = undefined
  delete document.documentElement.dataset.px
  document.body.className = ''
  vi.unstubAllGlobals()
})

describe('a aura que segue o ponteiro', () => {
  it('anda 7% do caminho por quadro, chega e dorme: zero quadro pendente com a tela parada', () => {
    desligar = instalarPonteiro()
    expect(quadros).toHaveLength(1)
    rodar()
    /* Nasce no meio da largura, a um terço da altura, e o ponteiro começa no meio da janela. */
    const [x, y] = pontoDaAura()
    expect(x).toBeCloseTo(innerWidth / 2, 6)
    expect(y).toBeCloseTo(innerHeight / 3 + (innerHeight / 2 - innerHeight / 3) * 0.07, 6)
    const rodou = rodarAteDormir()
    expect(quadros).toHaveLength(0)
    expect(rodou).toBeGreaterThan(20)
    expect(rodou).toBeLessThan(400)
    /* Parou a menos de 0,05 px do ponteiro. */
    expect(Math.abs(pontoDaAura()[1] - innerHeight / 2)).toBeLessThan(0.05)
    /* E parada continua: nenhum quadro nasce sozinho. */
    rodar()
    expect(quadros).toHaveLength(0)
  })

  it('o ponteiro que anda acorda o laço, uma vez só; parado de novo, ele volta a dormir', () => {
    desligar = instalarPonteiro()
    rodarAteDormir()
    mover(main(), 100, 80)
    mover(main(), 101, 80)
    mover(main(), 102, 80)
    expect(quadros).toHaveLength(1)
    rodar()
    const [x] = pontoDaAura()
    expect(x).toBeCloseTo(innerWidth / 2 + (102 - innerWidth / 2) * 0.07, 6)
    rodarAteDormir()
    expect(quadros).toHaveLength(0)
    expect(Math.abs(pontoDaAura()[0] - 102)).toBeLessThan(0.05)
    expect(Math.abs(pontoDaAura()[1] - 80)).toBeLessThan(0.05)
  })

  it('o giroscópio como ponteiro acorda a aura; o mesmo ponto de novo não acorda', () => {
    desligar = instalarPonteiro()
    rodarAteDormir()
    moverPonteiro(300, 200)
    expect(quadros).toHaveLength(1)
    rodarAteDormir()
    expect(quadros).toHaveLength(0)
    moverPonteiro(300, 200)
    expect(quadros).toHaveLength(0)
  })

  it('o canto do `main` é medido quando o laço acorda, não a cada quadro', () => {
    desligar = instalarPonteiro()
    const medida = vi.spyOn(main(), 'getBoundingClientRect')
    const rodou = rodarAteDormir()
    expect(rodou).toBeGreaterThan(20)
    expect(medida).toHaveBeenCalledTimes(1)
    mover(main(), 10, 10)
    rodarAteDormir()
    expect(medida).toHaveBeenCalledTimes(2)
  })

  it('com a camada desligada (Modo desempenho) o laço não roda; ao religar, a aura volta', async () => {
    document.documentElement.dataset.px = 'off'
    desligar = instalarPonteiro()
    expect(quadros).toHaveLength(0)
    mover(main(), 100, 80)
    mover(main(), 400, 300)
    expect(quadros).toHaveLength(0)
    expect(aura()).toBeNull()
    document.documentElement.dataset.px = 'on'
    await microtarefas()
    expect(quadros).toHaveLength(1)
    rodarAteDormir()
    expect(quadros).toHaveLength(0)
    expect(Math.abs(pontoDaAura()[0] - 400)).toBeLessThan(0.05)
  })

  it('desligar a camada com o laço no ar o faz parar no quadro seguinte', async () => {
    desligar = instalarPonteiro()
    rodar()
    expect(quadros).toHaveLength(1)
    document.documentElement.dataset.px = 'off'
    rodar()
    expect(quadros).toHaveLength(0)
  })

  it('desinstalar tira a aura e não deixa quadro vivo', () => {
    desligar = instalarPonteiro()
    rodar()
    expect(aura()).not.toBeNull()
    desligar()
    desligar = undefined
    expect(aura()).toBeNull()
    rodar()
    expect(quadros).toHaveLength(0)
  })
})

describe('a inclinação 3D do cartão sob o mouse', () => {
  const cartao = () => document.getElementById('cartao')!
  const numeros = () =>
    /rotateX\((-?[\d.e-]+)deg\) rotateY\((-?[\d.e-]+)deg\) translateY\((-?[\d.e-]+)px\) scale\((-?[\d.e-]+)\)/
      .exec(cartao().style.transform)!
      .slice(1)
      .map(Number)

  beforeEach(() => {
    cartao().getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }) as DOMRect
  })

  it('persegue o alvo 16% por quadro e, com o mouse PARADO sobre o cartão, o laço dorme', () => {
    desligar = instalarPonteiro()
    rodarAteDormir()
    mover(cartao(), 150, 50)
    rodar()
    /* força = min(1, 320/200)·8 = 8; rotateY = ((150/200) − 0,5)·2·8 = 4; sobe 6 px; escala 1,02. */
    const [, ry, y, s] = numeros()
    expect(ry).toBeCloseTo(4 * 0.16, 6)
    expect(y).toBeCloseTo(-6 * 0.16, 6)
    expect(s).toBeCloseTo(1 + 0.02 * 0.16, 6)
    const rodou = rodarAteDormir()
    expect(rodou).toBeLessThan(400)
    /* O mouse segue em cima do cartão, inclinado, e ninguém pede quadro. */
    expect(quadros).toHaveLength(0)
    const fim = numeros()
    expect(Math.abs(fim[1] - 4)).toBeLessThan(0.01)
    expect(Math.abs(fim[2] + 6)).toBeLessThan(0.01)
    expect(Math.abs(fim[3] - 1.02)).toBeLessThan(0.0001)
  })

  it('mexer de novo, apertar e soltar acordam o laço', () => {
    desligar = instalarPonteiro()
    mover(cartao(), 150, 50)
    rodarAteDormir()
    mover(cartao(), 50, 50)
    expect(quadros.length).toBeGreaterThan(0)
    rodarAteDormir()
    expect(Math.abs(numeros()[1] + 4)).toBeLessThan(0.01)
    cartao().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 50 }))
    expect(quadros.length).toBeGreaterThan(0)
    rodarAteDormir()
    expect(Math.abs(numeros()[3] - 0.96)).toBeLessThan(0.0001)
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    expect(quadros.length).toBeGreaterThan(0)
    rodarAteDormir()
    expect(Math.abs(numeros()[3] - 1.02)).toBeLessThan(0.0001)
    expect(quadros).toHaveLength(0)
  })

  it('o mouse que sai devolve o cartão ao lugar e o laço acaba', () => {
    desligar = instalarPonteiro()
    mover(cartao(), 150, 50)
    rodarAteDormir()
    mover(document.getElementById('texto')!, 500, 400)
    expect(quadros.length).toBeGreaterThan(0)
    rodarAteDormir()
    expect(cartao().style.transform).toBe('')
    expect(quadros).toHaveLength(0)
  })

  it('a luz do cartão recebe a posição do mouse, com uma medida só por movimento', () => {
    desligar = instalarPonteiro()
    rodarAteDormir()
    const medida = vi.spyOn(cartao(), 'getBoundingClientRect')
    mover(cartao(), 150, 30)
    expect(medida).toHaveBeenCalledTimes(1)
    const luz = cartao().querySelector<HTMLElement>(':scope > .px-luz')!
    expect(luz.style.getPropertyValue('--mx')).toBe('150px')
    expect(luz.style.getPropertyValue('--my')).toBe('30px')
  })
})
