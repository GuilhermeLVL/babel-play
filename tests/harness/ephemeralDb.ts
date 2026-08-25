/**
 * Harness de banco EFÊMERO para testes de integração de servidor.
 *
 * Nasceu da auditoria 2026-08 (Fase 5): os PoCs que confirmaram S-01/S-05 subiam um servidor real
 * contra um banco de teste isolado. Isto formaliza o padrão — sobe um SQLite temporário migrado,
 * sem tocar `data/babel.db`, com limpeza automática.
 *
 * Por que import dinâmico: `server/db/db.ts:13` lê `DATABASE_URL` no MOMENTO do import. Os imports
 * estáticos são hoisted acima de qualquer statement, então a env precisa ser setada ANTES de o
 * módulo `db` ser carregado. Daí `setupEphemeralDb()` setar a env e devolver um `load()` que faz o
 * import dinâmico dos repos/proxies já apontados para o banco efêmero.
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
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface EphemeralDb {
  /** Caminho do arquivo SQLite temporário. */
  dbPath: string
  /** Import dinâmico de um módulo de servidor já ligado ao banco efêmero. */
  load: <T = Record<string, unknown>>(spec: string) => Promise<T>
  /** Fecha o cliente e apaga o diretório temporário. */
  cleanup: () => Promise<void>
}

export async function setupEphemeralDb(): Promise<EphemeralDb> {
  const dir = mkdtempSync(join(tmpdir(), 'babel-test-'))
  const dbPath = join(dir, 'test.db')
  // Precede QUALQUER import de server/db/db.ts.
  process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`
  // Em teste não queremos abortar por SECRET_KEY ausente (só produção exige).
  if (process.env.NODE_ENV === 'production') process.env.NODE_ENV = 'test'

  const { db, client } = await import('../../server/db/db')
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  await migrate(db, { migrationsFolder: './server/db/migrations' })

  return {
    dbPath,
    load: <T = Record<string, unknown>>(spec: string) => import(spec) as Promise<T>,
    async cleanup() {
      try { (client as { close?: () => void }).close?.() } catch { /* já fechado */ }
      try { rmSync(dir, { recursive: true, force: true }) } catch { /* OneDrive pode travar o unlink; best-effort */ }
    },
  }
}
