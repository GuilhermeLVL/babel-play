/**
 * ECONOMIA v2 (A7) — as rotas que faltavam no servidor real.
 *
 * O bug que este arquivo impede de voltar: o cliente chamava POST /api/metrics/presenca e
 * POST /api/metrics/seeds/creditar desde 2026-08-28, o servidor Express respondia 404, e na
 * conta logada NENHUMA conquista desbloqueava (conquistas.ts, corretamente, não marca sem o
 * crédito confirmado). Os contratos presos:
 *
 * 1. Crédito é idempotente por (usuário, creditoId) — reenvio devolve os mesmos totais.
 * 1b. E o VALOR vem da regra da conquista, não do corpo (mudança servidor-e-autoridade): o
 *     `creditoId` tem de resolver para uma conquista do catálogo, e as conferíveis pelo servidor
 *     ainda precisam ter a condição cumprida.
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
  /* `colecionador` depende de estado que só o navegador tem (eventos raros vistos), então está
     FORA de `CONQUISTAS_CONFERIVEIS` — é a conquista certa para exercitar idempotência sem ter de
     montar a condição no banco. O valor, mesmo assim, vem da regra: 100 Seeds e 120 XP. */
  const CREDITO = { creditoId: 'conquista-colecionador', reason: 'conquista' }

  it('credita uma vez; reenvio devolve jaExistia e os MESMOS totais', async () => {
    const r1 = mockRes()
    await handler('/seeds/creditar')(req(CREDITO, 'u-c1'), r1)
    expect(r1.statusCode).toBe(200)
    expect(r1.body).toMatchObject({ jaExistia: false, seedsCreditadas: 100, xpCreditado: 120 })

    const r2 = mockRes()
    await handler('/seeds/creditar')(req(CREDITO, 'u-c1'), r2)
    expect(r2.body).toMatchObject({ jaExistia: true, seedsCreditadas: 100, xpCreditado: 120 })
  })

  it('o creditoId de um usuário não bloqueia o de outro (unicidade POR usuário)', async () => {
    const r1 = mockRes(); await handler('/seeds/creditar')(req(CREDITO, 'u-c2'), r1)
    const r2 = mockRes(); await handler('/seeds/creditar')(req(CREDITO, 'u-c3'), r2)
    expect(r1.body.jaExistia).toBe(false)
    expect(r2.body.jaExistia).toBe(false)
  })

  /* ── AS TRÊS DEFESAS NOVAS (mudança servidor-e-autoridade) ──────────────────
     Até 01/09 esta rota creditava o `amount` e o `xp` do corpo, com um `creditoId` que era
     qualquer string de 8 a 80 caracteres: 10.000 Seeds e 10.000 XP por request, e o XP entra
     direto no nível. A suíte antiga não pegava, porque testava contabilidade e não autorização. */

  it('o VALOR vem da regra, não do corpo — mandar 10.000 credita o que a conquista vale', async () => {
    const r = mockRes()
    await handler('/seeds/creditar')(req({ ...CREDITO, amount: 10_000, xp: 10_000 }, 'u-c4'), r)
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({ seedsCreditadas: 100, xpCreditado: 120 })
  })

  it('creditoId inventado é recusado — era por aqui que se cunhava moeda', async () => {
    const r = mockRes()
    await handler('/seeds/creditar')(req({ creditoId: 'conquista-dinheiro-infinito', reason: 'x' }, 'u-c5'), r)
    expect(r.statusCode).toBe(400)
  })

  it('conquista conferível e ainda não cumprida é recusada', async () => {
    // `primeira-captura` exige uma sessão gravada; este usuário não tem nenhuma.
    const r = mockRes()
    await handler('/seeds/creditar')(req({ creditoId: 'conquista-primeira-captura', reason: 'x' }, 'u-c6'), r)
    expect(r.statusCode).toBe(400)
    /* O QUE FALTA vai em `detalhes`, no envelope único (`{ error, code?, detalhes? }`) — antes
       eram campos avulsos no topo, e cada rota batizava os seus do próprio jeito (achado A30). */
    expect(r.body.code).toBe('conquista_nao_cumprida')
    expect(r.body.detalhes).toMatchObject({ atual: 0, meta: 1 })
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
    await handler('/seeds/creditar')(req({ creditoId: 'conquista-colecionador', reason: 'c' }, u), mockRes())
    await handler('/presenca')(req({ dia: hoje - 1 }, u), mockRes())
    await handler('/presenca')(req({ dia: hoje }, u), mockRes())

    const p = await computeProfile(asUserId(u))
    expect(p.seedsCreditadas).toBe(100)
    expect(p.xpCreditado).toBe(120)
    expect(p.presencas).toBe(2)
    expect(p.streakPresenca).toBe(2)
    // Sem revisão nenhuma, streakDays viria 0 — aparecer também conta (regra do efêmero).
    expect(p.streakDays).toBe(2)
  })
})
