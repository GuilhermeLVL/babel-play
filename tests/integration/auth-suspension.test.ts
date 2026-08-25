/**
 * SaaS Fatia 4 (slice) — REVOGAÇÃO por suspensão. No modo público, uma conta suspensa é barrada
 * (403) mesmo com JWT válido; conta ativa passa; erro ao checar → 503 (fail-closed); e o modo LOCAL
 * nem chega a checar. Middleware testado com `verify`/`isSuspended` injetados (sem banco).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { makeAuthMiddleware } from '../../server/lib/auth'
import { asUserId } from '../../server/lib/authContext'

function mockReq(token?: string): any {
  return { header: (k: string) => (k.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : undefined) }
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}

afterEach(() => { delete process.env.AUTH_REQUIRED })

describe('SaaS — revogação por suspensão (auth middleware)', () => {
  it('conta suspensa → 403 mesmo com token válido', async () => {
    process.env.AUTH_REQUIRED = '1'
    const mw = makeAuthMiddleware(async () => asUserId('u1'), async () => true)
    const res = mockRes(); let nexted = false
    await mw(mockReq('tok'), res, () => { nexted = true })
    expect(res.statusCode).toBe(403)
    expect(nexted).toBe(false)
  })

  it('conta ativa → passa (next)', async () => {
    process.env.AUTH_REQUIRED = '1'
    const mw = makeAuthMiddleware(async () => asUserId('u1'), async () => false)
    const res = mockRes(); let nexted = false
    await mw(mockReq('tok'), res, () => { nexted = true })
    expect(nexted).toBe(true)
    expect(res.statusCode).toBe(200)
  })

  it('erro ao checar suspensão → 503 (fail-closed, nega)', async () => {
    process.env.AUTH_REQUIRED = '1'
    const mw = makeAuthMiddleware(async () => asUserId('u1'), async () => { throw new Error('db down') })
    const res = mockRes(); let nexted = false
    await mw(mockReq('tok'), res, () => { nexted = true })
    expect(res.statusCode).toBe(503)
    expect(nexted).toBe(false)
  })

  it('modo local (AUTH_REQUIRED=0) nem checa suspensão — passa como LOCAL_OWNER', async () => {
    process.env.AUTH_REQUIRED = '0'
    let checked = false
    const mw = makeAuthMiddleware(async () => asUserId('u1'), async () => { checked = true; return true })
    const res = mockRes(); let nexted = false
    await mw(mockReq(), res, () => { nexted = true })
    expect(nexted).toBe(true) // local passa sem token
    expect(checked).toBe(false) // nem chega a checar suspensão
  })
})
