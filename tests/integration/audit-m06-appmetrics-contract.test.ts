/**
 * REGRESSÃO — M-06: `AppMetrics` era duplicado (servidor × cliente) e JÁ divergia. Agora é um
 * contrato ÚNICO em src/core/learning/contract.ts. O typecheck impede divergência de TIPO; este
 * teste garante que o servidor (`computeProfile`) REALMENTE devolve todos os campos do contrato.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const OWNER = asUserId('m06-owner')

let h: EphemeralDb
let computeProfile: (userId: ReturnType<typeof asUserId>) => Promise<Record<string, unknown>>

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ computeProfile } = await h.load<{ computeProfile: typeof computeProfile }>('../../server/db/repositories/metrics'))
})
afterAll(async () => { await h.cleanup() })

const CAMPOS = [
  'sessions', 'wordsCaptured', 'deckSize', 'newCards', 'dueToday', 'reviews', 'correctReviews',
  'drillItems', 'drillCorrect', 'accuracy', 'accuracyConfidence', 'streakDays', 'seedsGastas',
  'avgStability', 'avgRetention', 'avgRetentionConfidence', 'vocabByWeek', 'speakingMs', 'wpm',
  'wpmConfidence', 'uniqueWords', 'levelDistribution', 'levelConfidence', 'asOf',
]

describe('M-06 — contrato AppMetrics único', () => {
  it('computeProfile devolve TODOS os campos do contrato', async () => {
    const m = await computeProfile(OWNER)
    for (const k of CAMPOS) expect(m, `faltou o campo ${k}`).toHaveProperty(k)
    // seedsGastas é obrigatório (era o campo que divergia — opcional no cliente antes)
    expect(typeof m.seedsGastas).toBe('number')
  })
})
