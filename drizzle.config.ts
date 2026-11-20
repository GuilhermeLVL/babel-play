import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

// Postgres: `generate` não conecta; a URL só serve a `push`/`studio`.
export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations-pg',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost/babel',
  },
})
