/**
 * SaaS Fatia 1b — enforcement server-side do STT de nuvem GERENCIADA. Fecha o gap A01 (auto-upgrade
 * pelo cliente): um usuário `free` recebe 402 no caminho gerenciado (chave do dono), independente do
 * que o cliente ache do próprio plano. BYOK e local passam livres (só o ramo gerenciado é gateado).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let sttTranscribeProxy: any
let subs: any

function mockReq(userId: any, headers: Record<string, string> = {}): any {
  return { userId, body: Buffer.from('fake-wav-bytes'), header: (k: string) => headers[k.toLowerCase()] }
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined, headersSent: false }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; r.headersSent = true; return r }
  return r
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1' // público → free por padrão
  ;({ sttTranscribeProxy } = (await h.load('../../server/ai/sttProxy')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  await subs.upsert(asUserId('pro'), { plan: 'pro', status: 'active' })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  delete process.env.GROQ_API_KEY
  await h.cleanup()
})
afterEach(() => vi.unstubAllGlobals())

describe('SaaS Fatia 1b — enforcement STT gerenciado', () => {
  it('free + gerenciado (sem x-credential-id) → 402 (nem chega a chamar a nuvem)', async () => {
    const req = mockReq(asUserId('free')), res = mockRes()
    await sttTranscribeProxy(req, res)
    expect(res.statusCode).toBe(402)
    expect(res.body?.entitlement).toBe('managedCloudStt')
  })

  it('pro + gerenciado → passa o gate e transcreve (fetch stub)', async () => {
    process.env.GROQ_API_KEY = 'test-key'
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ text: 'olá mundo' }) }))
    const req = mockReq(asUserId('pro')), res = mockRes()
    await sttTranscribeProxy(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body?.text).toBe('olá mundo')
  })

  it('free + BYOK (x-credential-id) NÃO é bloqueado pelo plano (não é 402)', async () => {
    const req = mockReq(asUserId('free'), { 'x-credential-id': 'cred-inexistente' }), res = mockRes()
    await sttTranscribeProxy(req, res)
    expect(res.statusCode).not.toBe(402) // cai no ramo BYOK (credencial inexistente → outro erro)
  })
})
