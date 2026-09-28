/**
 * CARACTERIZACAO — a temporada com datas (recompensas v2, onda 5) por HTTP, no modo self-host:
 * `GET /api/metrics/temporada` e o crédito de uma casa pela rota de crédito. As regras têm teste de
 * unidade (`tests/temporada.test.ts`) e de integração (`tests/integration/economia-atomica.test.ts`);
 * aqui fica a FORMA da resposta pela pilha HTTP inteira, para detectar mudança.
 *
 * Só o `Date` é falso: o relógio fica dentro da Temporada 1, e as rodadas gravadas ganham carimbo
 * dentro da janela.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type AppDeTeste, forma, semear, subirApp } from './_app'

const DONO = 'local-owner'

describe('temporada por HTTP (modo self-host)', () => {
  let s: AppDeTeste

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'))
    s = await subirApp({ modo: 'self-host' })
    await semear(s, DONO)
    const { asUserId } = await s.load('../../server/lib/authContext')
    const { exerciseResultsRepo } = await s.load('../../server/db/repositories/exerciseResults')
    // Cinco rodadas perfeitas de 20 itens: 5 × 60 XP = 300 dentro da janela (nível 2).
    for (let n = 0; n < 5; n++) {
      await exerciseResultsRepo.addRodada(asUserId(DONO), {
        roundId: `temporada-${n}`,
        exerciseKind: 'termo',
        origem: 'baralho',
        score: 100,
        melhorSequencia: 20,
        itens: Array.from({ length: 20 }, (_, i) => ({ itemRef: `t${n}-${i}`, correct: 1, kind: 'drill' })),
      })
    }
  })
  afterAll(async () => {
    await s.encerrar()
    vi.useRealTimers()
  })

  it('GET /api/metrics/temporada devolve a temporada, o XP da janela, o nível e as casas creditadas', async () => {
    const r = await s.get('/api/metrics/temporada')
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo.temporada.id).toBe('t1')
    expect(corpo.xp).toBeGreaterThanOrEqual(300)
    expect(corpo.nivel).toBeGreaterThanOrEqual(2)
    // Self-host não é assinatura: só a trilha grátis.
    expect(corpo.assinante).toBe(false)
    await expect(JSON.stringify({ status: r.status, forma: forma(corpo) }, null, 2)).toMatchFileSnapshot(
      '__snapshots__/get.metrics.temporada.json',
    )
  })

  it('a casa grátis alcançada credita; a de assinante é 403 sem assinatura', async () => {
    const gratis = await s.post('/api/metrics/seeds/creditar', { creditoId: 'temporada:t1:2:gratis' })
    expect(gratis.status).toBe(200)
    const assinante = await s.post('/api/metrics/seeds/creditar', { creditoId: 'temporada:t1:1:assinante' })
    expect(assinante.status).toBe(403)
    expect((await assinante.json()).code).toBe('exige_assinatura')

    const depois = await (await s.get('/api/metrics/temporada')).json()
    expect(depois.creditados).toEqual(['temporada:t1:2:gratis'])
  })
})
