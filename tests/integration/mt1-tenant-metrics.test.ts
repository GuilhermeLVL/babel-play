/**
 * Marco 1 — Commit 6 (fundido com o 9): isolamento de computeProfile.
 *
 * computeProfile varria 5 tabelas inteiras sem filtro — era o ponto onde o perfil de um usuário
 * somaria os dados de todos. A e B têm contagens DIFERENTES de propósito.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const A = asUserId('user-A')
const B = asUserId('user-B')

let h: EphemeralDb
let computeProfile: any
let sessionsRepo: any
let vocabRepo: any
let seedSpendsRepo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ computeProfile } = await h.load('../../server/db/repositories/metrics'))
  ;({ sessionsRepo } = await h.load('../../server/db/repositories/sessions'))
  ;({ vocabRepo } = await h.load('../../server/db/repositories/vocab'))
  ;({ seedSpendsRepo } = await h.load('../../server/db/repositories/seedSpends'))

  // A: 1 sessão, 1 cartão + 1 revisão, 5 seeds gastas
  await sessionsRepo.createWithUtterances(A, { wordCount: 10 }, [{ idx: 0, sourceText: 'a b c', tStartMs: 0, tEndMs: 1000 }])
  const ca = (await vocabRepo.bulkAdd(A, [{ word: 'house', back: 'casa', srcLang: 'en', tgtLang: 'pt', sentence: 'I live in a house.' }])).cards[0]
  await vocabRepo.review(A, ca.id, 3)
  await seedSpendsRepo.debitar(A, { spendId: 'a1', amount: 5, reason: 'x' })

  // B: 2 sessões, 1 cartão + 1 revisão, 99 seeds gastas
  await sessionsRepo.createWithUtterances(B, { wordCount: 5 }, [])
  await sessionsRepo.createWithUtterances(B, { wordCount: 5 }, [])
  const cb = (await vocabRepo.bulkAdd(B, [{ word: 'water', back: 'água', srcLang: 'en', tgtLang: 'pt', sentence: 'I drink water.' }])).cards[0]
  await vocabRepo.review(B, cb.id, 3)
  await seedSpendsRepo.debitar(B, { spendId: 'b1', amount: 99, reason: 'x' })
})
afterAll(async () => { await h.cleanup() })

describe('Marco 1 — isolamento computeProfile', () => {
  it('conta só os dados do próprio usuário', async () => {
    const mA = await computeProfile(A)
    expect(mA.sessions).toBe(1)
    expect(mA.deckSize).toBe(1)
    expect(mA.reviews).toBe(1)     // review_logs de A, não 2
    expect(mA.seedsGastas).toBe(5) // não 104
  })

  it('outro usuário tem os SEUS números', async () => {
    const mB = await computeProfile(B)
    expect(mB.sessions).toBe(2)
    expect(mB.seedsGastas).toBe(99)
  })
})
