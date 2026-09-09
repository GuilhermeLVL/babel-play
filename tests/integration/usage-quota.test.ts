/** SaaS — quota fair-use: pro respeita o teto mensal; selfhost é ilimitado; erro degrada ABERTO. */
import { afterAll, afterEach,beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb,setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let quota: any
let subs: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  quota = await h.load('../../server/lib/usageQuota')
  ;({ subscriptionsRepo: subs } = await h.load('../../server/db/repositories/subscriptions'))
})
afterAll(async () => { await h.cleanup() })
afterEach(() => { delete process.env.AUTH_REQUIRED; delete process.env.PRO_MONTHLY_MANAGED_CALLS })

describe('usageQuota', () => {
  it('capForPlan: selfhost ∞, pro do env (default 12.000), free 0', () => {
    expect(quota.capForPlan('selfhost')).toBe(Infinity)
    /* Era 1.000, e isso entregava ~50 MINUTOS de conversa por mês: três rotas dividem este contador
       e cada fala ao microfone gasta DUAS chamadas (transcrever + traduzir). 12.000 ≈ 6.000 falas
       ≈ 10 h — o perfil do usuário pesado, ~US$ 0,64/mês ao preço medido. */
    expect(quota.capForPlan('pro')).toBe(12_000)
    process.env.PRO_MONTHLY_MANAGED_CALLS = '3'
    expect(quota.capForPlan('pro')).toBe(3)
    expect(quota.capForPlan('free')).toBe(0)
  })

  it('pro abaixo do teto reserva; no teto recusa', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.PRO_MONTHLY_MANAGED_CALLS = '2'
    const u = asUserId('q-pro')
    await subs.upsert(u, { plan: 'pro', status: 'active' })
    expect(await quota.reserveManagedCall(u)).toBe(true)   // 1/2
    expect(await quota.reserveManagedCall(u)).toBe(true)   // 2/2
    expect(await quota.reserveManagedCall(u)).toBe(false)  // no teto
  })

  it('selfhost (modo local) nunca bloqueia', async () => {
    process.env.AUTH_REQUIRED = '0'
    const u = asUserId('q-self')
    expect(await quota.reserveManagedCall(u)).toBe(true)
  })
})
