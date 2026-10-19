import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

/*
 * Baseline do schema Postgres (migrações `server/db/migrations-pg`: 0000 gerada + 0001 à mão + 0002 de segurança).
 */
describe('baseline do schema Postgres', () => {
  let h: EphemeralDb
  beforeAll(async () => {
    h = await setupEphemeralDb()
  })
  afterAll(async () => {
    await h.cleanup()
  })

  it('o baseline cria as 38 tabelas, os 25 triggers, a RLS em todas e semeia as 10 flags', async () => {
    const { db, linhas } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
    const contar = async (consulta: ReturnType<typeof sql>) => linhas<{ n: number }>(await db.execute(consulta))[0].n
    expect(
      await contar(
        sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name <> '__drizzle_migrations'`,
      ),
    ).toBe(38)
    expect(await contar(sql`select count(*)::int as n from pg_trigger where not tgisinternal`)).toBe(25)
    expect(await contar(sql`select count(*)::int as n from flags`)).toBe(10) // estado final da cadeia SQLite
    expect(
      await contar(
        sql`select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity`,
      ),
    ).toBe(38)
  })

  it.todo('upsert em vocab_cards ignora o gêmeo apagado (índice parcial casa com o ON CONFLICT)')
  /*
   * Insere (user, norm) com deleted_at, depois insere o mesmo (user, norm) vivo via vocabRepo e espera 2 linhas.
   * Depende dos repositories migrados (Tarefa 3+).
   */
})
