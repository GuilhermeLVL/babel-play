/**
 * O REEMBOLSO DO CORTE DO CATÁLOGO NO EXPRESS (recompensas v2, Task 2.3).
 *
 * O ponto que só o banco prova: dois pedidos SIMULTÂNEOS (duas abas abrindo o app v2 juntas)
 * gravam UM crédito por gasto. Quem garante é o índice único (usuário, `credito_id`) de
 * `seed_credits` — o `ON CONFLICT DO NOTHING` do segundo INSERT não soma em `creditado`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let metricsRouter: any
let seedSpendsRepo: any
let economiaRepo: any
let creditsRepo: any

function handler(caminho: string): (req: any, res: any) => Promise<void> {
  const camada = metricsRouter.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.post)
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => {
    r.statusCode = c
    return r
  }
  r.json = (b: any) => {
    r.body = b
    return r
  }
  return r
}
const req = (u: string) => ({ userId: asUserId(u), body: {}, requestId: 'req-reembolso', path: '/seeds/reembolso' })

async function reembolsar(u: string) {
  const r = mockRes()
  await handler('/seeds/reembolso')(req(u), r)
  return r
}

/** O razão de quem comprou ANTES do corte — a rota de gasto de hoje recusaria estes motivos. */
async function gastosAntigos(u: string) {
  await seedSpendsRepo.debitar(asUserId(u), { spendId: 'loja-cur-pato', amount: 100, reason: 'loja:cur-pato' })
  await seedSpendsRepo.debitar(asUserId(u), { spendId: 'loja-pack-animais', amount: 50, reason: 'loja:pack-animais' })
  await seedSpendsRepo.debitar(asUserId(u), { spendId: 'apr-particulas-n1', amount: 50, reason: 'aprimoramento:particulas:1' })
  await seedSpendsRepo.debitar(asUserId(u), { spendId: 'loja-tema-linear', amount: 60, reason: 'loja:tema-linear' })
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ metricsRouter } = (await h.load('../../server/routes/metrics')) as any)
  ;({ seedSpendsRepo } = (await h.load('../../server/db/repositories/seedSpends')) as any)
  ;({ economiaRepo } = (await h.load('../../server/db/repositories/economia')) as any)
  ;({ creditsRepo } = (await h.load('../../server/db/repositories/credits')) as any)
})
afterAll(async () => {
  await h.cleanup()
})

describe('POST /api/metrics/seeds/reembolso', () => {
  it('devolve o gasto em item removido, uma vez; o que continua no catálogo não volta', async () => {
    const u = 'u-reembolso-1'
    await gastosAntigos(u)
    const a = await reembolsar(u)
    expect(a.statusCode).toBe(200)
    expect(a.body).toMatchObject({ creditado: 200, reembolsado: 200, seedsCreditadas: 200 })
    const b = await reembolsar(u)
    expect(b.body).toMatchObject({ creditado: 0, reembolsado: 200, seedsCreditadas: 200 })
  })

  it('dois pedidos simultâneos (duas abas) gravam um crédito por gasto', async () => {
    const u = 'u-reembolso-concorrente'
    await gastosAntigos(u)
    const [a, b] = await Promise.all([reembolsar(u), reembolsar(u)])
    expect(a.body.creditado + b.body.creditado).toBe(200)
    const linhas = await economiaRepo.reembolsos(asUserId(u))
    expect(linhas).toHaveLength(3)
    expect(linhas.reduce((n: number, l: { amount: number }) => n + l.amount, 0)).toBe(200)
  })

  it('sem gasto de item removido, nada a devolver', async () => {
    const r = await reembolsar('u-reembolso-vazio')
    expect(r.body).toMatchObject({ creditado: 0, reembolsado: 0 })
  })

  it('o que foi pago com Créditos e saiu vira o equivalente na posse premium', async () => {
    const u = 'u-premium-dourado'
    const { db } = (await h.load('../../server/db/db')) as any
    const { creditSpends } = (await h.load('../../server/db/schema')) as any
    const agora = Date.now()
    await db.insert(creditSpends).values({
      id: 'cs-1', createdAt: agora, updatedAt: agora, userId: u, spendId: 'premium-dourada-3', amount: 150, reason: 'premium:dourada-3',
    })
    expect(await creditsRepo.itensPremium(asUserId(u))).toEqual(['dourada-8'])
  })

  it('P0: Créditos nunca abrem exclusivo de conquista — nem por um gasto `premium:` gravado à mão', async () => {
    const u = 'u-premium-aurora'
    const { db } = (await h.load('../../server/db/db')) as any
    const { creditSpends } = (await h.load('../../server/db/schema')) as any
    const { recusaDePosse } = (await h.load('../../server/lib/posseDeCosmeticos')) as any
    const agora = Date.now()
    await db.insert(creditSpends).values({
      id: 'cs-aurora', createdAt: agora, updatedAt: agora, userId: u, spendId: 'premium-aurora', amount: 100, reason: 'premium:tema-aurora',
    })
    expect(await creditsRepo.itensPremium(asUserId(u))).toEqual([])
    // Mesmo com a posse premium dizendo "tema-aurora", a conquista é conferida antes.
    const recusa = await recusaDePosse(asUserId(u), 'tema', 'aurora', {
      nivel: 99, comprados: [], conquistas: [], premium: ['tema-aurora'],
    })
    expect(recusa?.motivo).toMatch(/conquista/)
  })

  it('removida sem equivalente livre: os Créditos voltam, uma vez', async () => {
    const u = 'u-premium-cheio'
    const { db } = (await h.load('../../server/db/db')) as any
    const { creditSpends } = (await h.load('../../server/db/schema')) as any
    const agora = Date.now()
    const vitrine = ['dourada-2', 'dourada-6', 'dourada-8', 'dourada-10']
    await db.insert(creditSpends).values([
      ...vitrine.map((id, n) => ({ id: `cs-v${n}`, createdAt: agora, updatedAt: agora, userId: u, spendId: `premium-${id}`, amount: 100, reason: `premium:${id}` })),
      { id: 'cs-d3', createdAt: agora + 1, updatedAt: agora + 1, userId: u, spendId: 'premium-dourada-3', amount: 150, reason: 'premium:dourada-3' },
    ])
    const antes = await creditsRepo.totalComprado(asUserId(u))
    const a = await reembolsar(u)
    expect(a.body.creditosDevolvidos).toBe(150)
    expect(await creditsRepo.totalComprado(asUserId(u))).toBe(antes + 150)
    const b = await reembolsar(u)
    expect(b.body.creditosDevolvidos).toBe(0)
    expect(await creditsRepo.totalComprado(asUserId(u))).toBe(antes + 150)
  })
})

