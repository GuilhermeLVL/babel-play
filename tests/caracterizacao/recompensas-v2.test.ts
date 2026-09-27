/**
 * CARACTERIZACAO — as duas rotas das recompensas v2 por HTTP, no modo self-host: a maestria por
 * jogo (onda 3) e o reembolso do corte do catálogo (onda 2). As regras em si têm teste de unidade
 * e de integração (`tests/maestria.test.ts`, `tests/integration/economia-reembolso.test.ts`); aqui
 * fica a FORMA da resposta pela pilha HTTP inteira, para detectar mudança.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, forma, semear, subirApp } from './_app'

const DONO = 'local-owner'

describe('recompensas v2 por HTTP (modo self-host)', () => {
  let s: AppDeTeste

  beforeAll(async () => {
    s = await subirApp({ modo: 'self-host' })
    await semear(s, DONO)
    const { asUserId } = await s.load('../../server/lib/authContext')
    const { exerciseResultsRepo } = await s.load('../../server/db/repositories/exerciseResults')
    const { seedSpendsRepo } = await s.load('../../server/db/repositories/seedSpends')
    // Três rodadas perfeitas de Termo: rendem pontos de maestria.
    for (let n = 0; n < 3; n++) {
      await exerciseResultsRepo.addRodada(asUserId(DONO), {
        roundId: `maestria-${n}`,
        exerciseKind: 'termo',
        origem: 'baralho',
        score: 100,
        melhorSequencia: 10,
        itens: Array.from({ length: 10 }, (_, i) => ({ itemRef: `m${n}-${i}`, correct: 1, kind: 'drill' })),
      })
    }
    // Um gasto antigo num cursor que saiu do catálogo: o reembolso é devido.
    await seedSpendsRepo.debitar(asUserId(DONO), { spendId: 'antigo-cur-cafe', amount: 45, reason: 'loja:cur-cafe' })
  })
  afterAll(async () => {
    await s.encerrar()
  })

  it('GET /api/metrics/maestria devolve os jogos com pontos e nível, e os créditos já lançados', async () => {
    const r = await s.get('/api/metrics/maestria')
    expect(r.status).toBe(200)
    const corpo = await r.json()
    const termo = corpo.jogos.find((j: { jogo: string }) => j.jogo === 'termo')
    expect(termo.pontos).toBeGreaterThan(0)
    expect(Array.isArray(corpo.creditados)).toBe(true)
    await expect(JSON.stringify({ status: r.status, forma: forma(corpo) }, null, 2)).toMatchFileSnapshot(
      '__snapshots__/get.metrics.maestria.json',
    )
  })

  it('POST /api/metrics/seeds/reembolso credita o gasto do item removido uma vez só', async () => {
    const r1 = await s.post('/api/metrics/seeds/reembolso', {})
    expect(r1.status).toBe(200)
    const c1 = await r1.json()
    expect(c1.creditado).toBe(45)
    expect(c1.reembolsado).toBe(45)
    const r2 = await s.post('/api/metrics/seeds/reembolso', {})
    const c2 = await r2.json()
    expect(c2.creditado).toBe(0)
    expect(c2.reembolsado).toBe(45)
    await expect(JSON.stringify({ status: r1.status, forma: forma(c1) }, null, 2)).toMatchFileSnapshot(
      '__snapshots__/post.metrics.seeds.reembolso.json',
    )
  })
})
