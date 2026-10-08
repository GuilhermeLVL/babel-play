// @vitest-environment jsdom
/**
 * A MALA DO PROTÓTIPO (`src/components/minigames/culturais/KofferDoPrototipo.tsx`), porte de
 * `jogos3.js:176-304`: a cena (rota, mala, compartimentos, etiquetas, adesivos, fala, vidas, paleta) e as
 * regras: a mala abre 350 ms depois, fecha em 2,7 s, o toque certo enche a etiqueta, o errado custa uma
 * vida, o nível refeito ganha um adesivo, e Espiar reabre a mala uma vez por nível.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameItem, RoundReport } from '../src/core'

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
vi.mock('../src/lib/tts', () => ({ speak: vi.fn(), falar: vi.fn(() => true) }))

const { default: KofferDoPrototipo } = await import('../src/components/minigames/culturais/KofferDoPrototipo')

const itens: MinigameItem[] = [
  { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' },
  { cardId: 'c2', prompt: 'cachorro', answer: 'dog', lang: 'en' },
  { cardId: 'c3', prompt: 'gato', answer: 'cat', lang: 'en' },
  { cardId: 'c4', prompt: 'livro', answer: 'book', lang: 'en' },
]
const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const um = (s: string) => document.querySelector(s)
const todos = (s: string) => [...document.querySelectorAll(s)]
const tocar = (palavra: string) => fireEvent.click(um(`.ml-paleta [data-op="${palavra}"]`) as HTMLElement)
const fala = () => um('.ml-fala')?.textContent
/** Abre a mala (350 ms) e espera ela fechar (2,7 s no Médio). */
const ateFechar = () => esperar(350 + 2700)

let relatorio: RoundReport | null
const montar = () =>
  render(<KofferDoPrototipo items={itens} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: false })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('a cena da Mala', () => {
  it('tem a rota, a mala com alça, corpo, tampa e fechos, a fala, as vidas e a paleta', () => {
    montar()
    expect(um('.ml-cena > .ml-rota')?.getAttribute('aria-label')).toBe('Rota dos níveis')
    expect(todos('.ml-rota li').map((li) => li.textContent)).toEqual(['1', '2', '3', '4'])
    for (const peca of ['.ml-alca', '.ml-corpo > .ml-slots', '.ml-tampa > .ml-conta', '.ml-tampa > .ml-tags'])
      expect(um(`.ml-palco > .ml-mala.fechada > ${peca}`), peca).not.toBeNull()
    for (const peca of ['.ml-tampa > .ml-adesivos', '.ml-fecho.e', '.ml-fecho.d'])
      expect(um(`.ml-mala > ${peca}`), peca).not.toBeNull()
    expect(todos('.ml-slot > i').map((i) => i.textContent)).toEqual(['1', '2', '3', '4'])
    expect(um('.ml-rodape > .ml-fala')?.getAttribute('role')).toBe('status')
    expect(um('.ml-rodape > .vidas')?.getAttribute('aria-label')).toBe('3 vidas')
    expect(todos('.vidas > span svg')).toHaveLength(3)
    /* A paleta nasce presa, com a palavra e a tradução em cada etiqueta. */
    expect(todos('.pj-paleta.ml-paleta > button.pj-opcao:disabled')).toHaveLength(4)
    expect(um('.ml-paleta [data-op="house"] small')?.textContent).toBe('casa')
    expect(um('[data-ajuda="espiar"]')?.getAttribute('title')).toBe('Conta como dica: zera o combo')
  })

  it('350 ms depois a mala abre com a palavra nova no compartimento, e o avião pousa no nível', () => {
    montar()
    esperar(350)
    expect(um('.ml-mala.aberta')).not.toBeNull()
    expect(um('.ml-slot.cheio.nova[data-s="0"] b')?.textContent).toBe('house')
    expect(um('.ml-slot[data-s="0"] small')?.textContent).toBe('casa')
    expect(um('.ml-rota li.atual[data-n="0"] .ml-aviao')).not.toBeNull()
    expect(fala()).toBe('Guarde a ordem…')
    expect(um('.ml-conta')?.textContent).toBe('1 palavra na mala')
  })

  it('fecha em 2,7 s: a etiqueta da vez pergunta, e a paleta destrava', () => {
    montar()
    ateFechar()
    expect(um('.ml-mala.fechada')).not.toBeNull()
    expect(fala()).toBe('Passo 1 de 1: qual palavra entrou nesta posição?')
    expect(um('.ml-tag.agora[data-t="0"]')?.textContent).toBe('1?')
    expect(todos('.ml-paleta button:disabled')).toHaveLength(0)
  })
})

