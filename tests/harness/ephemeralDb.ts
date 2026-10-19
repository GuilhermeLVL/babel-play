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
 * reaproveita o MESMO banco em memória (as migrações são idempotentes, os dados persistem).
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
export interface EphemeralDb {
  /** Import dinâmico de um módulo de servidor já ligado ao banco efêmero. */
  load: <T = Record<string, unknown>>(spec: string) => Promise<T>
  /** Fecha o banco embutido. */
  cleanup: () => Promise<void>
}

export async function setupEphemeralDb(): Promise<EphemeralDb> {
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
