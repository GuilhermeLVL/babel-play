/**
 * Banco — PRAGMAs de concorrência (correção do P0-2 da auditoria).
 *
 * `createClient({ url })` seco deixava o SQLite em `journal_mode=delete` com
 * `busy_timeout=0`: o escritor toma lock exclusivo do arquivo e qualquer concorrente
 * recebe SQLITE_BUSY IMEDIATAMENTE, sem esperar. Com 2 processos, 21,5% das escritas
 * falhavam; com 3, 28,9% (scripts/audit/diag-wal.mjs).
 *
 * WAL + busy_timeout zeraram as duas medições. Este teste amarra os PRAGMAs para que
 * ninguém volte ao default sem perceber.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let dbMod: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  dbMod = await h.load('../../server/db/db')
  await dbMod.dbReady // os PRAGMAs são aplicados de forma assíncrona no load
})
afterAll(async () => { await h.cleanup() })

describe('PRAGMAs de concorrência', () => {
  it('journal_mode é WAL (escritor não bloqueia leitor, e escritas entre processos não falham)', async () => {
    const r = await dbMod.client.execute('PRAGMA journal_mode')
    expect(String(Object.values(r.rows[0])[0]).toLowerCase()).toBe('wal')
  })

  it('busy_timeout é > 0 (concorrente ESPERA em vez de falhar na hora)', async () => {
    const r = await dbMod.client.execute('PRAGMA busy_timeout')
    expect(Number(Object.values(r.rows[0])[0])).toBeGreaterThanOrEqual(5000)
  })

  it('foreign_keys ligado (o SQLite ignora FK por padrão)', async () => {
    const r = await dbMod.client.execute('PRAGMA foreign_keys')
    expect(Number(Object.values(r.rows[0])[0])).toBe(1)
  })

  it('dbReady resolve sem erro', async () => {
    await expect(dbMod.dbReady).resolves.not.toThrow()
  })
})
