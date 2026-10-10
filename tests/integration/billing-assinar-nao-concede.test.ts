/**
 * GAP-001 (auditoria 2026-09-13, provado em openspec/audits/2026-09-13-pre-deploy/evidencias/poc-billing.txt).
 *
 * `POST /api/billing/assinar` grava a INTENÇÃO como `status: 'trialing'` — e o servidor tratava
 * `trialing` como CONCESSÃO (entitlements.subConcede). Resultado: qualquer conta virava o plano
 * pedido só por INICIAR o checkout, sem pagar. Nada legítimo produz `trialing` (o webhook grava
 * `active`, a rota admin grava `active`): `trialing` == "checkout iniciado, não pago" == sem direito.
 *
 * Invariante desta suíte: SÓ pagamento confirmado (status `active`, ou `past_due` na graça) concede.
 * O caminho feliz do webhook continua coberto por billing-webhook.test.ts.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let ent: any
let subs: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ent = await h.load('../../server/lib/entitlements')
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  await h.cleanup()
})
afterEach(() => {
  process.env.AUTH_REQUIRED = '1'
})

describe('GAP-001 — iniciar assinatura não concede o plano', () => {
  it('assinatura trialing (o que /assinar grava) NÃO concede o plano', async () => {
    const u = asUserId('u-trialing-novo')
    // Exatamente o que POST /api/billing/assinar grava para um usuário novo:
    await subs.upsert(u, { plan: 'premium', status: 'trialing', provider: 'asaas', providerSubscriptionId: 'sub_x' })
    expect(await ent.getPlanForUser(u), 'trialing = checkout iniciado, não pago → sem plano').toBe('free')
    const e = await ent.getEntitlementsForUser(u)
    expect(e.managedCloudLlm).toBe(false)
  })

  it('pagamento confirmado (status active) concede', async () => {
    const u = asUserId('u-pago')
    await subs.upsert(u, { plan: 'premium', status: 'active' })
    expect(await ent.getPlanForUser(u)).toBe('premium')
  })

  it('past_due dentro da graça mantém; expirada cai para free', async () => {
    const uGraca = asUserId('u-graca-2')
    await subs.upsert(uGraca, { plan: 'premium', status: 'past_due', currentPeriodEnd: Date.now() + 60_000 })
    expect(await ent.getPlanForUser(uGraca)).toBe('premium')
    const uExp = asUserId('u-exp-2')
    await subs.upsert(uExp, { plan: 'premium', status: 'past_due', currentPeriodEnd: Date.now() - 60_000 })
    expect(await ent.getPlanForUser(uExp)).toBe('free')
  })

  it('o nome antigo ativo vale Premium; a mesma linha em trialing não concede nada', async () => {
    // A linha com o nome antigo (`pro`) ativa é o Premium — e a leitura tolerante não abre a porta do
    // GAP-001: em `trialing` (checkout iniciado, não pago) continua sem plano. (Na matriz v3 o
    // `essencial` deixou de ser nome antigo: é um plano, e a linha ativa nele concede ELE.)
    const u = asUserId('u-upgrade')
    await subs.upsert(u, { plan: 'pro', status: 'active' })
    expect(await ent.getPlanForUser(u)).toBe('premium')
    await subs.upsert(u, { plan: 'pro', status: 'trialing' })
    expect(await ent.getPlanForUser(u), 'intenção não paga não concede, com nome antigo ou novo').toBe('free')
  })
})
