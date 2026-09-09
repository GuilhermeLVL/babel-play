/**
 * Auditoria (defeito 4) — `dueToday` contava cartão NUNCA agendado (`dueAt` null) como vencido.
 *
 * `computeProfile` fazia `(c.dueAt ?? 0) <= now`: um cartão recém-criado sem `dueAt` virava
 * `0 <= now`, sempre verdadeiro — "nunca agendado" não é "vencido". Esse número alimenta o banner
 * global da tela de jogos ("N pedindo revisão"). O teste reproduz com um cartão `dueAt: null` ao
 * lado de um vencido de verdade e de um futuro, e prova que só o vencido de verdade conta.
 */
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb,setupEphemeralDb } from '../harness/ephemeralDb'

const U = asUserId('due-today-user')

let h: EphemeralDb
let computeProfile: (userId: ReturnType<typeof asUserId>) => Promise<any>

beforeAll(async () => {
  h = await setupEphemeralDb()
  const schema = await h.load<Record<string, any>>('../../server/db/schema')
  const { db } = await h.load<Record<string, any>>('../../server/db/db')
  ;({ computeProfile } = await h.load<{ computeProfile: typeof computeProfile }>('../../server/db/repositories/metrics'))

  const agora = Date.now()
  const meta = { userId: U, createdAt: agora, updatedAt: agora, deletedAt: null }

  await db.insert(schema.vocabCards).values([
    // Nunca agendado: dueAt null. NÃO deve contar como vencido.
    { id: 'nunca-agendado', ...meta, word: 'alpha', back: 'alfa', normKey: 'alpha', inDeck: 1, addedAt: agora, dueAt: null },
    // Vencido de verdade: dueAt no passado.
    { id: 'vencido', ...meta, word: 'bravo', back: 'bravo', normKey: 'bravo', inDeck: 1, addedAt: agora, dueAt: agora - 60_000 },
    // Agendado para o futuro: não vencido.
    { id: 'futuro', ...meta, word: 'charlie', back: 'charlie', normKey: 'charlie', inDeck: 1, addedAt: agora, dueAt: agora + 3_600_000 },
  ])
})
afterAll(async () => { await h.cleanup() })

describe('computeProfile.dueToday', () => {
  it('conta só quem tem dueAt marcado E já passou — "nunca agendado" não é "vencido"', async () => {
    const perfil = await computeProfile(U)
    expect(perfil.dueToday).toBe(1)
  })
})
