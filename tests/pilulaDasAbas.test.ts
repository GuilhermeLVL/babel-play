// @vitest-environment jsdom
/**
 * A PÍLULA DAS ABAS (`src/lib/movimento/pilulaDasAbas.ts`): uma marca só, que desliza até a aba
 * escolhida em qualquer `.q-abas` da tela. Só na faixa rica; na contida a aba se pinta sozinha.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const movimento = vi.hoisted(() => ({ rico: true }))
vi.mock('../src/lib/movimento/animar', () => ({ movimentoRico: () => movimento.rico }))

import { instalarPilulaDasAbas, posicionarPilula } from '../src/lib/movimento/pilulaDasAbas'

const quadro = () => new Promise((r) => requestAnimationFrame(() => r(null)))

function abas(atributo = 'aria-selected', escolhidas = [0]) {
  const grupo = document.createElement('div')
  grupo.className = 'q-abas'
  for (let i = 0; i < 3; i++) {
    const aba = document.createElement('button')
    aba.className = 'q-aba'
    aba.setAttribute(atributo, String(escolhidas.includes(i)))
    grupo.append(aba)
  }
  document.body.append(grupo)
  return grupo
}
const pilulaDe = (grupo: Element) => grupo.querySelector(':scope > .q-pilula')

let desinstalar: (() => void) | undefined

beforeEach(() => {
  movimento.rico = true
  document.body.innerHTML = ''
})
afterEach(() => {
  desinstalar?.()
  desinstalar = undefined
})

describe('a pílula das abas', () => {
  it('entra como ÚLTIMO filho (a ordem das abas não muda) e é só enfeite', () => {
    const grupo = abas()
    posicionarPilula(grupo)
    const pilula = pilulaDe(grupo)
    expect(pilula).not.toBeNull()
    expect(grupo.lastElementChild).toBe(pilula)
    expect(grupo.children[0].className).toBe('q-aba')
    expect(pilula?.getAttribute('aria-hidden')).toBe('true')
    expect(grupo.dataset.pilula).toBe('')
  })

  it('vale para as quatro formas de dizer "escolhida"', () => {
    for (const atributo of ['aria-selected', 'aria-pressed', 'aria-checked']) {
      const grupo = abas(atributo)
      posicionarPilula(grupo)
      expect(pilulaDe(grupo), atributo).not.toBeNull()
    }
    const grupo = abas('data-nada')
    grupo.children[1].setAttribute('aria-current', 'page')
    posicionarPilula(grupo)
    expect(pilulaDe(grupo)).not.toBeNull()
  })

  it('é uma só por grupo, mesmo posicionando várias vezes', () => {
    const grupo = abas()
    posicionarPilula(grupo)
    posicionarPilula(grupo)
    expect(grupo.querySelectorAll('.q-pilula')).toHaveLength(1)
  })

  it('não existe quando o grupo soma escolhas, quando nada está escolhido ou na faixa contida', () => {
    const soma = abas('aria-pressed', [0, 2])
    posicionarPilula(soma)
    expect(pilulaDe(soma)).toBeNull()

    const nenhuma = abas('aria-pressed', [])
    posicionarPilula(nenhuma)
    expect(pilulaDe(nenhuma)).toBeNull()

    const contida = abas()
    posicionarPilula(contida)
    movimento.rico = false
    posicionarPilula(contida)
    expect(pilulaDe(contida)).toBeNull()
    expect(contida.dataset.pilula).toBeUndefined()
  })

  it('instalada, acompanha a escolha mudar e as abas que entram na tela, e sai sem deixar rastro', async () => {
    const primeiro = abas()
    desinstalar = instalarPilulaDasAbas()
    await quadro()
    expect(pilulaDe(primeiro)).not.toBeNull()

    const depois = abas('aria-pressed', [1])
    await quadro()
    await quadro()
    expect(pilulaDe(depois)).not.toBeNull()

    depois.children[0].setAttribute('aria-pressed', 'true')
    await quadro()
    await quadro()
    expect(pilulaDe(depois), 'duas escolhidas: sem pílula').toBeNull()

    desinstalar()
    desinstalar = undefined
    expect(document.querySelectorAll('.q-pilula')).toHaveLength(0)
    expect(primeiro.dataset.pilula).toBeUndefined()
  })

  it('a faixa de movimento mudando tira as pílulas', async () => {
    const grupo = abas()
    desinstalar = instalarPilulaDasAbas()
    await quadro()
    expect(pilulaDe(grupo)).not.toBeNull()
    movimento.rico = false
    document.documentElement.dataset.movimento = 'contido'
    await quadro()
    await quadro()
    expect(pilulaDe(grupo)).toBeNull()
    delete document.documentElement.dataset.movimento
  })
})
