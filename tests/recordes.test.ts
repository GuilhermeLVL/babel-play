// @vitest-environment jsdom
/**
 * Recordes agregados por jogo: melhor placar, melhor combo (novo), precisão e contagem de rodadas
 * distintas — via as MESMAS rotas que a tela usa (`/api/exercises/rodada` e `/recordes`).
 */
import 'fake-indexeddb/auto'
import { afterAll, describe, expect, it } from 'vitest'
import { servidorEfemero } from '../src/data/efemero/servidor'
import { fecharStore } from '../src/data/efemero/store'

afterAll(() => fecharStore())

const rodada = (roundId: string, score: number, melhorSequencia: number, itens: Array<0 | 1>) =>
  servidorEfemero('/api/exercises/rodada', {
    method: 'POST',
    body: JSON.stringify({
      roundId, exerciseKind: 'blitz', origem: 'baralho', score, melhorSequencia,
      itens: itens.map((c, i) => ({ itemRef: 'w' + i, correct: c, attempts: 1, ms: 900, hinted: 0, kind: 'drill' })),
    }),
  })

describe('recordes por jogo', () => {
  it('agrega melhor placar, melhor combo, precisão e rodadas distintas', async () => {
    await rodada('r1', 120, 4, [1, 1, 0, 1])
    await rodada('r2', 300, 9, [1, 1, 1, 1])
    const res = await servidorEfemero('/api/exercises/recordes')
    expect(res.status).toBe(200)
    const linhas = (await res.json()) as Array<Record<string, unknown>>
    const blitz = linhas.find((l) => l.exerciseKind === 'blitz')!
    expect(blitz.melhorPontos).toBe(300)
    expect(blitz.melhorCombo).toBe(9)
    expect(blitz.rodadas).toBe(2)
    expect(blitz.precisao).toBe(88) // 7 de 8
    expect(typeof blitz.ultimaEm).toBe('number')
  })
})
