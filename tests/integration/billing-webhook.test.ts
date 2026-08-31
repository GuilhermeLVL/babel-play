/**
 * WEBHOOK DO ASAAS (E3) — os contratos de DINHEIRO, presos por teste antes do sandbox.
 *
 * 1. Evento repetido NÃO promove duas vezes (entrega é at-least-once; a doc do Asaas manda
 *    idempotência pelo id do evento).
 * 2. Token errado = 401; sem token configurado = 501 e NADA processa — qualquer POST da internet
 *    promovendo plano seria o pior bug possível.
 * 3. Pagamento confirma → o plano da INTENÇÃO (gravado por /assinar) ativa; atraso → past_due
 *    (a graça de subConcede mantém o acesso até o fim do período); estorno → canceled.
 * 4. Falha NOSSA depois da marca de idempotência desmarca e responde 500 — senão a reentrega
 *    seria "repetida" e a promoção do assinante se perderia para sempre.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let asaasWebhookRouter: any
let subs: any
let entitlements: any

const SEGREDO = 'segredo-webhook-teste'

function handler(): (req: any, res: any) => Promise<void> {
  const camada = asaasWebhookRouter.stack.find((l: any) => l.route?.path === '/' && l.route?.methods?.post)
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}
const req = (body: unknown, token: string | undefined = SEGREDO) => ({
  body,
  header: (k: string) => (k.toLowerCase() === 'asaas-access-token' ? token : undefined),
})
const evento = (id: string, event: string, userId: string) => ({
  id, event, payment: { id: `pay_${id}`, externalReference: userId },
})

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  process.env.ASAAS_WEBHOOK_TOKEN = SEGREDO
  ;({ asaasWebhookRouter } = (await h.load('../../server/routes/billing')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  entitlements = (await h.load('../../server/lib/entitlements')) as any
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  delete process.env.ASAAS_WEBHOOK_TOKEN
  await h.cleanup()
})
afterEach(() => vi.restoreAllMocks())

describe('autenticação do webhook', () => {
  it('token errado → 401, e nada é processado', async () => {
    const res = mockRes()
    await handler()(req(evento('evt_a1', 'PAYMENT_CONFIRMED', 'u-w1'), 'token-falso'), res)
    expect(res.statusCode).toBe(401)
    expect(await subs.getActive(asUserId('u-w1'))).toBeNull()
  })

  it('sem segredo configurado → 501, NUNCA processa', async () => {
    delete process.env.ASAAS_WEBHOOK_TOKEN
    const res = mockRes()
    await handler()(req(evento('evt_a2', 'PAYMENT_CONFIRMED', 'u-w2')), res)
    expect(res.statusCode).toBe(501)
    expect(await subs.getActive(asUserId('u-w2'))).toBeNull()
    process.env.ASAAS_WEBHOOK_TOKEN = SEGREDO
  })
})

describe('o ciclo de vida do plano', () => {
  it('pagamento confirmado ativa o plano da INTENÇÃO gravada por /assinar', async () => {
    const u = asUserId('u-ciclo')
    await subs.upsert(u, { plan: 'pro', status: 'trialing', provider: 'asaas' })
    const res = mockRes()
    await handler()(req(evento('evt_c1', 'PAYMENT_CONFIRMED', 'u-ciclo')), res)
    expect(res.statusCode).toBe(200)
    const sub = await subs.getActive(u)
    expect(sub.plan).toBe('pro')
    expect(sub.status).toBe('active')
    expect(sub.currentPeriodEnd).toBeGreaterThan(Date.now())
    // E o entitlement REAL passa a valer — o que o assinante comprou.
    expect(await entitlements.hasEntitlement(u, 'managedCloudStt')).toBe(true)
  })

  it('IDEMPOTÊNCIA: o mesmo evento duas vezes = uma promoção, segunda resposta marca repetido', async () => {
    const u = asUserId('u-idem')
    await subs.upsert(u, { plan: 'essencial', status: 'trialing' })
    await handler()(req(evento('evt_i1', 'PAYMENT_CONFIRMED', 'u-idem')), mockRes())
    const primeiraJanela = (await subs.getActive(u)).currentPeriodEnd

    const res2 = mockRes()
    await handler()(req(evento('evt_i1', 'PAYMENT_CONFIRMED', 'u-idem')), res2)
    expect(res2.statusCode).toBe(200)
    expect(res2.body?.repetido).toBe(true)
    // O período NÃO foi re-esticado: o efeito aconteceu uma vez só.
    expect((await subs.getActive(u)).currentPeriodEnd).toBe(primeiraJanela)
  })

  it('atraso → past_due; estorno → canceled', async () => {
    const u = asUserId('u-vida')
    await subs.upsert(u, { plan: 'pro', status: 'active' })
    await handler()(req(evento('evt_v1', 'PAYMENT_OVERDUE', 'u-vida')), mockRes())
    expect((await subs.getActive(u)).status).toBe('past_due')
    await handler()(req(evento('evt_v2', 'PAYMENT_REFUNDED', 'u-vida')), mockRes())
    expect((await subs.getActive(u)).status).toBe('canceled')
  })

  it('evento sem externalReference é auditado e não tem efeito', async () => {
    const res = mockRes()
    await handler()(req({ id: 'evt_s1', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_x' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body?.semUsuario).toBe(true)
  })
})

describe('falha nossa depois da marca', () => {
  it('desmarca e responde 500 — a reentrega do Asaas NÃO é tratada como repetida', async () => {
    const u = asUserId('u-falha')
    await subs.upsert(u, { plan: 'pro', status: 'trialing' })

    // 1ª entrega: o upsert do plano falha DEPOIS da marca de idempotência.
    const original = subs.upsert
    const spy = vi.spyOn(subs, 'upsert').mockRejectedValueOnce(new Error('banco caiu'))
    const res1 = mockRes()
    await handler()(req(evento('evt_f1', 'PAYMENT_CONFIRMED', 'u-falha')), res1)
    expect(res1.statusCode).toBe(500)
    spy.mockRestore()
    subs.upsert = original

    // Reentrega: se a marca tivesse ficado presa, isto viria como `repetido` e o assinante
    // pagaria sem receber. Tem de PROCESSAR.
    const res2 = mockRes()
    await handler()(req(evento('evt_f1', 'PAYMENT_CONFIRMED', 'u-falha')), res2)
    expect(res2.statusCode).toBe(200)
    expect(res2.body?.repetido).toBeUndefined()
    expect((await subs.getActive(asUserId('u-falha'))).status).toBe('active')
  })
})
