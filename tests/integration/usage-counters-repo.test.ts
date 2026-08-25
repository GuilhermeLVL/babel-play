/** SaaS — repositório de contadores de uso (fair-use). get() começa em 0; increment() faz upsert idempotente por (user,metric,window). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let repo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ usageCountersRepo: repo } = await h.load('../../server/db/repositories/usageCounters'))
})
afterAll(async () => { await h.cleanup() })

describe('usageCountersRepo', () => {
  it('get() sem linha → 0', async () => {
    expect(await repo.get(asUserId('u1'), 'managed_calls', '2026-08')).toBe(0)
  })
  it('increment() cria e soma; get() reflete', async () => {
    const u = asUserId('u2')
    await repo.increment(u, 'managed_calls', '2026-08')
    await repo.increment(u, 'managed_calls', '2026-08')
    expect(await repo.get(u, 'managed_calls', '2026-08')).toBe(2)
  })
  it('janela e usuário isolam a contagem', async () => {
    const u = asUserId('u3')
    await repo.increment(u, 'managed_calls', '2026-08')
    expect(await repo.get(u, 'managed_calls', '2026-09')).toBe(0)
    expect(await repo.get(asUserId('u4'), 'managed_calls', '2026-08')).toBe(0)
  })
})
