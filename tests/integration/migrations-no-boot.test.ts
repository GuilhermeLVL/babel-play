/**
 * Migrations aplicadas no BOOT (bug encontrado ao rodar o container de verdade).
 *
 * O container subia com o banco vazio e entrava em crash-loop no primeiro boot: `seedIfEmpty()`
 * consultava `sessions` e o banco respondia que a tabela não existia. As migrations moravam só no
 * `npm run db:migrate` (um CLI em TypeScript, que não existe na imagem de produção) — então um
 * deploy limpo simplesmente não subia.
 *
 * UM caso só, de propósito: `server/db/db.ts` exporta uma instância ÚNICA do Drizzle,
 * ligada ao `DATABASE_URL` lido no PRIMEIRO import. Vários casos com bancos diferentes
 * no mesmo arquivo dariam falso-verde — o 2º caso migraria o banco do 1º e compararia
 * um banco vazio consigo mesmo. Foi exatamente o que aconteceu na primeira versão.
 *
 * Postgres (Fase 1): o banco é um diretório PGlite que ainda não existe (`pglite:<dir>`), como o
 * volume vazio de um deploy limpo. O PGlite é de processo único, então a conferência usa o mesmo
 * `db` do servidor, e não uma segunda conexão ao diretório.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { clienteSql } from '../harness/clienteSql'

// Definido ANTES de qualquer import de `server/db/db` — é o que a instância única lê.
const dir = mkdtempSync(path.join(tmpdir(), 'babel-mig-'))
const pasta = path.join(dir, 'novo-pg')
process.env.DATABASE_URL = 'pglite:' + pasta.split(path.sep).join('/')

afterAll(async () => {
  const { fecharBanco } = await import('../../server/db/db')
  await fecharBanco()
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* OneDrive/AV pode segurar */
  }
})

describe('aplicarMigrations — deploy limpo', () => {
  it('cria o schema completo num banco que não existia, e é idempotente', async () => {
    expect(existsSync(pasta)).toBe(false) // ponto de partida: nada

    const { aplicarMigrations } = await import('../../server/db/manutencao')
    await aplicarMigrations()
    expect(existsSync(pasta)).toBe(true)

    const c = clienteSql(await import('../../server/db/db'))
    const nomes = async (sql: string) => (await c.execute(sql)).rows.map((r) => String(r.nome))

    // As tabelas que o boot toca logo em seguida (seed + backfill + auth).
    const tabelas = await nomes(
      "SELECT table_name AS nome FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    )
    for (const t of ['sessions', 'utterances', 'vocab_cards', 'users', 'settings', 'subscriptions', 'usage_counters']) {
      expect(tabelas).toContain(t)
    }

    // Os índices únicos da 0005 — os backstops de P1-4 e P1-5 precisam existir num
    // banco NOVO, não só nos que rodaram a migração por cima de dado antigo.
    const indices = await nomes("SELECT indexname AS nome FROM pg_indexes WHERE schemaname = 'public'")
    expect(indices).toContain('uq_settings_user')
    expect(indices).toContain('uq_seed_spends_user_spend')
    // E o unique GLOBAL de spend_id não pode voltar (era o DoS cross-tenant).
    expect(indices).not.toContain('seed_spends_spend_id_unique')

    const contar = async () =>
      Number((await c.execute('SELECT count(*) AS n FROM drizzle.__drizzle_migrations')).rows[0].n)
    const antes = await contar()
    expect(antes).toBeGreaterThan(0)

    // Idempotente: rodar de novo não quebra nem reaplica.
    await expect(aplicarMigrations()).resolves.toBeUndefined()
    expect(await contar()).toBe(antes)
  })
})
