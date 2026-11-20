/**
 * Harness de banco EFÊMERO para testes de integração de servidor.
 *
 * Nasceu da auditoria 2026-08 (Fase 5): os PoCs que confirmaram S-01/S-05 subiam um servidor real
 * contra um banco de teste isolado. Isto formaliza o padrão — sobe um Postgres embutido (PGlite) em
 * MEMÓRIA, já migrado, sem tocar `data/pg`, descartado ao fechar.
 *
 * Por que import dinâmico: `server/db/db.ts` lê `DATABASE_URL` no MOMENTO do import. Os imports
 * estáticos são hoisted acima de qualquer statement, então a env precisa ser setada ANTES de o
 * módulo `db` ser carregado. Daí `setupEphemeralDb()` setar a env e devolver um `load()` que faz o
 * import dinâmico dos repos/proxies já apontados para o banco efêmero.
 *
 * O módulo `db` fica em cache por worker do vitest: um segundo `setupEphemeralDb()` no mesmo arquivo
 * reaproveita o MESMO banco em memória (as migrações são idempotentes, os dados persistem). E, depois de
 * `cleanup()`, esse banco está FECHADO e não reabre: use UM harness por arquivo de teste.
 *
 * MODO POSTGRES (Fase 2, Task 13): com `BANCO_DE_TESTE=postgres` e `TESTE_POSTGRES_URL`, em vez do PGlite
 * cada chamada cria um banco descartável num Postgres de verdade (`postgresDescartavel`), migrado pelo driver
 * `pg` e apagado no `cleanup()`. É como o job `postgres-real` do CI roda a integração inteira. Sem a URL, o
 * modo recusa com erro de configuração (nunca cai em silêncio para o PGlite).
 *
 * Uso (num arquivo *.test.ts que NÃO importe estaticamente nada de server/db):
 *
 *   let h: EphemeralDb
 *   beforeAll(async () => { h = await setupEphemeralDb() })
 *   afterAll(async () => { await h.cleanup() })
 *   it('...', async () => {
 *     const { credentialsRepo } = await h.load('../../server/db/repositories/credentials')
 *   })
 */
import { bancoPostgresDescartavel } from './postgresDescartavel'

export interface EphemeralDb {
  /** Import dinâmico de um módulo de servidor já ligado ao banco efêmero. */
  load: <T = Record<string, unknown>>(spec: string) => Promise<T>
  /** Fecha o banco embutido. */
  cleanup: () => Promise<void>
}

async function setupPostgresDescartavel(): Promise<EphemeralDb> {
  const base = process.env.TESTE_POSTGRES_URL
  if (!base) {
    throw new Error(
      'BANCO_DE_TESTE=postgres exige TESTE_POSTGRES_URL (URL de um Postgres de teste, ex.: postgres://u:s@localhost:5432/postgres)',
    )
  }
  if (process.env.NODE_ENV === 'production') process.env.NODE_ENV = 'test'
  const descartavel = await bancoPostgresDescartavel(base)
  process.env.DATABASE_URL = descartavel.url
  const { db, fecharBanco } = await import('../../server/db/db')
  try {
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    await migrate(db as Parameters<typeof migrate>[0], {
      migrationsFolder: process.env.MIGRATIONS_DIR ?? './server/db/migrations-pg',
    })
  } catch (e) {
    await fecharBanco().catch(() => {})
    await descartavel.apagar().catch(() => {})
    throw e
  }
  return {
    load: <T = Record<string, unknown>>(spec: string) => import(spec) as Promise<T>,
    async cleanup() {
      try {
        await fecharBanco()
      } finally {
        await descartavel.apagar()
      }
    },
  }
}

export async function setupEphemeralDb(): Promise<EphemeralDb> {
  if (process.env.BANCO_DE_TESTE === 'postgres') return setupPostgresDescartavel()
  // Precede QUALQUER import de server/db/db.ts.
  process.env.DATABASE_URL = 'pglite://memory'
  // Em teste não queremos abortar por SECRET_KEY ausente (só produção exige).
  if (process.env.NODE_ENV === 'production') process.env.NODE_ENV = 'test'

  const { db, fecharBanco } = await import('../../server/db/db')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  await migrate(db as Parameters<typeof migrate>[0], {
    migrationsFolder: process.env.MIGRATIONS_DIR ?? './server/db/migrations-pg',
  })

  return {
    load: <T = Record<string, unknown>>(spec: string) => import(spec) as Promise<T>,
    async cleanup() {
      try {
        await fecharBanco()
      } catch {
        /* já fechado */
      }
    },
  }
}