describe('refazer a mala', () => {
  it('o toque errado custa uma vida e a fala fica vermelha', () => {
    montar()
    ateFechar()
    tocar('dog')
    expect(um('.ml-fala.erro')?.textContent).toBe('Não foi esta. A ordem conta, e a tentativa custou uma vida.')
    expect(um('.vidas')?.getAttribute('aria-label')).toBe('2 vidas')
    expect(todos('.vidas > span').map((v) => v.className)).toEqual(['', '', 'perdida'])
  })

  it('o toque certo enche a etiqueta; o nível refeito ganha um adesivo e entra mais uma palavra', () => {
    montar()
    ateFechar()
    tocar('house')
    expect(um('.ml-tag.ok[data-t="0"]')?.textContent).toBe('1house')
    expect(um('.ml-adesivo')?.textContent).toBe('1')
    expect(fala()).toBe('Mala refeita. Entra mais uma palavra.')
    expect(um('.hud .mut')?.textContent).toBe('1 de 4 níveis')
    esperar(1200)
    expect(um('.ml-mala.aberta')).not.toBeNull()
    expect(todos('.ml-slot.cheio b').map((b) => b.textContent)).toEqual(['house', 'dog'])
    expect(um('.ml-slot.nova b')?.textContent).toBe('dog')
    expect(todos('.ml-rota li').map((li) => li.className)).toEqual(['feito', 'atual', '', ''])
    esperar(2700)
    expect(fala()).toBe('Passo 1 de 2: qual palavra entrou nesta posição?')
    tocar('house')
    expect(fala()).toBe('Passo 2 de 2: qual palavra entrou nesta posição?')
    expect(todos('.ml-tag').map((x) => x.className.trim())).toEqual(['ml-tag ok', 'ml-tag agora'])
  })

  it('Espiar reabre a mala por 1,5 s, uma vez por nível, e marca a palavra como "com dica"', () => {
    montar()
    ateFechar()
    fireEvent.click(um('[data-ajuda="espiar"]') as HTMLElement)
    expect(um('.ml-mala.aberta')).not.toBeNull()
    expect(fala()).toBe('Espiando…')
    expect(um('.ml-slot.nova')).toBeNull()
    esperar(1500)
    expect(um('.ml-mala.fechada')).not.toBeNull()
    fireEvent.click(um('[data-ajuda="espiar"]') as HTMLElement)
    expect(um('.ml-mala.fechada')).not.toBeNull()
    tocar('house')
    esperar(1200 + 2700)
    tocar('dog')
    tocar('dog')
    tocar('dog')
    esperar(900)
    expect((relatorio as RoundReport | null)?.items).toMatchObject([{ itemRef: 'house', correct: true, hinted: true }])
  })

  it('sem vidas a rodada acaba 900 ms depois, com o que foi cobrado', () => {
    montar()
    ateFechar()
    tocar('dog')
    tocar('cat')
    tocar('book')
    expect(relatorio).toBeNull()
    esperar(900)
    expect((relatorio as RoundReport | null)?.gameId).toBe('koffer')
    expect((relatorio as RoundReport | null)?.items).toMatchObject([
      { cardId: 'c1', itemRef: 'house', correct: false, attempts: 4 },
    ])
  })

  it('a rodada inteira: "Mala completa!", a rota toda feita e um resultado por palavra', () => {
    montar()
    esperar(350)
    for (let nivel = 1; nivel <= itens.length; nivel++) {
      esperar(2700)
      for (let k = 0; k < nivel; k++) tocar(itens[k].answer)
      if (nivel < itens.length) esperar(1200)
    }
    expect(fala()).toBe('Mala completa!')
    expect(todos('.ml-rota li').map((li) => li.className)).toEqual(['feito', 'feito', 'feito', 'feito'])
    expect(todos('.ml-adesivo').map((a) => a.textContent)).toEqual(['1', '2', '3', '4'])
    expect(relatorio).toBeNull()
    esperar(900)
    expect((relatorio as RoundReport | null)?.items.map((o) => [o.cardId, o.correct, o.attempts])).toEqual([
      ['c1', true, 1],
      ['c2', true, 1],
      ['c3', true, 1],
      ['c4', true, 1],
    ])
  })
})

describe('os níveis da Mala', () => {
  it('no Difícil são 2 vidas, 1,9 s de mala aberta e a paleta sem tradução', () => {
    localStorage.setItem('babel.nivel.koffer', 'dificil')
    montar()
    expect(todos('.vidas > span')).toHaveLength(2)
    expect(um('.ml-paleta small')).toBeNull()
    esperar(350 + 1900)
    expect(um('.ml-mala.fechada')).not.toBeNull()
    /* Dentro da mala a tradução continua (`jogos3.js:209`). */
    expect(um('.ml-slot small')?.textContent).toBe('casa')
  })

  it('no Fácil são 4 vidas e 3,6 s de mala aberta', () => {
    localStorage.setItem('babel.nivel.koffer', 'facil')
    montar()
    expect(todos('.vidas > span')).toHaveLength(4)
    esperar(350 + 2700)
    expect(um('.ml-mala.aberta')).not.toBeNull()
    esperar(900)
    expect(um('.ml-mala.fechada')).not.toBeNull()
  })
})
