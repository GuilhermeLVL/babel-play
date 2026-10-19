/**
 * Aplica as migrations do Drizzle ao banco configurado em `DATABASE_URL`. Idempotente.
 * Uso: `npm run db:migrate` (gere antes com `npm run db:generate`).
 */
import 'dotenv/config'

import { sql } from 'drizzle-orm'
import { migrate as migrarNode } from 'drizzle-orm/node-postgres/migrator'
import { migrate as migrarPglite } from 'drizzle-orm/pglite/migrator'

import { analisarBancoEmbutido, bancoEmbutido, db, fecharBanco, linhas, urlDoBanco } from './db'

const migrationsFolder = process.env.MIGRATIONS_DIR ?? './server/db/migrations-pg'

if (bancoEmbutido) await migrarPglite(db as Parameters<typeof migrarPglite>[0], { migrationsFolder })
else await migrarNode(db as Parameters<typeof migrarNode>[0], { migrationsFolder })
// Estatística para o planejador no PGlite, que não tem autoanalyze (ver `analisarBancoEmbutido`).
await analisarBancoEmbutido()

const tabelas = linhas<{ table_name: string }>(
  await db.execute(
    sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
  ),
)
console.log('[db] migrations aplicadas em', bancoEmbutido ? urlDoBanco : 'postgres')
console.log('[db] tabelas:', tabelas.map((r) => r.table_name).join(', '))
await fecharBanco()
process.exit(0)
