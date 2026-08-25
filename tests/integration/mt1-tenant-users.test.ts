/**
 * SaaS Fatia 2 — usersRepo (RBAC). Provisão idempotente da conta, fail-safe de menor privilégio
 * (role 'user' quando não provisionada), e ops admin (setRole/setStatus) isoladas por usuário.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let repo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ usersRepo: repo } = (await h.load('../../server/db/repositories/users')) as any)
})
afterAll(async () => { await h.cleanup() })

describe('SaaS Fatia 2 — usersRepo (RBAC)', () => {
  it('ensure provisiona com role=user/status=active e é idempotente', async () => {
    const A = asUserId('user-A')
    const u1 = await repo.ensure(A, 'a@x.com')
    expect(u1).toMatchObject({ id: 'user-A', role: 'user', status: 'active', email: 'a@x.com' })
    const u2 = await repo.ensure(A)
    expect(u2.id).toBe('user-A') // não duplica
  })

  it('ensure atualiza o e-mail quando muda', async () => {
    const u = await repo.ensure(asUserId('user-A'), 'novo@x.com')
    expect(u.email).toBe('novo@x.com')
  })

  it('getRole default = user p/ conta não provisionada (menor privilégio)', async () => {
    expect(await repo.getRole(asUserId('desconhecido'))).toBe('user')
    expect(await repo.isSuspended(asUserId('desconhecido'))).toBe(false)
  })

  it('setRole/setStatus alteram só o alvo (isolado)', async () => {
    const A = asUserId('u-a'), B = asUserId('u-b')
    await repo.ensure(A); await repo.ensure(B)
    await repo.setRole(A, 'admin')
    await repo.setStatus(A, 'suspended')
    expect(await repo.getRole(A)).toBe('admin')
    expect(await repo.isSuspended(A)).toBe(true)
    expect(await repo.getRole(B)).toBe('user') // B intacto
    expect(await repo.isSuspended(B)).toBe(false)
  })
})
