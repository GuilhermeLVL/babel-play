/**
 * SaaS Fatia 1a — isolamento de `subscriptions`. Escopo por usuário (branded `UserId`) como o
 * resto do Marco 1: `getActive` só devolve a assinatura do próprio dono; `upsert` é idempotente
 * por usuário (unique user_id) e não vaza para outro.
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
  ;({ subscriptionsRepo: repo } = await h.load('../../server/db/repositories/subscriptions'))
  await repo.upsert(A, { plan: 'pro', status: 'active' })
  await repo.upsert(B, { plan: 'free', status: 'active' })
})
afterAll(async () => { await h.cleanup() })

describe('SaaS Fatia 1a — isolamento subscriptions', () => {
  it('getActive retorna só a assinatura do próprio usuário', async () => {
    expect((await repo.getActive(A))?.plan).toBe('pro')
    expect((await repo.getActive(B))?.plan).toBe('free')
  })

  it('insert carimba o userId', async () => {
    expect((await repo.getActive(A))?.userId).toBe('user-A')
  })

  it('upsert é idempotente por usuário (atualiza, não cria 2ª) e não vaza p/ outro', async () => {
    await repo.upsert(A, { plan: 'selfhost' })
    expect((await repo.getActive(A))?.plan).toBe('selfhost')
    expect((await repo.getActive(B))?.plan).toBe('free') // B intacto
  })

  it('usuário sem assinatura → null', async () => {
    expect(await repo.getActive(asUserId('user-C'))).toBeNull()
  })
})
