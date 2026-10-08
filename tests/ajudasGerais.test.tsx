// @vitest-environment jsdom
/**
 * AS AJUDAS GERAIS dos jogos com relógio por jogada (`casca/AjudasGerais.tsx`) e o SOCORRO do placar
 * depois de dois erros seguidos (`casca/HudDaRodada.tsx`).
 *
 * O que não pode quebrar: "+10 s" devolve dez segundos e gasta uma das ajudas do nível; "Ver resposta"
 * mostra a palavra e conta como "não lembrei" (`revealed`), igual ao tempo esgotado; o aviso de
 * socorro acende no segundo erro seguido e apaga no acerto ou quando a pessoa usa uma ajuda.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Lightbulb } from 'lucide-react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ajudasDoJogo, SEGUNDOS_A_MAIS } from '../src/core/minigames/regras'
import type { MinigameItem, RoundReport } from '../src/core/minigames/types'

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

const { default: TabooGame } = await import('../src/components/minigames/culturais/TabooGame')
const { default: HudDaRodada, BotaoDeAjuda } = await import('../src/components/minigames/casca/HudDaRodada')
const { celebrar } = await import('../src/lib/comemoracao')

function definicoes(): MinigameItem[] {
  return [
    { cardId: 'c1', prompt: 'A hospital is a building where doctors treat patients.', answer: 'hospital', lang: 'en' },
    { cardId: 'c2', prompt: 'A library is a building where people borrow literature.', answer: 'library', lang: 'en' },
    { cardId: 'c3', prompt: 'A bicycle is a vehicle with two narrow wheels.', answer: 'bicycle', lang: 'en' },
    { cardId: 'c4', prompt: 'To harvest is to gather a crop that is ready.', answer: 'harvest', lang: 'en' },
  ]
}

const avancar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: false })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('a ajuda de tempo na tabela de regras', () => {
  it('vale nos jogos com relógio por jogada, duas vezes no Médio; o Duelo fica fora', () => {
    for (const jogo of ['karuta', 'choseong', 'tenis', 'shiritori', 'taboo'] as const) {
      expect(ajudasDoJogo(jogo, 'tempo', 'medio'), jogo).toBe(2)
      expect(ajudasDoJogo(jogo, 'tempo', 'facil'), jogo).toBe(3)
      expect(ajudasDoJogo(jogo, 'tempo', 'dificil'), jogo).toBe(1)
    }
    expect(ajudasDoJogo('blitz', 'tempo', 'medio')).toBe(0)
    expect(SEGUNDOS_A_MAIS).toBe(10)
  })
})

describe('as ajudas gerais no Tabu', () => {
  it('"+10 s" devolve dez segundos e gasta uma das duas do Médio', () => {
    render(<TabooGame items={definicoes()} ageProfile="pro" onFinish={() => undefined} onExit={() => undefined} />)
    expect(screen.getByText('30 s')).toBeTruthy()
    const maisTempo = document.querySelector('[data-ajuda="tempo"]') as HTMLButtonElement
    expect(maisTempo.textContent).toContain('2')
    fireEvent.click(maisTempo)
    expect(screen.getByText('40 s')).toBeTruthy()
    fireEvent.click(maisTempo)
    expect(screen.getByText('50 s')).toBeTruthy()
    expect(maisTempo.disabled).toBe(true)
  })

  it('"Ver resposta" mostra a palavra, conta como não lembrei e a rodada segue', () => {
    const items = definicoes()
    let relatorio: RoundReport | null = null
    render(<TabooGame items={items} ageProfile="pro" onFinish={(r) => (relatorio = r)} onExit={() => undefined} />)
    fireEvent.click(document.querySelector('[data-ajuda="resposta"]') as HTMLButtonElement)
    const aviso = document.querySelector('[data-aviso-da-jogada="erro"]') as HTMLElement
    expect(aviso.textContent).toContain('A resposta era:')
    expect(aviso.textContent).not.toContain('O tempo acabou')
    // A carta respondida fica 1,8 s à vista; as outras três são respondidas de verdade.
    avancar(1800)
    for (let i = 1; i < items.length; i++) {
      const certa = (relatorio as RoundReport | null) ? null : document.querySelector('[data-tour="alternativas"]')
      expect(certa).toBeTruthy()
      const botoes = [...document.querySelectorAll<HTMLButtonElement>('[data-tour="alternativas"] button')]
      const daVez = botoes.find((b) => items.some((it) => it.answer === b.textContent))
      fireEvent.click(daVez as HTMLButtonElement)
      avancar(1800)
    }
    avancar(900)
    const final = relatorio as RoundReport | null
    expect(final).not.toBeNull()
    expect(final?.items[0]).toMatchObject({ correct: false, revealed: true })
  })
})

describe('o socorro depois de dois erros seguidos', () => {
  const placar = () => (
    <HudDaRodada
      pontos={0}
      sequencia={0}
      acertos={0}
      rotulo="Carta 1 de 4"
      progresso={0}
      ajudas={<BotaoDeAjuda icone={Lightbulb} rotulo="Dica" onClick={() => undefined} />}
    />
  )
  const ajudas = () => document.querySelector('.hud-ajudas') as HTMLElement

  it('acende no segundo erro seguido e apaga no acerto', () => {
    render(placar())
    act(() => celebrar({ tipo: 'erro' }))
    expect(ajudas().hasAttribute('data-socorro')).toBe(false)
    act(() => celebrar({ tipo: 'erro' }))
    expect(ajudas().hasAttribute('data-socorro')).toBe(true)
    act(() => celebrar({ tipo: 'acerto', combo: 1 }))
    expect(ajudas().hasAttribute('data-socorro')).toBe(false)
  })

  it('um acerto no meio zera a conta, e usar uma ajuda apaga o aviso', () => {
    render(placar())
    act(() => celebrar({ tipo: 'erro' }))
    act(() => celebrar({ tipo: 'acerto', combo: 1 }))
    act(() => celebrar({ tipo: 'erro' }))
    expect(ajudas().hasAttribute('data-socorro')).toBe(false)
    act(() => celebrar({ tipo: 'erro' }))
    expect(ajudas().hasAttribute('data-socorro')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Dica/ }))
    expect(ajudas().hasAttribute('data-socorro')).toBe(false)
  })
})
