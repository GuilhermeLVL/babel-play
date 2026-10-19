import { describe, it } from 'vitest'

/*
 * Baseline do schema Postgres (migrações `server/db/migrations-pg`: 0000 gerada + 0001 à mão).
 * Fica como `todo` até a Tarefa 2 entregar `setupEphemeralDb` (PGlite) e `linhas()` em
 * `tests/harness/ephemeralDb`. Quando ligar: trocar `it.todo` por `it`, descomentar as asserções
 * e adicionar os imports de `sql` (drizzle-orm), `expect`, `setupEphemeralDb` e `linhas` (não ficam agora
 * para não violar a regra de import sem uso).
 */
describe('baseline do schema Postgres', () => {
  it.todo('o baseline cria as 38 tabelas, os 25 triggers, a RLS em todas e semeia as 10 flags')
  /*
   * const h = await setupEphemeralDb()
   * const { db } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
   * const tabelas = linhas<{ n: number }>(await db.execute(sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name <> '__drizzle_migrations'`))
   * expect(tabelas[0].n).toBe(38)
   * const triggers = linhas<{ n: number }>(await db.execute(sql`select count(*)::int as n from pg_trigger where not tgisinternal`))
   * expect(triggers[0].n).toBe(25)
   * const flags = linhas<{ n: number }>(await db.execute(sql`select count(*)::int as n from flags`))
   * expect(flags[0].n).toBe(10) // estado final da cadeia SQLite (4 + 1 + 1 + 1 + 2 + 1 inserts)
   * const rls = linhas<{ n: number }>(await db.execute(sql`select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity`))
   * expect(rls[0].n).toBe(38)
   */
  it.todo('upsert em vocab_cards ignora o gêmeo apagado (índice parcial casa com o ON CONFLICT)')
  /*
   * Insere (user, norm) com deleted_at, depois insere o mesmo (user, norm) vivo via vocabRepo e espera 2 linhas.
   */
})