describe('o aviso do reembolso é por CONTA (`avisoPendente`)', () => {
  it('pendente no pedido que creditou; depois, nunca mais — nem noutro aparelho', async () => {
    const u = 'u-aviso-1'
    await gastosAntigos(u)
    const a = await reembolsar(u)
    expect(a.body).toMatchObject({ creditado: 200, avisoPendente: true })
    const b = await reembolsar(u)
    expect(b.body).toMatchObject({ creditado: 0, avisoPendente: false })
  })

  it('duas abas ao mesmo tempo: o aviso sai em uma só', async () => {
    const u = 'u-aviso-concorrente'
    await gastosAntigos(u)
    const [a, b] = await Promise.all([reembolsar(u), reembolsar(u)])
    expect([a.body.avisoPendente, b.body.avisoPendente].filter(Boolean)).toHaveLength(1)
  })

  it('sem nada creditado não gasta o aviso: o reembolso que chegar depois ainda é anunciado', async () => {
    const u = 'u-aviso-tardio'
    expect((await reembolsar(u)).body).toMatchObject({ creditado: 0, avisoPendente: false })
    await gastosAntigos(u)
    expect((await reembolsar(u)).body).toMatchObject({ creditado: 200, avisoPendente: true })
  })
})

describe('o Passe da T1 que saiu (`passe-t1`)', () => {
  it('quem pagou recebe de volta o que faltava da promessa (1.134 − o já concedido), uma vez', async () => {
    const u = 'u-com-passe-pago'
    const { db } = (await h.load('../../server/db/db')) as any
    const { creditPurchases } = (await h.load('../../server/db/schema')) as any
    const agora = Date.now()
    await db.insert(creditPurchases).values([
      { id: 'cp-passe', createdAt: agora, updatedAt: agora, userId: u, sku: 'passe-t1', creditos: 0, valorCentavos: 1490, provider: 'asaas', providerPaymentId: 'pay-passe-1', status: 'pago', paidAt: agora },
      { id: 'cp-casa', createdAt: agora, updatedAt: agora, userId: u, sku: 'concessao', creditos: 34, valorCentavos: 0, provider: 'interno', providerPaymentId: 'passe:t1:premium-3', status: 'pago', paidAt: agora },
    ])
    const antes = await creditsRepo.totalComprado(asUserId(u))
    expect((await reembolsar(u)).body.creditosDevolvidos).toBe(1100)
    expect((await reembolsar(u)).body.creditosDevolvidos).toBe(0)
    expect(await creditsRepo.totalComprado(asUserId(u))).toBe(antes + 1100)
  })

  it('compra do passe não paga (pendente/cancelada) não devolve nada', async () => {
    const u = 'u-passe-pendente'
    const { db } = (await h.load('../../server/db/db')) as any
    const { creditPurchases } = (await h.load('../../server/db/schema')) as any
    const agora = Date.now()
    await db.insert(creditPurchases).values({
      id: 'cp-passe-p', createdAt: agora, updatedAt: agora, userId: u, sku: 'passe-t1', creditos: 0, valorCentavos: 1490, provider: 'asaas', providerPaymentId: 'pay-passe-2', status: 'pendente',
    })
    expect((await reembolsar(u)).body.creditosDevolvidos).toBe(0)
  })
})
