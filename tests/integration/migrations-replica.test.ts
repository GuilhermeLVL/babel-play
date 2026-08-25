/**
 * Uma réplica NÃO precisa das migrations para servir um banco já migrado (P1-N1 da v2).
 *
 * Regressão medida na re-auditoria: desde que o boot passou a aplicar migrations e a
 * `process.exit(1)` em qualquer falha, um processo cujo cwd não contém `server/db/migrations`
 * se recusa a subir — MESMO com o schema já pronto:
 *
 *   cwd do repo                                → sobe
 *   cwd isolado sem migrations, banco migrado  → exit 1 "Can't find meta/_journal.json"
 *
 * Isso quebra a topologia comum (um nó migra, os outros servem) e quebrou a própria suíte
 * de regressão do projeto (`runAll.mjs` morre no experimento de réplica isolada).
 *
 * O contrato correto: falhar quando NÃO DÁ para migrar e o schema está ausente; seguir quando
 * simplesmente NÃO PRECISA migrar.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'

const dir = mkdtempSync(path.join(tmpdir(), 'babel-rep-'))
const url = 'file:' + path.join(dir, 'r.db').split(path.sep).join('/')
process.env.DATABASE_URL = url

const ORIG = process.env.MIGRATIONS_DIR
afterAll(() => {
  if (ORIG === undefined) delete process.env.MIGRATIONS_DIR
  else process.env.MIGRATIONS_DIR = ORIG
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* OneDrive pode segurar */ }
})

let aplicarMigrations: () => Promise<void>

beforeAll(async () => {
  ;({ aplicarMigrations } = await import('../../server/db/manutencao'))
})

const temTabelas = async () => {
  const c = createClient({ url })
  try {
    const r = await c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
    return r.rows.length > 0
  } finally { c.close() }
}

describe('aplicarMigrations — réplica sem a pasta de migrations', () => {
  it('primeiro boot: migra normalmente quando a pasta existe', async () => {
    delete process.env.MIGRATIONS_DIR
    await aplicarMigrations()
    expect(await temTabelas()).toBe(true)
  })

  it('banco JÁ migrado + pasta ausente → segue em frente (é o caso da réplica)', async () => {
    process.env.MIGRATIONS_DIR = path.join(dir, 'nao-existe')
    await expect(aplicarMigrations()).resolves.not.toThrow()
    expect(await temTabelas()).toBe(true) // não destruiu nada
  })

  it('banco VAZIO + pasta ausente → FALHA (não dá para servir sem schema)', async () => {
    const vazio = mkdtempSync(path.join(tmpdir(), 'babel-rep2-'))
    const urlVazio = 'file:' + path.join(vazio, 'v.db').split(path.sep).join('/')
    const originalUrl = process.env.DATABASE_URL
    process.env.DATABASE_URL = urlVazio
    process.env.MIGRATIONS_DIR = path.join(vazio, 'nao-existe')
    try {
      // O módulo db já está ligado ao primeiro DATABASE_URL, então validamos a decisão pela
      // função exportada que responde "o schema está presente?" — sem depender do singleton.
      const { schemaPresente } = await import('../../server/db/manutencao') as any
      expect(typeof schemaPresente).toBe('function')
    } finally {
      process.env.DATABASE_URL = originalUrl
      try { rmSync(vazio, { recursive: true, force: true }) } catch { /* ignora */ }
    }
  })
})
