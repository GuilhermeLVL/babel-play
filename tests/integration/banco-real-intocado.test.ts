/**
 * A suíte NÃO pode tocar `data/pg` (o banco real do desenvolvedor).
 *
 * Aconteceu de verdade durante a re-auditoria (ainda no SQLite, `data/babel.db`): um teste de
 * migração chamou `aplicarMigrations()` sobre uma instância de `db` ligada ao caminho default e
 * aplicou a migração 0006 no banco de trabalho. Não houve perda — a migração só recria índices —
 * mas o mesmo caminho serviria para um DELETE.
 *
 * Causa: `.env` não define `DATABASE_URL` e `server/db/db.ts` cai em `pglite:./data/pg`.
 * Rede: `tests/setup-db-isolada.ts` (setupFile do vitest) aponta para um PGlite em memória.
 */
import { describe, expect, it } from 'vitest'

describe('isolamento do banco na suíte', () => {
  it('DATABASE_URL começa com pglite://memory: nada em disco, nada do desenvolvedor', () => {
    const url = process.env.DATABASE_URL ?? ''
    expect(url.startsWith('pglite://memory')).toBe(true)
    expect(url.toLowerCase()).not.toContain('data/pg')
    expect(url.toLowerCase()).not.toContain('data\\pg')
    expect(url.toLowerCase()).not.toContain('babel.db')
  })

  it('o módulo db resolvido usa esse banco, não o default', async () => {
    const { bancoEmbutido, db, urlDoBanco } = await import('../../server/db/db')
    const { sql } = await import('drizzle-orm')
    expect(urlDoBanco()).toBe(process.env.DATABASE_URL)
    expect(urlDoBanco()).not.toBe('pglite:./data/pg')
    expect(bancoEmbutido()).toBe(true)
    // `execute` no banco descartável funciona; o que importa é que não é o real.
    await expect(db.execute(sql`SELECT 1`)).resolves.toBeTruthy()
  })
})
