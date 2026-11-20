/**
 * BANCO DE TESTE POR ARQUIVO, para os testes que rodam no PGlite por padrão e num Postgres real com
 * `TESTE_POSTGRES_URL`.
 *
 * Sem a URL: `setupEphemeralDb()` (PGlite em memória). Com a URL: um `CREATE DATABASE` novo por arquivo
 * (`postgresDescartavel`), migrado e apagado no `cleanup()`. Apontar todos os arquivos para o MESMO banco
 * faz duas migrations concorrentes (`--maxWorkers=2`) colidirem em `CREATE SCHEMA "drizzle"` e nas tabelas.
 */
import { type EphemeralDb, setupEphemeralDb } from './ephemeralDb'
import { bancoPostgresDescartavel } from './postgresDescartavel'

export interface OpcoesBancoDeTeste {
  /** Variáveis de ambiente fixadas ANTES de `server/db/db` ser importado (ex.: `DB_POOL_MAX`). */
  env?: Record<string, string>
  /** Aplica as migrations no banco descartável (padrão: sim). Só vale com `TESTE_POSTGRES_URL`. */
  migrar?: boolean
}

export async function abrirBancoDeTeste(opcoes: OpcoesBancoDeTeste = {}): Promise<EphemeralDb> {
  const base = process.env.TESTE_POSTGRES_URL
  if (!base) return setupEphemeralDb()

  Object.assign(process.env, opcoes.env)
  const descartavel = await bancoPostgresDescartavel(base)
  process.env.DATABASE_URL = descartavel.url
  const { db, fecharBanco } = await import('../../server/db/db')
  try {
    if (opcoes.migrar !== false) {
      const { migrate } = await import('drizzle-orm/node-postgres/migrator')
      await migrate(db as Parameters<typeof migrate>[0], {
        migrationsFolder: process.env.MIGRATIONS_DIR ?? './server/db/migrations-pg',
      })
    }
  } catch (e) {
    await fecharBanco().catch(() => {})
    await descartavel.apagar().catch(() => {})
    throw e
  }
  return {
    load: (spec) => import(spec),
    async cleanup() {
      try {
        await fecharBanco()
      } finally {
        await descartavel.apagar()
      }
    },
  }
}
