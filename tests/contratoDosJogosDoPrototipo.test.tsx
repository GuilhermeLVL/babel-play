// @vitest-environment jsdom
/**
 * O QUE TODO TABULEIRO DEVE AO SISTEMA (os nove jogos que rodam sobre o baralho, no desenho do protótipo).
 *
 * Estas garantias moravam nos testes dos tabuleiros de antes (`choseongGame`, `tenseTennisGame`,
 * `karutaGame`, `kofferGame`, `baoGame`, `vitendawiliGame`, `shiritoriGame`, `cadavreGame`, `tabooGame`),
 * que saíram com eles. Valem para o tabuleiro novo do mesmo jeito, porque é delas que a revisão depende:
 *
 *   - sem material suficiente o jogo SAI (`onExit`) em vez de inventar palavras ou abrir uma tela vazia;
 *   - o relatório sai com o `gameId` do próprio jogo (nunca o de outro);
 *   - cada item entra UMA vez, com o `cardId` que veio do item: sem ele não há nota de revisão, e um
 *     `cardId` inventado daria nota a um cartão que não existe;
 *   - o relógio de um item não vaza para o seguinte: tempo esgotado gera um resultado, errado e revelado.
 */
import { act, cleanup, render } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MinigameId, MinigameItem, RoundReport } from '../src/core'

/* O aparelho do teste é um computador, com teclado físico e voz: os relógios são os de base. */
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
vi.mock('../src/lib/tts', () => ({ speak: vi.fn(), falar: vi.fn(() => true) }))

type Tela = ComponentType<{ items: MinigameItem[]; onFinish: (r: RoundReport) => void; onExit: () => void }>
const tela = async (caminho: string) =>
  (await import(`../src/components/minigames/culturais/${caminho}.tsx`)).default as Tela

const TELAS: Array<[MinigameId, Tela]> = [
  ['karuta', await tela('KarutaDoPrototipo')],
  ['choseong', await tela('ChoseongDoPrototipo')],
  ['tenis', await tela('RaliDoPrototipo')],
  ['koffer', await tela('KofferDoPrototipo')],
  ['bao', await tela('BaoDoPrototipo')],
  ['vitendawili', await tela('VitendawiliDoPrototipo')],
  ['shiritori', await tela('ShiritoriDoPrototipo')],
  ['cadavre', await tela('CadavreDoPrototipo')],
  ['taboo', await tela('TabuDoPrototipo')],
]
const telaDe = (id: MinigameId) => TELAS.find(([j]) => j === id)![1]

const esperar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: false })
  /* O jsdom não anima nem conhece matrizes: a bola do Rali usa as duas coisas. */
  Element.prototype.animate = (() => ({
    finished: Promise.resolve(),
    cancel: () => undefined,
    pause: () => undefined,
    play: () => undefined,
  })) as never
  ;(globalThis as { DOMMatrix?: unknown }).DOMMatrix = class {
    m41 = 0
    m42 = 0
  }
})
afterEach(() => {
  cleanup()
  document.querySelectorAll('.ganho, .fx-vinheta').forEach((x) => x.remove())
  vi.useRealTimers()
})

