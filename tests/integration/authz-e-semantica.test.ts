/**
 * P2 da re-auditoria v2: authz de `sessionId`, semântica honesta do DELETE, teto do
 * `imageUrl` e idempotência de seeds que ignora `deletedAt`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'
import { isSafeImageUrl, patchMetaSchema } from '../../server/validation'

let h: EphemeralDb
let vocab: any
let sessions: any
let seeds: any
let creds: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ vocabRepo: vocab } = await h.load('../../server/db/repositories/vocab'))
  ;({ sessionsRepo: sessions } = await h.load('../../server/db/repositories/sessions'))
  ;({ seedSpendsRepo: seeds } = await h.load('../../server/db/repositories/seedSpends'))
  ;({ credentialsRepo: creds } = await h.load('../../server/db/repositories/credentials'))
})
afterAll(async () => { await h.cleanup() })

describe('P2-N1 — vocab.bulkAdd confere o dono do sessionId', () => {
  it('sessão do próprio usuário é preservada', async () => {
    const u = asUserId('az-dono')
    const s = await sessions.create(u, { title: 'minha', kind: 'audio' })
    const r = await vocab.bulkAdd(u, [{ word: 'leverage', back: 'alavancar', sentence: 'gives us leverage', srcLang: 'en', tgtLang: 'pt', sessionId: s.id }])
    expect(r.cards[0].sessionId).toBe(s.id)
  })

  it('sessão de OUTRO usuário vira null (nada de FK pendurada cross-tenant)', async () => {
    const a = asUserId('az-a'), b = asUserId('az-b')
    const sa = await sessions.create(a, { title: 'de A', kind: 'audio' })
    const r = await vocab.bulkAdd(b, [{ word: 'synergy', back: 'sinergia', sentence: 'team synergy here', srcLang: 'en', tgtLang: 'pt', sessionId: sa.id }])
    expect(r.cards[0].sessionId).toBeNull()
  })

  it('sessão inexistente também vira null', async () => {
    const u = asUserId('az-fantasma')
    const r = await vocab.bulkAdd(u, [{ word: 'volatility', back: 'volatilidade', sentence: 'market volatility now', srcLang: 'en', tgtLang: 'pt', sessionId: 'nao-existe' }])
    expect(r.cards[0].sessionId).toBeNull()
  })
})

describe('P2-N4 — DELETE informa quando nada foi afetado', () => {
  it('remover recurso próprio devolve true', async () => {
    const u = asUserId('az-del')
    const s = await sessions.create(u, { title: 'x', kind: 'audio' })
    expect(await sessions.remove(u, s.id)).toBe(true)
  })

  it('remover sessão de OUTRO dono devolve false (a rota vira 404)', async () => {
    const a = asUserId('az-del-a'), b = asUserId('az-del-b')
    const sa = await sessions.create(a, { title: 'de A', kind: 'audio' })
    expect(await sessions.remove(b, sa.id)).toBe(false)
    expect(await sessions.get(a, sa.id)).toBeDefined() // intacta
  })

  it('vale para cartão de vocabulário', async () => {
    const a = asUserId('az-vc-a'), b = asUserId('az-vc-b')
    const r = await vocab.bulkAdd(a, [{ word: 'heuristics', back: 'heurística', sentence: 'useful heuristics apply', srcLang: 'en', tgtLang: 'pt' }])
    const id = r.cards[0].id
    expect(await vocab.remove(b, id)).toBe(false)
    expect(await vocab.remove(a, id)).toBe(true)
  })

  it('vale para credencial', async () => {
    const a = asUserId('az-cr-a'), b = asUserId('az-cr-b')
    const c = await creds.create(a, { label: 'de A', kind: 'openai', baseUrl: 'https://example.com/v1', secret: 'sk-a' })
    expect(await creds.remove(b, c.id)).toBe(false)
    expect(await creds.remove(a, c.id)).toBe(true)
  })
})

describe('P2-N5 — imageUrl tem teto de tamanho', () => {
  it('aceita https e data:image pequeno', () => {
    expect(isSafeImageUrl('https://exemplo.test/a.png')).toBe(true)
    expect(isSafeImageUrl('data:image/png;base64,' + 'A'.repeat(100))).toBe(true)
  })

  it('recusa data:image gigante (ia direto para a coluna meta)', () => {
    expect(isSafeImageUrl('data:image/png;base64,' + 'A'.repeat(300_000))).toBe(false)
  })

  it('o esquema do PATCH /meta também barra', () => {
    const gigante = 'data:image/png;base64,' + 'A'.repeat(300_000)
    expect(patchMetaSchema.safeParse({ imageUrl: gigante }).success).toBe(false)
    expect(patchMetaSchema.safeParse({ pinned: true }).success).toBe(true)
    expect(patchMetaSchema.safeParse({ imageUrl: null }).success).toBe(true)
  })
})

describe('P2-N2 — seeds soft-deletados não são cobrados de graça', () => {
  it('gasto normal é idempotente e conta no saldo', async () => {
    const u = asUserId('az-seed')
    await seeds.debitar(u, { spendId: 'compra-normal-1', amount: 5, reason: 'pular-rodada' })
    const r2 = await seeds.debitar(u, { spendId: 'compra-normal-1', amount: 5, reason: 'pular-rodada' })
    expect(r2.jaExistia).toBe(true)
    expect(await seeds.totalGasto(u)).toBe(5)
  })

  it('gasto SOFT-DELETADO não devolve jaExistia (senão sai de graça)', async () => {
    const u = asUserId('az-seed-del')
    const { db } = await h.load('../../server/db/db') as any
    const { seedSpends } = await h.load('../../server/db/schema') as any
    const { and, eq } = await import('drizzle-orm')

    await seeds.debitar(u, { spendId: 'compra-apagada-1', amount: 7, reason: 'pular-rodada' })
    await db.update(seedSpends).set({ deletedAt: Date.now() })
      .where(and(eq(seedSpends.userId, u), eq(seedSpends.spendId, 'compra-apagada-1')))

    expect(await seeds.totalGasto(u)).toBe(0) // sumiu do saldo

    // A idempotência precisa concordar com o saldo: se não conta, tem de cobrar de novo.
    const r = await seeds.debitar(u, { spendId: 'compra-apagada-1', amount: 7, reason: 'pular-rodada' })
    expect(r.jaExistia).toBe(false)
    expect(await seeds.totalGasto(u)).toBe(7)
  })
})
