// @vitest-environment jsdom
/**
 * RETRADUÇÃO E DITADO DE FRASE (`src/components/minigames/ExercicioDeFrase.tsx`): o campo com rótulo,
 * Enter confere, a dica, o diff com texto alternativo e o relatório da rodada (nota só pelo resultado).
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameItem, RoundReport } from '../src/core'

vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const m = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...m, perfilDoDispositivo: () => ({ ...m.perfilDoDispositivo(), tipo: 'desktop-com-gpu' }) }
})
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

const { Retraducao, DitadoDeFrase } = await import('../src/components/minigames/ExercicioDeFrase')

const item = (id: string, answer: string, prompt: string): MinigameItem => ({
  itemRef: id,
  prompt,
  answer,
  sentence: answer,
  lang: 'en',
})
const itens = () => [
  item('f1', 'the cat sleeps here', 'o gato dorme aqui'),
  item('f2', 'we read a good book', 'lemos um bom livro'),
]

const q = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T | null
const qq = (s: string) => [...document.querySelectorAll<HTMLElement>(s)]

let relatorio: RoundReport | null
beforeEach(() => {
  relatorio = null
  localStorage.clear()
  localStorage.setItem('babel.desenhoNovo', 'sim')
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const montar = (Tela: typeof Retraducao, lista = itens()) =>
  render(
    <section className="palco-jogo">
      <Tela items={lista} ageProfile="pro" onFinish={(r) => (relatorio = r)} onExit={() => undefined} />
    </section>,
  )
const campo = () => q<HTMLInputElement>('input[type="text"]')!
const escrever = (v: string) => fireEvent.change(campo(), { target: { value: v } })

describe('Retradução', () => {
  it('mostra a tradução e um campo com rótulo', () => {
    montar(Retraducao)
    expect(q('.ef-pista-texto')?.textContent).toBe('o gato dorme aqui')
    const rotulo = q<HTMLLabelElement>('label.ef-rotulo')!
    expect(rotulo.htmlFor).toBe(campo().id)
  })

  it('Enter confere e o diff leva texto alternativo além da cor', () => {
    montar(Retraducao)
    escrever('the dog sleeps here')
    fireEvent.keyDown(campo(), { key: 'Enter' })
    const marcas = qq('.ef-tok').map((li) => li.getAttribute('aria-label'))
    expect(marcas[0]).toBe('certa: the')
    expect(marcas[1]).toBe('trocada: você escreveu dog, o certo é cat')
    expect(q('.ef-nota')?.textContent).toContain('Nota 75 de 100')
    expect(q('.ef-original')?.textContent).toContain('the cat sleeps here')
  })

  it('campo vazio não confere nem registra erro', () => {
    montar(Retraducao)
    expect(q<HTMLButtonElement>('[data-pj="conferir"]')!.disabled).toBe(true)
    fireEvent.keyDown(campo(), { key: 'Enter' })
    escrever('   ')
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(q('.ef-nota')).toBeNull()
  })

  it('Enter segurado não pula a frase', () => {
    montar(Retraducao)
    escrever('the cat sleeps here')
    fireEvent.keyDown(campo(), { key: 'Enter', repeat: true })
    expect(q('.ef-nota')).toBeNull()
  })

  it('a dica revela a primeira letra de cada palavra', () => {
    montar(Retraducao)
    fireEvent.click(q('[data-ajuda="dica"]')!)
    expect(q('.ef-dica')?.textContent).toContain('t__ c__ s_____ h___')
  })

  it('termina a rodada com o relatório: acerto só pelo resultado, dica registrada', () => {
    montar(Retraducao)
    fireEvent.click(q('[data-ajuda="dica"]')!)
    escrever('The cat sleeps here.')
    fireEvent.keyDown(campo(), { key: 'Enter' })
    fireEvent.click(q('[data-pj="proxima"]')!)
    escrever('we read a bad movie')
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(q('[data-pj="proxima"]')?.textContent).toBe('Ver resultado')
    act(() => {
      fireEvent.click(q('[data-pj="proxima"]')!)
    })
    expect(relatorio?.gameId).toBe('retraducao')
    expect(relatorio?.items.map((i) => [i.itemRef, i.correct, i.hinted, i.revealed])).toEqual([
      ['f1', true, true, false],
      ['f2', false, false, false],
    ])
  })

  it('"Ver o original" encerra a frase como não consegui', () => {
    montar(Retraducao)
    fireEvent.click(q('[data-ajuda="original"]')!)
    expect(q('.ef-nota')).not.toBeNull()
    fireEvent.click(q('[data-pj="proxima"]')!)
    fireEvent.click(q('[data-ajuda="original"]')!)
    act(() => {
      fireEvent.click(q('[data-pj="proxima"]')!)
    })
    expect(relatorio?.items.every((i) => i.revealed && !i.correct)).toBe(true)
  })

  it('o acento é configurável na própria tela', () => {
    montar(Retraducao, [item('a', 'ela está na avó hoje', 'ela está com a avó')])
    const caixa = q<HTMLInputElement>('.ef-opcao input')!
    expect(caixa.checked).toBe(true)
    fireEvent.click(caixa)
    expect(localStorage.getItem('babel.frase.ignorarAcentos')).toBe('0')
    escrever('ela esta na avo hoje')
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(q('.ef-nota')?.textContent).not.toContain('Nota 100')
  })

  it('sem frases: tela vazia amigável com saída', () => {
    montar(Retraducao, [])
    expect(q('.ef-vazio')?.textContent).toContain('Ainda não há frases')
    expect(q('.ef-vazio button')?.textContent).toBe('Voltar')
  })
})

describe('Ditado de frase', () => {
  it('tem o botão de ouvir, que vira "Ouvir de novo", e não mostra a frase', () => {
    montar(DitadoDeFrase)
    const ouvir = q<HTMLButtonElement>('[data-pj="ouvir"]')!
    expect(ouvir.textContent).toContain('Ouvir a frase')
    fireEvent.click(ouvir)
    expect(q('[data-pj="ouvir"]')?.textContent).toContain('Ouvir de novo')
    expect(document.body.textContent).not.toContain('the cat sleeps here')
  })
})
