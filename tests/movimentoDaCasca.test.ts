// @vitest-environment jsdom
/**
 * O MOVIMENTO DA CASCA: a cascata da primeira visita de cada tela
 * (`src/lib/movimento/entradaDasTelas.ts`) e a troca de tema que se abre em círculo
 * (`src/lib/movimento/revelar.ts`). As duas só existem na faixa rica; fora dela a tela surge e a cor
 * troca como sempre.
 */
import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const movimento = vi.hoisted(() => ({ rico: true }))
vi.mock('../src/lib/movimento/animar', () => ({ movimentoRico: () => movimento.rico }))

import { instalarEntradaDasTelas } from '../src/lib/movimento/entradaDasTelas'
import { instalarOrigemDoToque, raioAteOCanto, revelarEmCirculo } from '../src/lib/movimento/revelar'

const microtarefa = () => new Promise((r) => setTimeout(r, 0))

function tela(classe: string, titulo: string) {
  const palco = document.createElement('div')
  palco.className = `q-palco ${classe}`
  palco.innerHTML = `<header><h1>${titulo}</h1></header><section></section>`
  return palco
}

let desinstalar: (() => void) | undefined

beforeEach(() => {
  movimento.rico = true
  document.body.innerHTML = ''
  document.documentElement.dataset.questNovo = 'true'
})
afterEach(() => {
  desinstalar?.()
  desinstalar = undefined
  delete document.documentElement.dataset.questNovo
  document.documentElement.classList.remove('q-vt')
})

describe('a entrada das telas', () => {
  it('a primeira visita ganha a cascata; a volta à mesma tela, não', async () => {
    desinstalar = instalarEntradaDasTelas()
    const jogar = tela('qj', 'Jogar')
    document.body.append(jogar)
    await microtarefa()
    expect(jogar.getAttribute('data-entrada')).toBe('cascata')

    jogar.remove()
    const deNovo = tela('qj', 'Jogar')
    document.body.append(deNovo)
    await microtarefa()
    expect(deNovo.hasAttribute('data-entrada')).toBe(false)

    const outra = tela('qe', 'Estatísticas')
    document.body.append(outra)
    await microtarefa()
    expect(outra.getAttribute('data-entrada')).toBe('cascata')
  })

  it('acha o palco que chega dentro de outro elemento', async () => {
    desinstalar = instalarEntradaDasTelas()
    const casca = document.createElement('div')
    const palco = tela('qb', 'Biblioteca')
    casca.append(palco)
    document.body.append(casca)
    await microtarefa()
    expect(palco.getAttribute('data-entrada')).toBe('cascata')
  })

  it('a tela que já estava montada conta como vista, e na faixa contida ninguém ganha cascata', async () => {
    const jaEstava = tela('qi', 'Início')
    document.body.append(jaEstava)
    desinstalar = instalarEntradaDasTelas()
    jaEstava.remove()
    const volta = tela('qi', 'Início')
    document.body.append(volta)
    await microtarefa()
    expect(volta.hasAttribute('data-entrada')).toBe(false)

    movimento.rico = false
    const contida = tela('qa', 'Ajustes')
    document.body.append(contida)
    await microtarefa()
    expect(contida.hasAttribute('data-entrada')).toBe(false)
  })

  it('o CSS da cascata só anima na faixa rica e só mexe em opacidade e transform', () => {
    const css = readFileSync('src/styles/questMovimento.css', 'utf8')
    const quadros = css.match(/@keyframes q-entra \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(quadros).toContain('opacity')
    expect(quadros).toContain('transform')
    expect(quadros).not.toMatch(/\b(top|left|width|height|margin|padding)\s*:/)
    for (const linha of css.split('\n').filter((l) => l.includes("[data-entrada='cascata']"))) {
      expect(linha).toContain("[data-movimento='rico']")
    }
  })
})

describe('a revelação em círculo', () => {
  const comTransicao = () => {
    const animate = vi.fn()
    Object.assign(document.documentElement, { animate })
    let terminar: () => void = () => undefined
    const finished = new Promise<void>((r) => (terminar = r))
    const startViewTransition = vi.fn((muda: () => void) => {
      muda()
      return { ready: Promise.resolve(), finished }
    })
    Object.assign(document, { startViewTransition })
    return { animate, startViewTransition, terminar: () => terminar() }
  }
  afterEach(() => {
    Object.assign(document, { startViewTransition: undefined })
  })

  it('o raio alcança o canto mais longe', () => {
    expect(raioAteOCanto(0, 0, 300, 400)).toBe(500)
    expect(raioAteOCanto(300, 400, 300, 400)).toBe(500)
    expect(raioAteOCanto(150, 200, 300, 400)).toBe(250)
  })

  it('abre a cor nova a partir do último toque e limpa a marca no fim', async () => {
    const { animate, startViewTransition, terminar } = comTransicao()
    const desinstalarToque = instalarOrigemDoToque()
    window.dispatchEvent(Object.assign(new Event('pointerdown'), { clientX: 40, clientY: 60 }))
    const muda = vi.fn()

    revelarEmCirculo(muda)
    expect(startViewTransition).toHaveBeenCalledOnce()
    expect(muda).toHaveBeenCalledOnce()
    expect(document.documentElement.classList.contains('q-vt')).toBe(true)
    await microtarefa()
    const [quadros, opcoes] = animate.mock.calls[0]
    expect(quadros.clipPath[0]).toBe('circle(0px at 40px 60px)')
    expect(opcoes.pseudoElement).toBe('::view-transition-new(root)')

    terminar()
    await microtarefa()
    expect(document.documentElement.classList.contains('q-vt')).toBe(false)
    desinstalarToque()
  })

  it('sem a API, fora do desenho novo ou na faixa contida, só roda a troca', () => {
    const muda = vi.fn()
    revelarEmCirculo(muda)
    expect(muda).toHaveBeenCalledTimes(1)

    const { startViewTransition } = comTransicao()
    document.documentElement.dataset.questNovo = 'false'
    revelarEmCirculo(muda)
    document.documentElement.dataset.questNovo = 'true'
    movimento.rico = false
    revelarEmCirculo(muda)
    expect(muda).toHaveBeenCalledTimes(3)
    expect(startViewTransition).not.toHaveBeenCalled()
  })
})
