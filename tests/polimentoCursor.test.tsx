// @vitest-environment jsdom
/**
 * O CURSOR DO APP (`src/lib/polimento/cursor.ts`): ponto com anel, só com mouse e com a camada ligada.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { instalarCursor } from '../src/lib/polimento/cursor'

const comMouse = (sim: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: sim && q.includes('pointer: fine'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))

const mexer = (alvo: Element, tipo = 'mouse') =>
  alvo.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 40, clientY: 50, pointerType: tipo }))

it('o cursor do sistema só some onde o ponto com anel existe (a janela flutuante copia as classes, não o cursor)', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles/polimentoCursor.css'), 'utf8')
  expect(css).toContain('html.px-com-cursor:has(.px-cursor) *')
  expect(css).not.toContain('html.px-com-cursor * {')
})

describe('o cursor de ponto com anel', () => {
  let desligar = () => undefined as void
  beforeEach(() => {
    document.documentElement.dataset.px = 'on'
    document.body.innerHTML = '<button id="b">Ok</button><button id="d" disabled>Não</button><p id="p">texto</p>'
  })
  afterEach(() => {
    desligar()
    vi.unstubAllGlobals()
    delete document.documentElement.dataset.px
  })

  it('com mouse e a camada ligada: esconde o do sistema, segue o ponteiro e cresce sobre o clicável', () => {
    comMouse(true)
    desligar = instalarCursor()
    expect(document.documentElement.classList.contains('px-com-cursor')).toBe(true)
    const caixa = document.querySelector('.px-cursor') as HTMLElement
    const anel = caixa.querySelector('.px-cursor-anel') as HTMLElement
    expect(caixa.dataset.fora).toBe('')
    mexer(document.getElementById('p')!)
    expect(caixa.dataset.fora).toBeUndefined()
    expect(anel.style.translate).toBe('40px 50px')
    expect(anel.classList.contains('sobre')).toBe(false)
    mexer(document.getElementById('b')!)
    expect(anel.classList.contains('sobre')).toBe(true)
    mexer(document.getElementById('d')!)
    expect(anel.classList.contains('sobre')).toBe(false)
  })

  it('sobre o laranja passa à cor de tinta, e volta ao acento fora dele', () => {
    document.body.innerHTML =
      '<p id="p">texto</p>' +
      '<button id="pri" class="q-ctl pri"><span id="dentro">Iniciar</span></button>' +
      '<button id="solido" class="btn-solid">Salvar</button>' +
      '<div id="cartao" class="q-tile pri"><b id="titulo">Capturar</b></div>' +
      '<div id="marcado" data-cursor="tinta"><i id="filho">selo</i></div>' +
      '<button id="comum" class="q-ctl">Pausar</button>'
    comMouse(true)
    desligar = instalarCursor()
    const caixa = document.querySelector('.px-cursor') as HTMLElement
    mexer(document.getElementById('p')!)
    expect(caixa.classList.contains('tinta')).toBe(false)
    for (const id of ['pri', 'dentro', 'solido', 'cartao', 'titulo', 'marcado', 'filho']) {
      mexer(document.getElementById(id)!)
      expect(caixa.classList.contains('tinta'), id).toBe(true)
      mexer(document.getElementById('p')!)
      expect(caixa.classList.contains('tinta'), `${id} → fora`).toBe(false)
    }
    // O botão comum (sem o fundo do acento) segue com o cursor no acento.
    mexer(document.getElementById('comum')!)
    expect(caixa.classList.contains('tinta')).toBe(false)
  })

  it('não mede o estilo a cada movimento: a superfície laranja é reconhecida pelo seletor', () => {
    document.body.innerHTML = '<button id="pri" class="q-ctl pri">Iniciar</button>'
    comMouse(true)
    desligar = instalarCursor()
    const medir = vi.spyOn(window, 'getComputedStyle')
    mexer(document.getElementById('pri')!)
    mexer(document.body)
    expect(medir).not.toHaveBeenCalled()
    medir.mockRestore()
  })

  it('toque ou caneta: o cursor some', () => {
    comMouse(true)
    desligar = instalarCursor()
    const caixa = document.querySelector('.px-cursor') as HTMLElement
    mexer(document.getElementById('p')!)
    mexer(document.getElementById('p')!, 'touch')
    expect(caixa.dataset.fora).toBe('')
  })

  it('Modo desempenho (camada desligada): volta o cursor do sistema, e religa com ela', async () => {
    comMouse(true)
    desligar = instalarCursor()
    document.documentElement.dataset.px = 'off'
    await Promise.resolve()
    expect(document.documentElement.classList.contains('px-com-cursor')).toBe(false)
    expect(document.querySelector('.px-cursor')).toBeNull()
    document.documentElement.dataset.px = 'on'
    await Promise.resolve()
    expect(document.querySelector('.px-cursor')).not.toBeNull()
  })

  it('sem mouse (celular): nada é instalado', () => {
    comMouse(false)
    desligar = instalarCursor()
    expect(document.querySelector('.px-cursor')).toBeNull()
    expect(document.documentElement.classList.contains('px-com-cursor')).toBe(false)
  })
})
