/**
 * REGRESSÃO — M-04: migrateLeitnerToFsrs existia no core e NUNCA tinha call site — 1.848 cartões
 * Leitner nunca migravam. Agora migrarLeitnerParaFsrs (server/db/manutencao) roda no boot (idempotente/não-destrutivo).
 * Testado em banco SINTÉTICO (harness); não toca o babel.db real.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const OWNER = asUserId('m04-owner')

let h: EphemeralDb
let db: any, vocabCards: any, vocabRepo: any, migrarLeitnerParaFsrs: () => Promise<number>, randomUUID: () => string

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ db } = await h.load<{ db: any }>('../../server/db/db'))
  ;({ vocabCards } = await h.load<{ vocabCards: any }>('../../server/db/schema'))
  // P3-1: a migração saiu de `vocabRepo` (barrel das rotas) para o módulo de manutenção —
  // ela atravessa TODOS os tenants e não podia ficar ao alcance de um handler.
  ;({ migrarLeitnerParaFsrs } = await h.load<{ migrarLeitnerParaFsrs: any }>('../../server/db/manutencao'))
  ;({ vocabRepo } = await h.load<{ vocabRepo: any }>('../../server/db/repositories/vocab'))
  ;({ randomUUID } = await import('node:crypto'))
})
afterAll(async () => { await h.cleanup() })

async function inserir(box: number, stability: number | null) {
  const id = randomUUID()
  const now = Date.now()
  await db.insert(vocabCards).values({
    id, createdAt: now, updatedAt: now, userId: OWNER, word: 'w-' + id.slice(0, 6), box,
    stability, dueAt: now, inDeck: 1, addedAt: now,
  })
  return id
}

describe('M-04 — migração Leitner→FSRS no boot', () => {
  it('migra cartas Leitner (box>1, sem stability) e é idempotente', async () => {
    const leitner = await inserir(3, null) // Leitner, box 3
    const nova = await inserir(1, null)    // carta nova (box 1) — não migra
    const jaFsrs = await inserir(2, 5.0)   // já tem FSRS — não migra

    const n1 = await migrarLeitnerParaFsrs()
    expect(n1).toBe(1) // só a Leitner box>1

    const migrada = await vocabRepo.get(OWNER, leitner)
    expect(migrada.stability).not.toBeNull()
    expect(migrada.box).toBe(3) // preservado (não-destrutivo)

    const novaAgora = await vocabRepo.get(OWNER, nova)
    expect(novaAgora.stability).toBeNull() // carta nova intacta

    const jaFsrsAgora = await vocabRepo.get(OWNER, jaFsrs)
    expect(jaFsrsAgora.stability).toBe(5.0) // já-FSRS intacta

    // idempotente: 2ª passada não migra nada
    const n2 = await migrarLeitnerParaFsrs()
    expect(n2).toBe(0)
  })
})
