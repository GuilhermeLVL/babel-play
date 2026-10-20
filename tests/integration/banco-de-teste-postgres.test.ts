/**
 * `BANCO_DE_TESTE=postgres` FAZ O `setupEphemeralDb()` USAR UM POSTGRES DE VERDADE (Fase 2, Task 13).
 *
 * Os ~230 arquivos de integração abrem o banco por `setupEphemeralDb()` (direto ou por
 * `tests/caracterizacao/_app.ts`). Com a variável, cada arquivo ganha um `CREATE DATABASE` novo,
 * migrado e apagado no `cleanup()`, e a suíte inteira roda no driver `pg` de produção.
 * A segunda parte só roda com a URL do Postgres de teste (job `postgres-real`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setupEphemeralDb } from '../harness/ephemeralDb'

const URL_BASE = process.env.TESTE_POSTGRES_URL
const antes = { modo: process.env.BANCO_DE_TESTE, url: process.env.DATABASE_URL, base: URL_BASE }

beforeEach(() => vi.resetModules())
afterEach(() => {
  for (const [k, v] of [
    ['BANCO_DE_TESTE', antes.modo],
    ['DATABASE_URL', antes.url],
    ['TESTE_POSTGRES_URL', antes.base],
  ] as const) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('BANCO_DE_TESTE=postgres', () => {
  it('sem a URL do Postgres de teste, recusa com erro de configuração claro', async () => {
    process.env.BANCO_DE_TESTE = 'postgres'
    delete process.env.TESTE_POSTGRES_URL
    await expect(setupEphemeralDb()).rejects.toThrow(/BANCO_DE_TESTE=postgres.*TESTE_POSTGRES_URL/)
  })

  it.skipIf(!URL_BASE)('com a URL, devolve um banco descartável novo a cada chamada', async () => {
    process.env.BANCO_DE_TESTE = 'postgres'
    const a = await setupEphemeralDb()
    const urlA = process.env.DATABASE_URL
    await a.cleanup()
    vi.resetModules()
    const b = await setupEphemeralDb()
    const urlB = process.env.DATABASE_URL
    try {
      expect(urlA).toMatch(/^postgres/)
      expect(urlB).toMatch(/^postgres/)
      expect(urlA).not.toBe(urlB)
      const { db } = await b.load<typeof import('../../server/db/db')>('../../server/db/db')
      const r = await db.execute('select count(*)::int as n from drizzle.__drizzle_migrations' as never)
      expect((r as { rows: Array<{ n: number }> }).rows[0].n).toBeGreaterThan(0)
    } finally {
      await b.cleanup()
    }
  })
})
