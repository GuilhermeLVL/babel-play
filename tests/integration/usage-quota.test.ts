/** SaaS — quota fair-use: pro respeita o teto mensal; selfhost é ilimitado; erro degrada ABERTO. */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

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
  it('capForPlan: selfhost ∞, pro do env (default 1000), free 0', () => {
    expect(quota.capForPlan('selfhost')).toBe(Infinity)
    expect(quota.capForPlan('pro')).toBe(1000)
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
