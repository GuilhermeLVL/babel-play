/**
 * Validação de input nas rotas que tocam o banco (P2-1) e authz de `sessionId` (P2-8).
 *
 * `server/validation.ts` já tinha esquemas bons, mas várias rotas liam `req.body` cru.
 * O caso mais grave era `grade`: cast direto `as Grade`, entrando no FSRS e sendo
 * persistido em `review_logs` sem nenhuma checagem.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  reviewGradeSchema, settingsPatchSchema, relabelUtterancesSchema,
  patchUtteranceSchema, patchSessionSchema, imageSearchQuerySchema,
} from '../../server/validation'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

describe('reviewGradeSchema — P2-1 (o pior caso: entrava no FSRS sem checagem)', () => {
  it('aceita as notas válidas 1..4', () => {
    for (const g of [1, 2, 3, 4]) expect(reviewGradeSchema.parse({ grade: g }).grade).toBe(g)
  })
  it('default 3 quando ausente (preserva o contrato do cliente)', () => {
    expect(reviewGradeSchema.parse({}).grade).toBe(3)
  })
  it('recusa fora da faixa, fracionário e não-número', () => {
    for (const g of [0, 5, 99, -1, 2.5, 'quatro', null, {}]) {
      expect(reviewGradeSchema.safeParse({ grade: g }).success).toBe(false)
    }
  })
})

describe('settingsPatchSchema — P2-1 (ui virava blob de até 5MB)', () => {
  it('aceita um ui pequeno', () => {
    expect(settingsPatchSchema.safeParse({ ui: { theme: 'dark' } }).success).toBe(true)
  })
  it('recusa ui gigante', () => {
    const gigante = { lixo: 'x'.repeat(200_000) }
    expect(settingsPatchSchema.safeParse({ ui: gigante }).success).toBe(false)
  })
  it('recusa targetLanguage absurdo', () => {
    expect(settingsPatchSchema.safeParse({ targetLanguage: 'x'.repeat(100) }).success).toBe(false)
  })
})

describe('relabelUtterancesSchema — P2-1 (array sem teto virava um UPDATE por item)', () => {
  it('aceita lista pequena', () => {
    expect(relabelUtterancesSchema.safeParse({ items: [{ id: 'a', sourceLang: 'en', targetLang: 'pt' }] }).success).toBe(true)
  })
  it('recusa lista absurda', () => {
    const itens = Array.from({ length: 20_000 }, (_, i) => ({ id: `i${i}`, sourceLang: 'en', targetLang: 'pt' }))
    expect(relabelUtterancesSchema.safeParse({ items: itens }).success).toBe(false)
  })
})

describe('patchUtteranceSchema — P2-1 (o POST limitava a 10.000, o PATCH não)', () => {
  it('aceita texto normal', () => {
    expect(patchUtteranceSchema.safeParse({ sourceText: 'ok' }).success).toBe(true)
  })
  it('recusa texto acima do teto do POST', () => {
    expect(patchUtteranceSchema.safeParse({ sourceText: 'x'.repeat(10_001) }).success).toBe(false)
  })
})

describe('patchSessionSchema — P2-1', () => {
  it('recusa durationMs negativo e kind gigante', () => {
    expect(patchSessionSchema.safeParse({ durationMs: -5 }).success).toBe(false)
    expect(patchSessionSchema.safeParse({ kind: 'x'.repeat(100) }).success).toBe(false)
  })
})

describe('imageSearchQuerySchema — P2-1 (q virava chave do cache em memória)', () => {
  it('recusa termo gigante', () => {
    expect(imageSearchQuerySchema.safeParse({ q: 'x'.repeat(500) }).success).toBe(false)
  })
})

describe('exerciseResults.sessionId — P2-8 (FK pendurada cross-tenant)', () => {
  let h: EphemeralDb
  let ex: any
  let sessions: any

  beforeAll(async () => {
    h = await setupEphemeralDb()
    ;({ exerciseResultsRepo: ex } = await h.load('../../server/db/repositories/exerciseResults'))
    ;({ sessionsRepo: sessions } = await h.load('../../server/db/repositories/sessions'))
  })
  afterAll(async () => { await h.cleanup() })

  it('grava normalmente quando a sessão é do próprio usuário', async () => {
    const u = asUserId('val-dono')
    const s = await sessions.create(u, { title: 's', kind: 'audio' })
    const r = await ex.add(u, { kind: 'cloze', correct: 1, sessionId: s.id })
    expect(r.sessionId).toBe(s.id)
  })

  it('sessionId de OUTRO usuário não é gravado (vira null em vez de FK pendurada)', async () => {
    const a = asUserId('val-a')
    const b = asUserId('val-b')
    const sa = await sessions.create(a, { title: 'de A', kind: 'audio' })

    const r = await ex.add(b, { kind: 'cloze', correct: 1, sessionId: sa.id })
    expect(r.sessionId).toBeNull()
  })
})
