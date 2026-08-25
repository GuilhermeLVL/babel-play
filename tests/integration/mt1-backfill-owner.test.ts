/**
 * Marco 1 — Commit 2: backfill de tenancy no boot.
 *
 * Carimba as linhas legadas (user_id NULL) com o dono local, exceto profiles (fica global).
 * Idempotente. Usa o harness efêmero (DB temporário migrado, isolado).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let backfillNullOwner: (id: ReturnType<typeof asUserId>) => Promise<number>
let db: any
let schema: any

const OWNER = asUserId('local-owner')
const now = 1_700_000_000_000

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ backfillNullOwner } = await h.load('../../server/db/repositories/tenancy'))
  ;({ db } = await h.load('../../server/db/db'))
  schema = await h.load('../../server/db/schema')

  // linhas legadas (user_id NULL por padrão — a coluna não tem default)
  await db.insert(schema.sessions).values({ id: 's1', createdAt: now, updatedAt: now, title: 'x' })
  await db.insert(schema.vocabCards).values({ id: 'v1', createdAt: now, updatedAt: now, word: 'w' })
  await db.insert(schema.settings).values({ id: 'app', createdAt: now, updatedAt: now })
  await db.insert(schema.providerCredentials).values({ id: 'c1', createdAt: now, updatedAt: now })
  // perfil builtin/compartilhado — DEVE ficar global (NULL)
  await db.insert(schema.profiles).values({ id: 'p-builtin', createdAt: now, updatedAt: now, name: 'Padrão', builtin: 1 })
})
afterAll(async () => { await h.cleanup() })

describe('Marco 1 — backfill de tenancy', () => {
  it('carimba as linhas NULL com o dono e conta quantas tocou', async () => {
    const n = await backfillNullOwner(OWNER)
    expect(n).toBe(4) // sessions, vocab, settings, credentials (NÃO profiles)
    expect((await db.select().from(schema.sessions))[0].userId).toBe('local-owner')
    expect((await db.select().from(schema.vocabCards))[0].userId).toBe('local-owner')
    expect((await db.select().from(schema.settings))[0].userId).toBe('local-owner')
    expect((await db.select().from(schema.providerCredentials))[0].userId).toBe('local-owner')
  })

  it('NÃO toca profiles (o builtin fica global = NULL)', async () => {
    expect((await db.select().from(schema.profiles))[0].userId).toBeNull()
  })

  it('idempotente: uma segunda passada afeta 0 linhas', async () => {
    expect(await backfillNullOwner(OWNER)).toBe(0)
  })
})
