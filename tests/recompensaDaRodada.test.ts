import { describe, expect, it } from 'vitest'

import { PESOS_SEEDS } from '../src/core/learning/xp'
import { seedsDaRodada } from '../src/core/minigames/recompensaDaRodada'
import type { RoundReport } from '../src/core/minigames/types'

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
