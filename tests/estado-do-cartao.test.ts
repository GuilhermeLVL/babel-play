/**
 * O ESTADO DO CARTÃO no núcleo (`src/core/learning/estadoDoCartao.ts`): a régua que a moldura do cartão
 * (`pelesDeCartao`) e o histórico da palavra no servidor (`GET /api/vocab/palavra`) usam. A pele delega
 * para cá; os dois têm de responder o mesmo.
 */
import { describe, expect, it } from 'vitest'

import { RETENCAO_DE_DOMINIO } from '../src/core/learning/dominio'
import { estadoDoCartao, fsrsStateDaLinha } from '../src/core/learning/estadoDoCartao'
import { retrievability } from '../src/core/learning/scheduler'
import { estadoDoCartao as estadoDaPele } from '../src/lib/pelesDeCartao'

const DIA = 86_400_000
const AGORA = Date.UTC(2026, 9, 26)

describe('fsrsStateDaLinha (a regra de fsrsStateOf do cliente)', () => {
  it('sem estabilidade é New; menos de 2 revisões é Learning; depois, Review', () => {
    expect(fsrsStateDaLinha({ stability: null, reps: 5 })).toBe('New')
    expect(fsrsStateDaLinha({ stability: 2, reps: 1 })).toBe('Learning')
    expect(fsrsStateDaLinha({ stability: 2, reps: null })).toBe('Learning')
    expect(fsrsStateDaLinha({ stability: 2, reps: 2 })).toBe('Review')
  })
})

describe('estadoDoCartao', () => {
  it('New é nova; Learning e Relearning são aprendida', () => {
    expect(estadoDoCartao({ fsrsState: 'New' }, AGORA)).toBe('nova')
    expect(estadoDoCartao({ fsrsState: 'Learning', stability: 30 }, AGORA)).toBe('aprendida')
    expect(estadoDoCartao({ fsrsState: 'Relearning', stability: 30 }, AGORA)).toBe('aprendida')
  })

  it('Review com a retenção de agora acima do corte é dominada; escapando, aprendida', () => {
    const forte = { fsrsState: 'Review' as const, stability: 60, lastReview: AGORA - 2 * DIA }
    expect(retrievability(2, 60)).toBeGreaterThanOrEqual(RETENCAO_DE_DOMINIO)
    expect(estadoDoCartao(forte, AGORA)).toBe('dominada')
    const fraco = { fsrsState: 'Review' as const, stability: 1, lastReview: AGORA - 40 * DIA }
    expect(estadoDoCartao(fraco, AGORA)).toBe('aprendida')
    expect(estadoDoCartao({ fsrsState: 'Review', stability: 0 }, AGORA)).toBe('aprendida')
  })

  it('a pele do cartão dá a mesma resposta (delega para o núcleo)', () => {
    const casos = [
      { fsrsState: 'New' as const, fsrsStability: 0 },
      { fsrsState: 'Learning' as const, fsrsStability: 3, lastReview: AGORA - DIA },
      { fsrsState: 'Review' as const, fsrsStability: 60, lastReview: AGORA - 2 * DIA },
      { fsrsState: 'Review' as const, fsrsStability: 1, lastReview: AGORA - 40 * DIA },
    ]
    for (const c of casos) expect(estadoDaPele(c, AGORA)).toBe(estadoDoCartao(c, AGORA))
  })
})
