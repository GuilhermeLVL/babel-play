// @vitest-environment jsdom
/**
 * O "+N XP · +N Seeds" DA RASPADINHA É O QUE OS DOIS SERVIDORES CREDITAM.
 *
 * A tela mostra `ganhoDaRodada` (core). Os servidores não creditam "uma rodada": eles recontam o
 * perfil a partir das linhas gravadas (`economiaDeMetricas`). Este teste grava a MESMA rodada nos
 * dois e confere que a diferença de XP e de Seeds no perfil é exatamente o número da tela.
 */
import 'fake-indexeddb/auto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { economiaDeMetricas } from '../../src/core/learning/xp'
import { ganhoDaRodada } from '../../src/core/minigames/grade'
import type { RoundReport } from '../../src/core/minigames/types'
import { perfilEfemero } from '../../src/data/efemero/rotas/metricas'
import { servidorEfemero } from '../../src/data/efemero/servidor'
import { fecharStore, limparTudo } from '../../src/data/efemero/store'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let exerciseResultsRepo: any
let economiaDoUsuario: any
const U = asUserId('contrato-ganho')

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ exerciseResultsRepo } = (await h.load('../../server/db/repositories/exerciseResults')) as any)
  ;({ economiaDoUsuario } = (await h.load('../../server/db/repositories/metrics')) as any)
  await limparTudo()
})
afterAll(async () => {
  await fecharStore()
  await h?.cleanup?.()
})

/** O mesmo payload que `Play.aoTerminar` monta para uma rodada sem cartão (itens de jogo). */
function payload(report: RoundReport, roundId: string) {
  return {
    roundId,
    exerciseKind: report.gameId,
    origem: 'baralho',
    score: report.score,
    itens: report.items.map((o) => ({ itemRef: o.itemRef, correct: o.correct ? 1 : 0, kind: 'drill' })),
  }
}

const RODADAS: Array<[string, RoundReport]> = [
  [
    'imperfeita',
    {
      gameId: 'escuta',
      score: 10,
      durationMs: 1000,
      items: [
        { itemRef: 'a', correct: true, attempts: 1, ms: 900 },
        { itemRef: 'b', correct: false, attempts: 1, ms: 900 },
        { itemRef: 'c', correct: true, attempts: 1, ms: 900 },
        { itemRef: 'd', correct: false, attempts: 1, ms: 900 },
      ],
    },
  ],
  [
    'perfeita',
    {
      gameId: 'escuta',
      score: 40,
      durationMs: 1000,
      items: Array.from({ length: 4 }, (_, i) => ({ itemRef: `p${i}`, correct: true, attempts: 1, ms: 900 })),
    },
  ],
]

describe('ganho da rodada: tela == crédito', () => {
  for (const [nome, report] of RODADAS) {
    it(`rodada ${nome}: a diferença no perfil é o ganho mostrado, nos dois servidores`, async () => {
      const ganho = ganhoDaRodada(report)
      const roundId = `escuta-ganho-${nome}`

      const antesExpress = economiaDeMetricas((await economiaDoUsuario(U)).metricas)
      await exerciseResultsRepo.addRodada(U, payload(report, roundId))
      const depoisExpress = economiaDeMetricas((await economiaDoUsuario(U)).metricas)

      const antesEfemero = economiaDeMetricas(await perfilEfemero(null))
      await servidorEfemero('/api/exercises/rodada', { method: 'POST', body: JSON.stringify(payload(report, roundId)) })
      const depoisEfemero = economiaDeMetricas(await perfilEfemero(null))

      expect(depoisExpress.xp - antesExpress.xp).toBe(ganho.xp)
      expect(depoisExpress.ganhas - antesExpress.ganhas).toBe(ganho.seeds)
      expect(depoisEfemero.xp - antesEfemero.xp).toBe(ganho.xp)
      expect(depoisEfemero.ganhas - antesEfemero.ganhas).toBe(ganho.seeds)
    })
  }

  it('item de jogo SRS gravado como `srs` não conta de novo como item de jogo no efêmero', async () => {
    // O item SRS vira revisão (review_logs / revisoes); a linha `srs` é só telemetria. O Express já
    // filtrava por `kind === 'drill'`; o efêmero contava as duas e inflava o XP do modo sem conta.
    const antes = economiaDeMetricas(await perfilEfemero(null))
    await servidorEfemero('/api/exercises/rodada', {
      method: 'POST',
      body: JSON.stringify({
        roundId: 'memory-srs-1',
        exerciseKind: 'memory',
        origem: 'baralho',
        itens: [{ itemRef: 'x', correct: 1, kind: 'srs' }],
      }),
    })
    const depois = economiaDeMetricas(await perfilEfemero(null))
    expect(depois.xp).toBe(antes.xp)
  })
})
