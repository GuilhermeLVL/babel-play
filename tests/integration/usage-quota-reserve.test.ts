/**
 * SaaS — quota fair-use com RESERVA (correção do P0-1).
 *
 * `reserveManagedCall` substitui o par `isWithinQuota` + `recordManagedCall`: decidir e
 * contabilizar viraram uma operação só, então o teto vale sob concorrência.
 * `refundManagedCall` devolve a vaga quando o provedor falha depois da reserva.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let quota: any
let subs: any
let repo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  quota = await h.load('../../server/lib/usageQuota')
  ;({ subscriptionsRepo: subs } = await h.load('../../server/db/repositories/subscriptions'))
  ;({ usageCountersRepo: repo } = await h.load('../../server/db/repositories/usageCounters'))
})
afterAll(async () => { await h.cleanup() })
afterEach(() => { delete process.env.AUTH_REQUIRED; delete process.env.PRO_MONTHLY_MANAGED_CALLS })

describe('reserveManagedCall', () => {
  it('pro abaixo do teto reserva; no teto recusa', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.PRO_MONTHLY_MANAGED_CALLS = '2'
    const u = asUserId('rq-pro')
    await subs.upsert(u, { plan: 'pro', status: 'active' })

    expect(await quota.reserveManagedCall(u)).toBe(true)   // 1/2
    expect(await quota.reserveManagedCall(u)).toBe(true)   // 2/2
    expect(await quota.reserveManagedCall(u)).toBe(false)  // cheio
  })

  it('free (teto 0) nunca reserva', async () => {
    process.env.AUTH_REQUIRED = '1'
    const u = asUserId('rq-free')
    expect(await quota.reserveManagedCall(u)).toBe(false)
  })

  it('selfhost (modo local) é ilimitado', async () => {
    process.env.AUTH_REQUIRED = '0'
    const u = asUserId('rq-self')
    for (let i = 0; i < 5; i++) expect(await quota.reserveManagedCall(u)).toBe(true)
  })

  /** O cenário exato medido na auditoria: 20 simultâneas contra teto 5. */
  it('20 reservas SIMULTÂNEAS contra teto 5 → exatamente 5 passam', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.PRO_MONTHLY_MANAGED_CALLS = '5'
    const u = asUserId('rq-corrida')
    await subs.upsert(u, { plan: 'pro', status: 'active' })

    const r = await Promise.all(Array.from({ length: 20 }, () => quota.reserveManagedCall(u)))
    expect(r.filter(Boolean)).toHaveLength(5)
  })

  it('mantém o fail-OPEN: falha de infra libera a chamada (política de fair-use)', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.PRO_MONTHLY_MANAGED_CALLS = '1'
    const u = asUserId('rq-failopen')
    await subs.upsert(u, { plan: 'pro', status: 'active' })

    // Simula o banco fora do ar NA RESERVA — é o caminho que degrada aberto de propósito.
    const boom = vi.spyOn(repo, 'reserve').mockRejectedValue(new Error('banco indisponível'))
    try {
      expect(await quota.reserveManagedCall(u)).toBe(true)
    } finally {
      boom.mockRestore()
    }
  })
})

describe('refundManagedCall', () => {
  it('devolve a vaga quando o provedor falha depois da reserva', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.PRO_MONTHLY_MANAGED_CALLS = '1'
    const u = asUserId('rq-estorno')
    await subs.upsert(u, { plan: 'pro', status: 'active' })

    expect(await quota.reserveManagedCall(u)).toBe(true)
    expect(await quota.reserveManagedCall(u)).toBe(false) // cheio

    await quota.refundManagedCall(u)
    expect(await quota.reserveManagedCall(u)).toBe(true)  // vaga de volta
  })
})
