/**
 * Uma réplica NÃO precisa das migrations para servir um banco já migrado (P1-N1 da v2).
 *
 * Regressão medida na re-auditoria: desde que o boot passou a aplicar migrations e a
 * `process.exit(1)` em qualquer falha, um processo cujo cwd não contém a pasta de migrations
 * se recusa a subir — MESMO com o schema já pronto:
 *
 *   cwd do repo                                → sobe
 *   cwd isolado sem migrations, banco migrado  → exit 1 "Can't find meta/_journal.json"
 *
 * Isso quebra a topologia comum (um nó migra, os outros servem).
 *
 * O contrato correto: falhar quando NÃO DÁ para migrar e o schema está ausente; seguir quando
 * simplesmente NÃO PRECISA migrar.
 *
 * Postgres (Fase 1 da migração): o banco é o PGlite em memória do harness; "schema presente" é
 * `to_regclass('public.sessions')`. O caso do banco sem schema é simulado tirando `sessions` do
 * lugar (e devolvendo no fim), porque o harness tem um banco só por arquivo.
 */
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { clienteSql } from '../harness/clienteSql'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const ORIG = process.env.MIGRATIONS_DIR
let h: EphemeralDb
let aplicarMigrations: () => Promise<void>
let client: ReturnType<typeof clienteSql>

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ aplicarMigrations } = await h.load<{ aplicarMigrations: () => Promise<void> }>('../../server/db/manutencao'))
  client = clienteSql(await h.load('../../server/db/db'))
})
afterAll(async () => {
  if (ORIG === undefined) delete process.env.MIGRATIONS_DIR
  else process.env.MIGRATIONS_DIR = ORIG
  await h.cleanup()
})

const temTabelas = async () => {
  const r = await client.execute("SELECT to_regclass('public.sessions') IS NOT NULL AS ok")
  return r.rows[0]?.ok === true
}

describe('aplicarMigrations — réplica sem a pasta de migrations', () => {
  it('primeiro boot: migra normalmente quando a pasta existe', async () => {
    process.env.MIGRATIONS_DIR = path.resolve('server', 'db', 'migrations-pg')
    await aplicarMigrations()
    expect(await temTabelas()).toBe(true)
  })

  it('banco JÁ migrado + pasta ausente → segue em frente (é o caso da réplica)', async () => {
    process.env.MIGRATIONS_DIR = path.join(path.resolve('.'), 'nao-existe-migrations')
    await expect(aplicarMigrations()).resolves.toBeUndefined()
    expect(await temTabelas()).toBe(true) // não destruiu nada
  })

  it('banco SEM schema + pasta ausente → FALHA (não dá para servir sem schema)', async () => {
    process.env.MIGRATIONS_DIR = path.join(path.resolve('.'), 'nao-existe-migrations')
    await client.execute('ALTER TABLE sessions RENAME TO sessions_fora')
    try {
      expect(await temTabelas()).toBe(false)
      await expect(aplicarMigrations()).rejects.toThrow()
    } finally {
      await client.execute('ALTER TABLE sessions_fora RENAME TO sessions')
    }
    expect(await temTabelas()).toBe(true)
  })
})
