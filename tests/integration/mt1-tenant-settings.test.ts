/**
 * Marco 1 — Commit 7: settings por usuário (era linha única global 'app').
 *
 * O refator de maior risco: settings.ui alimenta onboarding/plano/tema. Cobre isolamento E
 * a CONTINUIDADE — a linha legada 'app' (user_id NULL) tem de continuar visível ao dono local
 * depois do backfill, com onboarding/plano preservados.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId, LOCAL_OWNER } from '../../server/lib/authContext'

const A = asUserId('user-A')
const B = asUserId('user-B')

let h: EphemeralDb
let settingsRepo: any
let backfillNullOwner: any
let db: any
let schema: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ settingsRepo } = await h.load('../../server/db/repositories/settings'))
  ;({ backfillNullOwner } = await h.load('../../server/db/repositories/tenancy'))
  ;({ db } = await h.load('../../server/db/db'))
  schema = await h.load('../../server/db/schema')
})
afterAll(async () => { await h.cleanup() })

describe('Marco 1 — settings por usuário', () => {
  it('A e B têm settings independentes (linhas distintas, não a singleton)', async () => {
    await settingsRepo.update(A, { ui: { onboarded: true, plan: 'pro' }, targetLanguage: 'en' })
    await settingsRepo.update(B, { ui: { onboarded: false }, targetLanguage: 'es' })

    const sA = await settingsRepo.get(A)
    const sB = await settingsRepo.get(B)
    expect(sA.userId).toBe('user-A')
    expect(sB.userId).toBe('user-B')
    expect(sA.id).not.toBe(sB.id)
    expect(JSON.parse(sA.ui).plan).toBe('pro')
    expect(sA.targetLanguage).toBe('en')
    expect(sB.targetLanguage).toBe('es')
  })

  it('update de A não toca B', async () => {
    await settingsRepo.update(A, { targetLanguage: 'fr' })
    expect((await settingsRepo.get(A)).targetLanguage).toBe('fr')
    expect((await settingsRepo.get(B)).targetLanguage).toBe('es')
  })

  it('CONTINUIDADE: a linha legada "app" (NULL) fica com o dono local após o backfill', async () => {
    const now = Date.now()
    await db.insert(schema.settings).values({
      id: 'app', createdAt: now, updatedAt: now,
      ui: JSON.stringify({ onboarded: true, plan: 'selfhost', ageProfile: 'adult' }),
      targetLanguage: 'pt',
    })
    await backfillNullOwner(LOCAL_OWNER)
    const local = await settingsRepo.get(LOCAL_OWNER)
    expect(local).toBeDefined()
    expect(local.id).toBe('app')                        // mesma linha; id inofensivo
    expect(JSON.parse(local.ui).plan).toBe('selfhost')  // onboarding/plano preservados
    expect(local.targetLanguage).toBe('pt')
  })
})
