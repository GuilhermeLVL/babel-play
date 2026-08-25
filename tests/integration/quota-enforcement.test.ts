/** SaaS — no teto de fair-use, o proxy STT gerenciado responde 402 quota_exceeded ANTES de chamar upstream. */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let stt: any
let quota: any
let subs: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ sttTranscribeProxy: stt } = await h.load('../../server/ai/sttProxy'))
  quota = await h.load('../../server/lib/usageQuota')
  ;({ subscriptionsRepo: subs } = await h.load('../../server/db/repositories/subscriptions'))
})
afterAll(async () => { await h.cleanup() })
afterEach(() => { delete process.env.AUTH_REQUIRED; delete process.env.PRO_MONTHLY_MANAGED_CALLS; vi.restoreAllMocks() })

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; r.headersSent = true; return r }
  return r
}

describe('quota enforcement (STT gerenciado)', () => {
  it('pro NO TETO → 402 quota_exceeded, sem tocar upstream', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.PRO_MONTHLY_MANAGED_CALLS = '1'
    const u = asUserId('qe-pro')
    await subs.upsert(u, { plan: 'pro', status: 'active' })
    await quota.reserveManagedCall(u) // 1/1 → estourado
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const req: any = { userId: u, body: Buffer.from([1, 2, 3]), header: () => undefined }
    const res = fakeRes()
    await stt(req, res)
    expect(res.statusCode).toBe(402)
    expect(res.body?.code).toBe('quota_exceeded')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
