/**
 * Aplica as migrations do Drizzle ao banco local. Idempotente.
 * Uso: `npm run db:migrate` (gere antes com `npm run db:generate`).
 */
import 'dotenv/config'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { client, db } from './db'

const url = process.env.DATABASE_URL ?? 'file:./data/babel.db'
const filePath = url.replace(/^file:/, '')
mkdirSync(dirname(filePath), { recursive: true })

await migrate(db, { migrationsFolder: './server/db/migrations' })

const tables = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
)
console.log('[db] migrations aplicadas em', filePath)
console.log('[db] tabelas:', tables.rows.map((r) => r.name).join(', '))
process.exit(0)
