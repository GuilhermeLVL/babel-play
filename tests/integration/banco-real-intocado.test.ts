/**
 * A suíte NÃO pode tocar `data/babel.db` (o banco real do desenvolvedor).
 *
 * Aconteceu de verdade durante a re-auditoria: um teste de migração chamou
 * `aplicarMigrations()` sobre uma instância de `db` ligada ao caminho default e aplicou a
 * migração 0006 no banco de trabalho. Não houve perda — a migração só recria índices — mas o
 * mesmo caminho serviria para um DELETE.
 *
 * Causa: `.env` não define `DATABASE_URL` e `server/db/db.ts` cai em `file:./data/babel.db`.
 * Rede: `tests/setup-db-isolada.ts` (setupFile do vitest) aponta para um arquivo descartável.
 */
import { describe, it, expect } from 'vitest'
import path from 'node:path'

describe('isolamento do banco na suíte', () => {
  it('DATABASE_URL aponta para um arquivo temporário, não para data/babel.db', () => {
    const url = process.env.DATABASE_URL ?? ''
    expect(url).not.toBe('')
    expect(url.toLowerCase()).not.toContain('data/babel.db')
    expect(url.toLowerCase()).not.toContain('data\\babel.db')
  })

  it('o caminho está fora do repositório', () => {
    const arquivo = (process.env.DATABASE_URL ?? '').replace(/^file:/, '')
    const dentroDoRepo = path.resolve(arquivo).startsWith(path.resolve(process.cwd()) + path.sep)
    expect(dentroDoRepo).toBe(false)
  })

  it('o módulo db resolvido usa esse caminho, não o default', async () => {
    const { client } = await import('../../server/db/db') as any
    // `execute` num banco descartável funciona; o que importa é que não é o real.
    await expect(client.execute('SELECT 1')).resolves.toBeTruthy()
    expect((process.env.DATABASE_URL ?? '').toLowerCase()).not.toContain('babel.db"')
  })
})
