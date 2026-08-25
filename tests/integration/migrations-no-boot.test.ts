/**
 * Migrations aplicadas no BOOT (bug encontrado ao rodar o container de verdade).
 *
 * O container subia com `/data/babel.db` vazio e entrava em crash-loop no primeiro boot:
 * `seedIfEmpty()` consultava `sessions` e o SQLite respondia `no such table: sessions`.
 * As migrations moravam só no `npm run db:migrate` (um CLI em TypeScript, que não existe
 * na imagem de produção) — então um deploy limpo simplesmente não subia.
 *
 * UM caso só, de propósito: `server/db/db.ts` exporta uma instância ÚNICA do Drizzle,
 * ligada ao `DATABASE_URL` lido no PRIMEIRO import. Vários casos com bancos diferentes
 * no mesmo arquivo dariam falso-verde — o 2º caso migraria o banco do 1º e compararia
 * um banco vazio consigo mesmo. Foi exatamente o que aconteceu na primeira versão.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'

// Definido ANTES de qualquer import de `server/db/db` — é o que a instância única lê.
const dir = mkdtempSync(path.join(tmpdir(), 'babel-mig-'))
const file = path.join(dir, 'novo.db')
const url = 'file:' + file.split(path.sep).join('/')
process.env.DATABASE_URL = url

afterAll(() => {
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* OneDrive/AV pode segurar */ }
})

describe('aplicarMigrations — deploy limpo', () => {
  it('cria o schema completo num banco que não existia, e é idempotente', async () => {
    expect(existsSync(file)).toBe(false) // ponto de partida: nada

    const { aplicarMigrations } = await import('../../server/db/manutencao')
    await aplicarMigrations()

    const c = createClient({ url })
    try {
      const nomes = async (tipo: string) =>
        (await c.execute(`SELECT name FROM sqlite_master WHERE type='${tipo}'`)).rows.map((r: any) => r.name as string)

      // As tabelas que o boot toca logo em seguida (seed + backfill + auth).
      const tabelas = await nomes('table')
      for (const t of ['sessions', 'utterances', 'vocab_cards', 'users', 'settings', 'subscriptions', 'usage_counters']) {
        expect(tabelas).toContain(t)
      }

      // Os índices únicos da 0005 — os backstops de P1-4 e P1-5 precisam existir num
      // banco NOVO, não só nos que rodaram a migração por cima de dado antigo.
      const indices = await nomes('index')
      expect(indices).toContain('uq_settings_user')
      expect(indices).toContain('uq_seed_spends_user_spend')
      // E o unique GLOBAL de spend_id não pode voltar (era o DoS cross-tenant).
      expect(indices).not.toContain('seed_spends_spend_id_unique')

      const antes = (await c.execute('SELECT count(*) n FROM __drizzle_migrations')).rows[0]

      // Idempotente: rodar de novo não quebra nem reaplica.
      await expect(aplicarMigrations()).resolves.not.toThrow()
      const depois = (await c.execute('SELECT count(*) n FROM __drizzle_migrations')).rows[0]
      expect(depois).toEqual(antes)
    } finally {
      c.close()
    }
  })
})
