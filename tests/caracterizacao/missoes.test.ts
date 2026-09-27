/**
 * CARACTERIZACAO — `GET /api/metrics/missoes` (recompensas v2, onda 5) por HTTP, no modo
 * self-host: as três missões do dia no fuso pedido, a meta e a ofensiva com congelamento. As regras
 * têm teste de unidade e de integração (`tests/missoes.test.ts`,
 * `tests/integration/economia-missoes.test.ts`); aqui fica a FORMA da resposta pela pilha inteira.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, forma, semear, subirApp } from './_app'

const DONO = 'local-owner'

describe('missões do dia por HTTP (modo self-host)', () => {
  let s: AppDeTeste

  beforeAll(async () => {
    s = await subirApp({ modo: 'self-host' })
    await semear(s, DONO)
    const { asUserId } = await s.load('../../server/lib/authContext')
    const { exerciseResultsRepo } = await s.load('../../server/db/repositories/exerciseResults')
    // Uma rodada boa hoje, com a duração medida: conta no dia em que começou.
    await exerciseResultsRepo.addRodada(asUserId(DONO), {
      roundId: 'missao-0',
      exerciseKind: 'blitz',
      origem: 'baralho',
      score: 100,
      melhorSequencia: 5,
      duracaoMs: 60_000,
      itens: Array.from({ length: 10 }, (_, i) => ({ itemRef: `mi-${i}`, correct: 1, kind: 'drill' })),
    })
  })
  afterAll(async () => {
    await s.encerrar()
  })

  it('GET /api/metrics/missoes devolve as três missões do dia, a meta e a ofensiva', async () => {
    const r = await s.get('/api/metrics/missoes?fuso=America%2FSao_Paulo')
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo.missoes).toHaveLength(3)
    expect(corpo.recompensa).toEqual({ seeds: 15, xp: 20 })
    expect(typeof corpo.metaConcluida).toBe('boolean')
    expect(corpo.metaCreditada).toBe(false)
    expect([0, 1, 2]).toContain(corpo.congelamentos)
    await expect(JSON.stringify({ status: r.status, forma: forma(corpo) }, null, 2)).toMatchFileSnapshot(
      '__snapshots__/get.metrics.missoes.json',
    )
  })
})
