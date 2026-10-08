// @vitest-environment jsdom
/**
 * AS AJUDAS GERAIS dos jogos com relógio por jogada (`casca/AjudasGerais.tsx`) e o SOCORRO do placar
 * depois de dois erros seguidos (`casca/HudDaRodada.tsx`).
 *
 * O que não pode quebrar: "+10 s" devolve dez segundos e gasta uma das ajudas do nível; "Ver resposta"
 * é a do protótipo (`jogos4.js:166-177`): mostra a resposta por 3,6 s e a jogada continua; o aviso de
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

  it('"Ver resposta" mostra a resposta por um instante, a carta continua, e o acerto conta como com dica', () => {
    const items = definicoes()
    let relatorio: RoundReport | null = null
    render(
      <section className="palco-jogo">
        <TabooGame items={items} ageProfile="pro" onFinish={(r) => (relatorio = r)} onExit={() => undefined} />
      </section>,
    )
    const ver = document.querySelector('[data-ajuda="resposta"]') as HTMLButtonElement
    // Uma vez por rodada no Médio (`jogos4.js:76`).
    expect(ver.textContent).toContain('1')
    fireEvent.click(ver)
    expect(document.querySelector('.palco-jogo > .pj-resp')?.textContent).toBe('Resposta: hospital')
    expect(ver.disabled).toBe(true)
    // A carta não foi dada por perdida: ainda dá para responder.
    expect(document.querySelector('[data-aviso-da-jogada]')).toBeNull()
    avancar(3600)
    expect(document.querySelector('.pj-resp')).toBeNull()
    for (const it of items) {
      fireEvent.click(screen.getByRole('button', { name: it.answer }))
      avancar(700)
    }
    avancar(900)
    const final = relatorio as RoundReport | null
    expect(final?.items[0]).toMatchObject({ correct: true, hinted: true })
    expect(final?.items[1].hinted).toBeFalsy()
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
