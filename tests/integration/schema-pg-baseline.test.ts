import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

/*
 * Baseline do schema Postgres (migrações `server/db/migrations-pg`: 0000 gerada + 0001 à mão + 0002 de segurança + 0003 `travas` + 0005 `admissao_de_ia` + 0006 `anuncios_premiados` + 0012 `palavras_vistas` + 0013 `anotacoes_de_leitura` + 0014 `cache_do_parceiro` + 0027 `palavras_marcadas`).
 */
describe('baseline do schema Postgres', () => {
  let h: EphemeralDb
  beforeAll(async () => {
    h = await setupEphemeralDb()
  })
  afterAll(async () => {
    await h.cleanup()
  })

  it('o baseline cria as 45 tabelas, os 25 triggers, a RLS em todas e semeia as 24 flags', async () => {
    const { db, linhas } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
    const contar = async (consulta: ReturnType<typeof sql>) => linhas<{ n: number }>(await db.execute(consulta))[0].n
    expect(
      await contar(
        sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name <> '__drizzle_migrations'`,
      ),
    ).toBe(45)
    expect(await contar(sql`select count(*)::int as n from pg_trigger where not tgisinternal`)).toBe(25)
    expect(await contar(sql`select count(*)::int as n from flags`)).toBe(38) // estado final da cadeia SQLite (+ `ia_de_estudo`, PG 0009; + `stt_aparelho_primeiro`, PG 0010; + `assistente_ao_vivo`, PG 0011; + `parceiro_de_leitura`, PG 0014; + `aquecer_stt_na_intencao`, PG 0015; + `avatar_3d`, `avatar_sinais` e `avatar_elenco`, PG 0016; + `audiolivros`, `audiolivros_nuvem` e `audiolivros_elenco`, PG 0017; + `voz_no_aparelho`, PG 0018; + `voz_kitten`, PG 0020; + `leitura_ativa`, PG 0021; + `acesso_restrito_sem_conta`, PG 0022; + `rum_latencia`, PG 0023; + `stt_nuvem_normalizar`, PG 0024; + `roteador_adaptativo_sombra`, PG 0025; + `traducao_local_por_direcao`, PG 0026; + `parciais_vivos`, `parciais_parakeet` e `traducao_incremental`, PG 0029 a 0031; + `pre_traducao_de_legendas`, PG 0032; + `forca_na_legenda`, PG 0033; + `frase_por_frase`, PG 0034; + `sombra_local`, PG 0035)
    expect(
      await contar(
        sql`select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity`,
      ),
    ).toBe(45)
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
