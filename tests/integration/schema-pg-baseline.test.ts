import { describe, it } from 'vitest'

/*
 * Baseline do schema Postgres (migrações `server/db/migrations-pg`: 0000 gerada + 0001 à mão).
 * Fica como `todo` até a Tarefa 2 entregar `setupEphemeralDb` (PGlite) e `linhas()` em
 * `tests/harness/ephemeralDb`. Quando ligar: trocar `it.todo` por `it`, descomentar as asserções
 * e os imports de `expect`, `setupEphemeralDb` e `linhas`.
 */
describe('baseline do schema Postgres', () => {
  it.todo('o baseline cria as 34 tabelas, os 25 triggers e semeia as 10 flags')
  /*
   * const h = await setupEphemeralDb()
   * const { db } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
   * const tabelas = linhas<{ n: number }>(await db.execute(sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name <> '__drizzle_migrations'`))
   * expect(tabelas[0].n).toBe(34)
   * const triggers = linhas<{ n: number }>(await db.execute(sql`select count(*)::int as n from pg_trigger where not tgisinternal`))
   * expect(triggers[0].n).toBe(25)
   * const flags = linhas<{ n: number }>(await db.execute(sql`select count(*)::int as n from flags`))
   * expect(flags[0].n).toBe(10) // 4 (0031) + 1 (0036) + 1 (0040) + 1 (0046) + 2 (0048) + 1 (0051)
   */
  it.todo('upsert em vocab_cards ignora o gêmeo apagado (índice parcial casa com o ON CONFLICT)')
  /*
   * Insere (user, norm) com deleted_at, depois insere o mesmo (user, norm) vivo via vocabRepo e espera 2 linhas.
   */
})