describe('sem material suficiente o jogo sai pela porta', () => {
  it.each(TELAS)('%s: uma palavra só não abre rodada', (_id, Jogo) => {
    const onExit = vi.fn()
    const onFinish = vi.fn()
    render(
      <Jogo
        items={[{ cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' }]}
        onFinish={onFinish}
        onExit={onExit}
      />,
    )
    esperar(5000)
    expect(onExit).toHaveBeenCalled()
    expect(onFinish).not.toHaveBeenCalled()
  })

  it.each(TELAS)('%s: nenhum item não abre rodada', (_id, Jogo) => {
    const onExit = vi.fn()
    const onFinish = vi.fn()
    render(<Jogo items={[]} onFinish={onFinish} onExit={onExit} />)
    esperar(5000)
    expect(onExit).toHaveBeenCalled()
    expect(onFinish).not.toHaveBeenCalled()
  })
})

/* Uma das palavras NÃO tem cartão (veio de fala, sem lastro no baralho): ela não pode ganhar um. */
const PALAVRAS: MinigameItem[] = [
  { cardId: 'c1', prompt: 'casa', answer: 'house', lang: 'en' },
  { cardId: 'c2', prompt: 'cachorro', answer: 'dog', lang: 'en' },
  { prompt: 'gato', answer: 'cat', lang: 'en' },
  { cardId: 'c4', prompt: 'livro', answer: 'book', lang: 'en' },
  { cardId: 'c5', prompt: 'rio', answer: 'river', lang: 'en' },
  { cardId: 'c6', prompt: 'luz', answer: 'light', lang: 'en' },
  { cardId: 'c7', prompt: 'pão', answer: 'bread', lang: 'en' },
  { cardId: 'c8', prompt: 'nuvem', answer: 'cloud', lang: 'en' },
]
/* Uma corrente possível: ape → end/elk → dog. */
const CORRENTE: MinigameItem[] = [
  { cardId: 'c1', prompt: 'macaco', answer: 'ape', lang: 'en' },
  { cardId: 'c2', prompt: 'alce', answer: 'elk', lang: 'en' },
  { prompt: 'fim', answer: 'end', lang: 'en' },
  { cardId: 'c4', prompt: 'cachorro', answer: 'dog', lang: 'en' },
]
const DEFINICOES: MinigameItem[] = [
  { cardId: 'c1', prompt: 'A hospital is a building where doctors treat patients.', answer: 'hospital', lang: 'en' },
  { prompt: 'A library is a building where people borrow literature.', answer: 'library', lang: 'en' },
  { cardId: 'c3', prompt: 'A bicycle is a vehicle with two narrow wheels.', answer: 'bicycle', lang: 'en' },
  { cardId: 'c4', prompt: 'To harvest is to gather a crop that is ready.', answer: 'harvest', lang: 'en' },
]

/** Deixa o relógio correr, um segundo por vez, sem tocar em nada, até o jogo entregar o relatório. */
function deixarORelogioCorrer(Jogo: Tela, items: MinigameItem[]): RoundReport {
  let relatorio: RoundReport | null = null
  let vezes = 0
  render(
    <Jogo
      items={items}
      onFinish={(r) => {
        vezes++
        relatorio = r
      }}
      onExit={() => undefined}
    />,
  )
  for (let s = 0; s < 600 && !relatorio; s++) esperar(1000)
  esperar(5000)
  expect(relatorio, 'a rodada não terminou sozinha').not.toBeNull()
  expect(vezes, 'o relatório saiu mais de uma vez').toBe(1)
  return relatorio as unknown as RoundReport
}

describe('o que não dá enigma fica de fora', () => {
  it('choseong: palavra sem vogal não vira enigma (nem resultado)', () => {
    const r = deixarORelogioCorrer(telaDe('choseong'), [
      ...PALAVRAS,
      { cardId: 'c9', prompt: 'frio', answer: 'brr', lang: 'en' },
    ])
    expect(r.items.map((o) => o.itemRef)).not.toContain('brr')
    expect(r.items.map((o) => o.cardId)).not.toContain('c9')
  })
})

describe('o relógio esgotado: um resultado por item, com o cartão do item', () => {
  const casos: Array<[MinigameId, MinigameItem[]]> = [
    ['karuta', PALAVRAS],
    ['choseong', PALAVRAS],
    ['tenis', PALAVRAS],
    ['shiritori', CORRENTE],
    ['taboo', DEFINICOES],
  ]
  it.each(casos)('%s', (id, items) => {
    const r = deixarORelogioCorrer(telaDe(id), items)
    expect(r.gameId).toBe(id)
    expect(r.items.length).toBeGreaterThan(0)
    expect(r.items.length).toBeLessThanOrEqual(items.length)
    /* Cada item uma vez só. */
    const refs = r.items.map((o) => o.itemRef)
    expect(new Set(refs).size).toBe(refs.length)
    for (const o of r.items) {
      const item = items.find((i) => i.answer === o.itemRef)
      expect(item, `resultado de "${o.itemRef}" não é de nenhum item da rodada`).toBeTruthy()
      /* O cartão é o do item; item sem cartão continua sem. */
      expect(o.cardId ?? null).toBe(item?.cardId ?? null)
      /* Ninguém respondeu: não é acerto, e a resposta foi mostrada. */
      expect(o.correct).toBe(false)
      expect(o.revealed).toBe(true)
    }
  })
})
