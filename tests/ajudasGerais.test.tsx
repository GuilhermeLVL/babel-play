// @vitest-environment jsdom
/**
 * AS AJUDAS GERAIS dos jogos (`casca/AjudasGerais.tsx`), jogadas no Tabu do protótipo.
 *
 * O que não pode quebrar: "+10 s" devolve dez segundos e gasta uma das ajudas do nível; "Ver resposta"
 * é a do protótipo (`jogos4.js:166-177`): mostra a resposta por 3,6 s, a jogada continua, e o acerto que
 * vier depois conta como "com dica" (é o que limita a nota de revisão daquele cartão).
 *
 * O que as ajudas fazem depois de dois erros seguidos (o pulso com "quer uma ajuda?") está em
 * `tests/polimentoJogos.test.tsx`.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ajudasDoJogo, SEGUNDOS_A_MAIS } from '../src/core/minigames/regras'
import type { MinigameItem, RoundReport } from '../src/core/minigames/types'

/* O aparelho do teste é um computador: os relógios são os de base. */
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

const { default: TabuDoPrototipo } = await import('../src/components/minigames/culturais/TabuDoPrototipo')

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
const q = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T | null
const relogio = () => q('[data-pj="relogio"]')?.textContent

let relatorio: RoundReport | null
const montar = (items = definicoes()) =>
  render(
    <section className="palco-jogo">
      <TabuDoPrototipo items={items} onFinish={(r) => (relatorio = r)} onExit={() => undefined} />
    </section>,
  )

beforeEach(() => {
  relatorio = null
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: false })
})
afterEach(() => {
  cleanup()
  document.querySelectorAll('.ganho, .fx-vinheta').forEach((x) => x.remove())
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('a ajuda de tempo na tabela de regras', () => {
  it('vale nos jogos com relógio, duas vezes no Médio; no protótipo o Duelo também tem (jogos4.js:67)', () => {
    for (const jogo of ['blitz', 'karuta', 'choseong', 'tenis', 'shiritori', 'taboo'] as const) {
      expect(ajudasDoJogo(jogo, 'tempo', 'medio'), jogo).toBe(2)
      expect(ajudasDoJogo(jogo, 'tempo', 'facil'), jogo).toBe(3)
      expect(ajudasDoJogo(jogo, 'tempo', 'dificil'), jogo).toBe(1)
    }
    expect(ajudasDoJogo('memory', 'tempo', 'medio')).toBe(0)
    expect(SEGUNDOS_A_MAIS).toBe(10)
  })
})

describe('as ajudas gerais no Tabu', () => {
  it('"+10 s" devolve dez segundos e gasta uma das duas do Médio', () => {
    montar()
    expect(relogio()).toBe('30s')
    const maisTempo = q<HTMLButtonElement>('[data-ajuda="tempo"]')!
    expect(maisTempo.querySelector('.n')?.textContent).toBe('2')
    fireEvent.click(maisTempo)
    avancar(100)
    expect(relogio()).toBe('40s')
    fireEvent.click(maisTempo)
    avancar(100)
    expect(relogio()).toBe('50s')
    expect(maisTempo.disabled).toBe(true)
  })

  it('"Ver resposta" mostra a resposta por um instante, a carta continua, e o acerto conta como com dica', () => {
    const items = definicoes()
    montar(items)
    const ver = q<HTMLButtonElement>('[data-ajuda="resposta"]')!
    // Uma vez por rodada no Médio (`jogos4.js:76`).
    expect(ver.querySelector('.n')?.textContent).toBe('1')
    fireEvent.click(ver)
    expect(q('.palco-jogo > .pj-resp')?.textContent).toBe('Resposta: hospital')
    expect(ver.disabled).toBe(true)
    // A carta não foi dada por perdida: ainda dá para responder.
    expect(q<HTMLButtonElement>('.opcoes-blitz [data-op="hospital"]')?.disabled).toBe(false)
    avancar(3600)
    expect(q('.pj-resp')).toBeNull()
    for (const it of items) {
      fireEvent.click(q(`.opcoes-blitz [data-op="${it.answer}"]`)!)
      avancar(700)
    }
    avancar(900)
    const final = relatorio as RoundReport | null
    expect(final?.items[0]).toMatchObject({ correct: true, hinted: true })
    expect(final?.items[1].hinted).toBeFalsy()
  })
})
