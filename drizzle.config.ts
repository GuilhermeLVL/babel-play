import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Dialeto SQLite agora; portável a Postgres/Supabase trocando `dialect` + driver.
// Só tipos de coluna portáveis no schema (ver server/db/schema.ts).
export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: (process.env.DATABASE_URL ?? 'file:./data/babel.db').replace(/^file:/, ''),
  },
});
