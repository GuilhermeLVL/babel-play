/**
 * ECONOMIA v2 (A7) — as rotas que faltavam no servidor real.
 *
 * O bug que este arquivo impede de voltar: o cliente chamava POST /api/metrics/presenca e
 * POST /api/metrics/seeds/creditar desde 2026-08-28, o servidor Express respondia 404, e na
 * conta logada NENHUMA conquista desbloqueava (conquistas.ts, corretamente, não marca sem o
 * crédito confirmado). Os contratos presos:
 *
 * 1. Crédito é idempotente por (usuário, creditoId) — reenvio devolve os mesmos totais.
 * 2. Presença é idempotente por (usuário, dia local) e devolve a sequência atual.
 * 3. Dia fora da janela de fuso plausível é 400 — não presença retroativa.
 * 4. O perfil (`computeProfile`) reflete créditos e presença, como o servidor efêmero.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'
import { diaLocal } from '../../src/core/learning/economia'

let h: EphemeralDb
let metricsRouter: any
let computeProfile: any

function handler(caminho: string): (req: any, res: any) => Promise<void> {
  const camada = metricsRouter.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.post)
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}
const req = (body: unknown, u = 'u-eco') => ({ userId: asUserId(u), body, requestId: 'req-eco', path: '/x' })

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ metricsRouter } = (await h.load('../../server/routes/metrics')) as any)
  ;({ computeProfile } = (await h.load('../../server/db/repositories/metrics')) as any)
})
afterAll(async () => { await h.cleanup() })

describe('POST /api/metrics/seeds/creditar', () => {
  it('credita uma vez; reenvio devolve jaExistia e os MESMOS totais', async () => {
    const corpo = { creditoId: 'conquista:primeira-captura', amount: 25, xp: 50, reason: 'conquista' }
    const r1 = mockRes()
    await handler('/seeds/creditar')(req(corpo, 'u-c1'), r1)
    expect(r1.statusCode).toBe(200)
    expect(r1.body).toMatchObject({ jaExistia: false, seedsCreditadas: 25, xpCreditado: 50 })

    const r2 = mockRes()
    await handler('/seeds/creditar')(req(corpo, 'u-c1'), r2)
    expect(r2.body).toMatchObject({ jaExistia: true, seedsCreditadas: 25, xpCreditado: 50 })
  })

  it('o creditoId de um usuário não bloqueia o de outro (unicidade POR usuário)', async () => {
    const corpo = { creditoId: 'conquista:compartilhada-x', amount: 10, xp: 0, reason: 'conquista' }
    const r1 = mockRes(); await handler('/seeds/creditar')(req(corpo, 'u-c2'), r1)
    const r2 = mockRes(); await handler('/seeds/creditar')(req(corpo, 'u-c3'), r2)
    expect(r1.body.jaExistia).toBe(false)
    expect(r2.body.jaExistia).toBe(false)
  })

  it('amount negativo não passa da validação (ganho não tem porta dos fundos)', async () => {
    const r = mockRes()
    await handler('/seeds/creditar')(req({ creditoId: 'conquista:negativa-1', amount: -5, reason: 'x' }), r)
    expect(r.statusCode).toBe(400)
  })
})

describe('POST /api/metrics/presenca', () => {
  it('marca o dia uma vez e devolve a sequência; reenvio não duplica', async () => {
    const hoje = diaLocal(Date.now())
    const r1 = mockRes()
    await handler('/presenca')(req({ dia: hoje }, 'u-p1'), r1)
    expect(r1.body).toMatchObject({ jaExistia: false, dia: hoje, streakPresenca: 1 })

    const r2 = mockRes()
    await handler('/presenca')(req({ dia: hoje }, 'u-p1'), r2)
    expect(r2.body).toMatchObject({ jaExistia: true, streakPresenca: 1 })
  })

  it('ontem + hoje = sequência de 2', async () => {
    const hoje = diaLocal(Date.now())
    await handler('/presenca')(req({ dia: hoje - 1 }, 'u-p2'), mockRes())
    const r = mockRes()
    await handler('/presenca')(req({ dia: hoje }, 'u-p2'), r)
    expect(r.body.streakPresenca).toBe(2)
  })

  it('dia inventado (fora da janela de fuso) → 400', async () => {
    const r = mockRes()
    await handler('/presenca')(req({ dia: diaLocal(Date.now()) - 30 }, 'u-p3'), r)
    expect(r.statusCode).toBe(400)
  })
})

describe('computeProfile reflete a economia', () => {
  it('devolve seedsCreditadas, xpCreditado e presença — e a ofensiva usa a MAIOR', async () => {
    const u = 'u-perfil-eco'
    const hoje = diaLocal(Date.now())
    await handler('/seeds/creditar')(req({ creditoId: 'conquista:perfil-1', amount: 7, xp: 30, reason: 'c' }, u), mockRes())
    await handler('/presenca')(req({ dia: hoje - 1 }, u), mockRes())
    await handler('/presenca')(req({ dia: hoje }, u), mockRes())

    const p = await computeProfile(asUserId(u))
    expect(p.seedsCreditadas).toBe(7)
    expect(p.xpCreditado).toBe(30)
    expect(p.presencas).toBe(2)
    expect(p.streakPresenca).toBe(2)
    // Sem revisão nenhuma, streakDays viria 0 — aparecer também conta (regra do efêmero).
    expect(p.streakDays).toBe(2)
  })
})
