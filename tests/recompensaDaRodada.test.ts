import { describe, expect, it } from 'vitest'

import { PESOS_SEEDS, PESOS_XP } from '../src/core/learning/xp'
import { ehRodadaPerfeita, ganhoDaRodada, summarize, xpFromRound } from '../src/core/minigames/grade'
import type { RoundReport } from '../src/core/minigames/types'

/* `seedsDaRodada` (o arquivo `recompensaDaRodada.ts`) foi absorvido por `ganhoDaRodada`: XP e
   Seeds da raspadinha saem da mesma função. Os testes das Seeds continuam valendo sobre ela. */
const seedsDaRodada = (r: RoundReport) => ganhoDaRodada(r).seeds

/**
 * O "+N Seeds" da raspadinha precisa ser o que o servidor vai creditar — a tela não pode prometer
 * uma moeda que o saldo não mostra depois. A régua é a de `seedsGanhasDeEventos`.
 */
const rodada = (gameId: RoundReport['gameId'], items: RoundReport['items']): RoundReport => ({
  gameId,
  items,
  score: 0,
  durationMs: 1000,
})

describe('seedsDaRodada', () => {
  it('item de jogo certo (sem cartão) vale jogoCerto; errado não vale nada', () => {
    const r = rodada('escuta', [
      { itemRef: 'a', correct: true, attempts: 1, ms: 900 },
      { itemRef: 'b', correct: false, attempts: 1, ms: 900 },
    ])
    expect(seedsDaRodada(r)).toBe(PESOS_SEEDS.jogoCerto)
  })

  it('item que vira revisão vale revisaoCerta quando a nota é boa, e zero quando não é', () => {
    const r = rodada('memory', [
      { cardId: 'c1', itemRef: 'a', correct: true, attempts: 1, ms: 900 }, // nota 3
      { cardId: 'c2', itemRef: 'b', correct: true, attempts: 3, ms: 900 }, // nota 2
      { cardId: 'c3', itemRef: 'c', correct: false, attempts: 1, ms: 900 },
    ])
    expect(seedsDaRodada(r)).toBe(PESOS_SEEDS.revisaoCerta)
  })

  it('rodada perfeita com o mínimo de itens soma o bônus; abaixo do mínimo, não', () => {
    const certos = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ itemRef: `w${i}`, correct: true, attempts: 1, ms: 900 }))
    // escuta: minItems do jogo (MINIGAMES) — com 4 itens certos a rodada é perfeita
    expect(seedsDaRodada(rodada('escuta', certos(4)))).toBe(4 * PESOS_SEEDS.jogoCerto + PESOS_SEEDS.rodadaPerfeita)
    expect(seedsDaRodada(rodada('escuta', certos(1)))).toBe(PESOS_SEEDS.jogoCerto)
  })
})

/**
 * XP DA RASPADINHA = XP CREDITADO. `xpFromRound` era `acertos × 2 + itens` para todo jogo: batia
 * com o item de jogo (1 + 2 por acerto) e errava a revisão (3 + 2 por nota boa) e o bônus de
 * rodada perfeita (+15). Agora os dois números saem de `ganhoDaRodada`, com os pesos do core.
 */
describe('ganhoDaRodada', () => {
  it('revisão de jogo SRS vale revisao (+ revisaoCerta com nota boa) em XP', () => {
    const r = rodada('memory', [
      { cardId: 'c1', itemRef: 'a', correct: true, attempts: 1, ms: 900 }, // nota 3
      { cardId: 'c2', itemRef: 'b', correct: true, attempts: 3, ms: 900 }, // nota 2
    ])
    expect(ganhoDaRodada(r).xp).toBe(2 * PESOS_XP.revisao + PESOS_XP.revisaoCerta)
    expect(xpFromRound(r)).toBe(ganhoDaRodada(r).xp)
    expect(summarize(r).xp).toBe(ganhoDaRodada(r).xp)
  })

  it('rodada perfeita soma o bônus de XP e de Seeds', () => {
    const itens = Array.from({ length: 4 }, (_, i) => ({ itemRef: `w${i}`, correct: true, attempts: 1, ms: 900 }))
    const g = ganhoDaRodada(rodada('escuta', itens))
    expect(g.perfeita).toBe(true)
    expect(g.xp).toBe(4 * (PESOS_XP.itemDeJogo + PESOS_XP.itemDeJogoCerto) + PESOS_XP.rodadaPerfeita)
    expect(g.seeds).toBe(seedsDaRodada(rodada('escuta', itens)))
  })

  it('a régua de rodada perfeita é a mesma que os servidores contam', () => {
    expect(ehRodadaPerfeita('escuta', 4, 4)).toBe(true)
    expect(ehRodadaPerfeita('escuta', 4, 3)).toBe(false)
    expect(ehRodadaPerfeita(null, 2, 2)).toBe(false) // sem jogo, o mínimo é 3
    expect(ehRodadaPerfeita(null, 3, 3)).toBe(true)
  })
})
