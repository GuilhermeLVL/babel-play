/**
 * Marco 1 — Commit 6: isolamento de seed_spends.
 * A idempotência passa a ser por (userId, spendId) e o total é por usuário.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const A = asUserId('user-A')
const B = asUserId('user-B')

let h: EphemeralDb
let repo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ seedSpendsRepo: repo } = await h.load('../../server/db/repositories/seedSpends'))
  await repo.debitar(A, { spendId: 'sA', amount: 100, reason: 'pular' })
  await repo.debitar(B, { spendId: 'sB', amount: 50, reason: 'pular' })
})
afterAll(async () => { await h.cleanup() })

describe('Marco 1 — isolamento seedSpends', () => {
  it('totalGasto conta só o do próprio usuário', async () => {
    expect(await repo.totalGasto(A)).toBe(100)
    expect(await repo.totalGasto(B)).toBe(50)
  })

  it('listar é isolado e carimbado', async () => {
    const la = await repo.listar(A)
    expect(la).toHaveLength(1)
    expect(la[0].userId).toBe('user-A')
  })

  it('idempotência é por usuário e não dobra o total', async () => {
    const r = await repo.debitar(A, { spendId: 'sA', amount: 100, reason: 'pular' })
    expect(r.jaExistia).toBe(true)
    expect(await repo.totalGasto(A)).toBe(100) // não virou 200
  })
})
