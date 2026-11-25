/**
 * A MIGRAÇÃO 0035 (`opcoes_da_revisao`, openspec `cartoes` 2.2; número provisório) É REVERSÍVEL E SÓ EXPAND:
 * a tabela nasce vazia, o código sem ela segue valendo (sem linha = padrão), a REVERSÃO documentada
 * (`DROP TABLE`) a remove inteira e o mesmo SQL a recria. Os dados dos outros cartões e do agendamento não são
 * tocados em nenhum dos dois sentidos.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const ARQUIVO = path.join(__dirname, '../../server/db/migrations-pg/0035_opcoes_da_revisao.sql')

describe('migração 0035 opcoes_da_revisao', () => {
  let h: EphemeralDb
  beforeAll(async () => {
    h = await setupEphemeralDb()
  })
  afterAll(async () => {
    await h.cleanup()
  })

  it('nasce vazia, com RLS; reverter derruba a tabela e reaplicar recria (ida, volta e ida)', async () => {
    const { db, linhas } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
    const existe = async () =>
      linhas<{ n: number }>(
        await db.execute(
          sql`select count(*)::int as n from information_schema.tables where table_name = 'opcoes_da_revisao'`,
        ),
      )[0].n
    const rls = async () =>
      linhas<{ r: boolean }>(
        await db.execute(sql`select relrowsecurity as r from pg_class where relname = 'opcoes_da_revisao'`),
      )[0].r

    expect(await existe()).toBe(1)
    expect(await rls()).toBe(true)
    expect(linhas<{ n: number }>(await db.execute(sql`select count(*)::int as n from opcoes_da_revisao`))[0].n).toBe(0)

    // Um dado que NÃO é da tabela: tem de sobreviver à reversão.
    const antes = linhas<{ n: number }>(await db.execute(sql`select count(*)::int as n from flags`))[0].n

    await db.execute(sql.raw('DROP TABLE "opcoes_da_revisao"'))
    expect(await existe()).toBe(0)
    expect(linhas<{ n: number }>(await db.execute(sql`select count(*)::int as n from flags`))[0].n).toBe(antes)

    const passos = readFileSync(ARQUIVO, 'utf8')
      .split('--> statement-breakpoint')
      .map((p) => p.trim())
      .filter(Boolean)
    for (const p of passos) await db.execute(sql.raw(p))
    expect(await existe()).toBe(1)
    expect(await rls()).toBe(true)
  })
})
