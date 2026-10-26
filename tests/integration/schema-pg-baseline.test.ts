import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

/*
 * Baseline do schema Postgres (migrações `server/db/migrations-pg`: 0000 gerada + 0001 à mão + 0002 de segurança + 0003 `travas` + 0005 `admissao_de_ia` + 0006 `anuncios_premiados` + 0012 `palavras_vistas` + 0013 `anotacoes_de_leitura`).
 */
describe('baseline do schema Postgres', () => {
  let h: EphemeralDb
  beforeAll(async () => {
    h = await setupEphemeralDb()
  })
  afterAll(async () => {
    await h.cleanup()
  })

  it('o baseline cria as 43 tabelas, os 25 triggers, a RLS em todas e semeia as 14 flags', async () => {
    const { db, linhas } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
    const contar = async (consulta: ReturnType<typeof sql>) => linhas<{ n: number }>(await db.execute(consulta))[0].n
    expect(
      await contar(
        sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name <> '__drizzle_migrations'`,
      ),
    ).toBe(43)
    expect(await contar(sql`select count(*)::int as n from pg_trigger where not tgisinternal`)).toBe(25)
    expect(await contar(sql`select count(*)::int as n from flags`)).toBe(16) // estado final da cadeia SQLite (+ `ia_de_estudo`, PG 0009; + `stt_aparelho_primeiro`, PG 0010; + `assistente_ao_vivo`, PG 0011)
    expect(
      await contar(
        sql`select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity`,
      ),
    ).toBe(43)
  })

  it('upsert em vocab_cards ignora o gêmeo apagado (índice parcial casa com o ON CONFLICT)', async () => {
    const { db } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
    const { vocabCards } = await h.load<typeof import('../../server/db/schema')>('../../server/db/schema')
    const { vocabRepo } = await h.load<typeof import('../../server/db/repositories/vocab')>(
      '../../server/db/repositories/vocab',
    )
    const { eq } = await import('drizzle-orm')
    const { chaveDedup } = await import('../../src/core/texto/palavra')
    const userId = 'baseline-gemeo'
    const agora = Date.now()
    await db.insert(vocabCards).values({
      id: 'gemeo-apagado',
      createdAt: agora,
      updatedAt: agora,
      userId,
      word: 'cadeira',
      back: 'apagado',
      srcLang: 'en',
      normKey: chaveDedup('cadeira', 'en'), // a mesma chave que o bulkAdd calcula
      occurrences: 1,
      deletedAt: agora - 1000,
    })
    const r = await vocabRepo.bulkAdd(userId as never, [
      { word: 'cadeira', srcLang: 'en', tgtLang: 'pt', back: 'chair' },
    ])
    expect(r.cards).toHaveLength(1)
    expect(r.cards[0].id).not.toBe('gemeo-apagado')

    const todas = await db.select().from(vocabCards).where(eq(vocabCards.userId, userId))
    expect(todas).toHaveLength(2)
    const apagado = todas.find((c) => c.id === 'gemeo-apagado')!
    expect(apagado.back).toBe('apagado')
    expect(apagado.deletedAt).not.toBeNull()
  })
})
