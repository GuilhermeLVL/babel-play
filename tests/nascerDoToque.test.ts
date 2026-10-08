// @vitest-environment jsdom
/**
 * O PAINEL NASCE DO TOQUE (`src/lib/movimento/nascerDoToque.ts`): um painel que aparece logo depois
 * de um toque cresce a partir daquele ponto. Aberto pelo teclado, não anima.
 */
import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const movimento = vi.hoisted(() => ({ rico: true }))
vi.mock('../src/lib/movimento/animar', () => ({ movimentoRico: () => movimento.rico }))

import { instalarNascerDoToque } from '../src/lib/movimento/nascerDoToque'

const microtarefa = () => new Promise((r) => setTimeout(r, 0))
const tocar = (clientX: number, clientY: number) =>
  window.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX, clientY }))

function painel(marcacao = '<div class="q-mais" role="dialog"></div>') {
  const caixa = document.createElement('div')
  caixa.innerHTML = marcacao
  const el = caixa.firstElementChild as HTMLElement
  /* O jsdom não calcula layout: um retângulo fixo basta para a conta da origem. */
  el.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 300 }) as DOMRect
  return el
}

let desinstalar: (() => void) | undefined

beforeEach(() => {
  movimento.rico = true
  document.body.innerHTML = ''
  desinstalar = instalarNascerDoToque()
})
afterEach(() => {
  desinstalar?.()
})

describe('o painel nasce do toque', () => {
  it('cresce a partir do ponto tocado, medido dentro do painel', async () => {
    tocar(140, 320)
    const el = painel()
    document.body.append(el)
    await microtarefa()
    expect(el.hasAttribute('data-nasce')).toBe(true)
    expect(el.style.transformOrigin).toBe('40px 270px')
  })

  it('vale para <dialog> que abre e para quem se declara diálogo', async () => {
    tocar(10, 10)
    const declarado = painel('<section role="dialog"></section>')
    document.body.append(declarado)
    await microtarefa()
    expect(declarado.hasAttribute('data-nasce')).toBe(true)

    const nativo = painel('<dialog></dialog>')
    document.body.append(nativo)
    await microtarefa()
    nativo.removeAttribute('data-nasce')
    tocar(10, 10)
    nativo.setAttribute('open', '')
    await microtarefa()
    expect(nativo.hasAttribute('data-nasce')).toBe(true)
  })

  it('aberto pelo teclado, não anima', async () => {
    tocar(140, 320)
    window.dispatchEvent(new Event('keydown'))
    const el = painel()
    document.body.append(el)
    await microtarefa()
    expect(el.hasAttribute('data-nasce')).toBe(false)
  })

  it('não anima sem toque recente nem na faixa contida', async () => {
    const semToque = painel()
    document.body.append(semToque)
    await microtarefa()
    expect(semToque.hasAttribute('data-nasce')).toBe(false)

    const agora = vi.spyOn(performance, 'now')
    agora.mockReturnValue(1000)
    tocar(1, 1)
    agora.mockReturnValue(2000)
    const tarde = painel()
    document.body.append(tarde)
    await microtarefa()
    expect(tarde.hasAttribute('data-nasce')).toBe(false)
    agora.mockRestore()

    movimento.rico = false
    tocar(1, 1)
    const contido = painel()
    document.body.append(contido)
    await microtarefa()
    expect(contido.hasAttribute('data-nasce')).toBe(false)
  })

  it('a marca sai quando a animação termina', async () => {
    tocar(140, 320)
    const el = painel()
    document.body.append(el)
    await microtarefa()
    el.dispatchEvent(new Event('animationend'))
    expect(el.hasAttribute('data-nasce')).toBe(false)
    expect(el.style.transformOrigin).toBe('')
  })

  it('o CSS usa `scale`, não `transform`: diálogo centrado por transform não sai do lugar', () => {
    const css = readFileSync('src/styles/questMovimento.css', 'utf8')
    const quadros = css.match(/@keyframes q-nasce \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(quadros).toMatch(/\bscale:/)
    expect(quadros).not.toMatch(/\btransform:/)
  })
})
