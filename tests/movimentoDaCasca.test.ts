// @vitest-environment jsdom
/**
 * O MOVIMENTO DA CASCA: a troca de tema que se abre em círculo (`src/lib/movimento/revelar.ts`).
 * A entrada das telas passou para `tests/polimentoTelas.test.ts` (porte do protótipo).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const movimento = vi.hoisted(() => ({ rico: true }))
vi.mock('../src/lib/movimento/animar', () => ({ movimentoRico: () => movimento.rico }))

import { instalarOrigemDoToque, raioAteOCanto, revelarEmCirculo } from '../src/lib/movimento/revelar'

const microtarefa = () => new Promise((r) => setTimeout(r, 0))

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
