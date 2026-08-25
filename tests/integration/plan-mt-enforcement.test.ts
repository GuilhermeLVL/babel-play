/**
 * SaaS Fatia 1b — enforcement server-side do MT via LLM gerenciado (Groq). O proxy é 100% nuvem
 * gerenciada; um usuário `free` recebe 402. A tradução LOCAL (Chrome/opus-mt/MyMemory) roda no
 * cliente e não passa por aqui — então o free ainda traduz, só não usa o Groq do dono.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let mtTranslateProxy: any
let subs: any

function mockReq(userId: any, body: any): any { return { userId, body } }
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; r.headersSent = true; return r }
  return r
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ mtTranslateProxy } = (await h.load('../../server/ai/mtProxy')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  await subs.upsert(asUserId('pro'), { plan: 'pro', status: 'active' })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  delete process.env.GROQ_API_KEY
  await h.cleanup()
})
afterEach(() => vi.unstubAllGlobals())

describe('SaaS Fatia 1b — enforcement MT gerenciado', () => {
  it('free → 402 (nem chega a chamar o Groq)', async () => {
    const req = mockReq(asUserId('free'), { text: 'hello', tgt: 'pt' }), res = mockRes()
    await mtTranslateProxy(req, res)
    expect(res.statusCode).toBe(402)
    expect(res.body?.entitlement).toBe('managedCloudLlm')
  })

  it('pro → passa o gate e traduz (fetch stub)', async () => {
    process.env.GROQ_API_KEY = 'test-key'
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'olá' } }] }) }))
    const req = mockReq(asUserId('pro'), { text: 'hello', tgt: 'pt' }), res = mockRes()
    await mtTranslateProxy(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ text: 'olá', engine: 'groq-llm' })
  })
})
