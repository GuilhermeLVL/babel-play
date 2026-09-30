/** SaaS — no teto de fair-use, o proxy STT gerenciado responde 402 quota_exceeded ANTES de chamar upstream. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'
import { wavPcm } from '../harness/wav'

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
afterAll(async () => {
  await h.cleanup()
})
afterEach(() => {
  delete process.env.AUTH_REQUIRED
  delete process.env.PREMIUM_MONTHLY_MANAGED_CALLS
  // '' e não `delete`: o dotenv devolveria a variável do .env de quem roda.
  process.env.GROQ_API_KEY = ''
  process.env.GROQ_BASE_URL = ''
  vi.restoreAllMocks()
})

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => {
    r.statusCode = c
    return r
  }
  r.json = (b: any) => {
    r.body = b
    r.headersSent = true
    return r
  }
  return r
}

describe('quota enforcement (STT gerenciado)', () => {
  it('pro NO TETO → 402 quota_exceeded, sem tocar upstream', async () => {
    process.env.AUTH_REQUIRED = '1'
    process.env.PREMIUM_MONTHLY_MANAGED_CALLS = '1'
    /* ADR 0007: a configuração (501) é conferida ANTES da cota, na porta do STT — sem chave o caso
       responderia 501 e nunca chegaria ao 402 que ele encena. */
    process.env.GROQ_API_KEY = 'chave-qe'
    process.env.GROQ_BASE_URL = 'http://203.0.113.20/v1'
    const u = asUserId('qe-pro')
    await subs.upsert(u, { plan: 'premium', status: 'active' })
    await quota.reserveManagedCall(u) // 1/1 → estourado
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    // WAV PCM de verdade: desde o P0-2 o caminho pago recusa (415) o que não sabe medir.
    const req: any = { userId: u, body: wavPcm(1), header: () => undefined }
    const res = fakeRes()
    await stt(req, res)
    expect(res.statusCode).toBe(402)
    expect(res.body?.code).toBe('quota_exceeded')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
