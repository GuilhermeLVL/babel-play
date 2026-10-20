/**
 * AS MIGRATIONS RODAM SEM `statement_timeout` (Fase 2, Task 5).
 *
 * A migration 0004 grava no PAPEL do banco um `statement_timeout` de 30 s (o pooler e o Hyperdrive
 * ignoram o `options` da sessão), e o pool manda o mesmo prazo. Uma migration longa — índice numa
 * tabela grande, backfill — estouraria no meio. `aplicarMigrations()` abre a conexão das migrations
 * com `SET statement_timeout = 0` (`comConexaoDeMigracao`, em `server/db/db.ts`).
 *
 * A prova: uma migration de teste grava `current_setting('statement_timeout')` numa tabela. Antes, o
 * prazo é posto em 30 s — no PGlite, na sessão (única) do app; no Postgres, no BANCO (`ALTER DATABASE`),
 * que é o que uma sessão nova herda, como herdaria do papel. A migration tem de ver `0`. No PGlite,
 * o prazo do app volta ao que era depois.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import type { EphemeralDb } from '../harness/ephemeralDb'

const URL_PG = process.env.TESTE_POSTGRES_URL
const DIR_ORIGINAL = process.env.MIGRATIONS_DIR

let h: EphemeralDb
let pasta: string
let m: typeof import('../../server/db/db')

beforeAll(async () => {
  pasta = mkdtempSync(path.join(tmpdir(), 'babel-migr-prazo-'))
  mkdirSync(path.join(pasta, 'meta'))
  /* `when` no futuro distante: no PGlite o harness já aplicou as migrations reais, e o migrator do
     Drizzle só aplica as posteriores à última registrada. */
  writeFileSync(
    path.join(pasta, 'meta', '_journal.json'),
    JSON.stringify({
      version: '7',
      dialect: 'postgresql',
      entries: [{ idx: 0, version: '7', when: 9_999_999_999_999, tag: '9999_prazo', breakpoints: true }],
    }),
  )
  writeFileSync(
    path.join(pasta, '9999_prazo.sql'),
    `CREATE TABLE prazo_da_migracao AS SELECT current_setting('statement_timeout') AS v;`,
  )

  h = await abrirBancoDeTeste({ migrar: false })
  m = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
  if (URL_PG) {
    const [{ nome }] = m.linhas<{ nome: string }>(await m.db.execute(sql`select current_database() as nome`))
    await m.db.execute(sql.raw(`ALTER DATABASE "${nome}" SET statement_timeout = '30s'`))
  } else {
    await m.db.execute(sql`SET statement_timeout = '30s'`)
  }

  process.env.MIGRATIONS_DIR = pasta
  try {
    const { aplicarMigrations } =
      await h.load<typeof import('../../server/db/manutencao')>('../../server/db/manutencao')
    await aplicarMigrations()
  } finally {
    if (DIR_ORIGINAL === undefined) delete process.env.MIGRATIONS_DIR
    else process.env.MIGRATIONS_DIR = DIR_ORIGINAL
  }
}, 120_000)

afterAll(async () => {
  await h?.cleanup()
  rmSync(pasta, { recursive: true, force: true })
})

describe('conexão das migrations', () => {
  it('a migration roda com statement_timeout = 0', async () => {
    const [linha] = m.linhas<{ v: string }>(await m.db.execute(sql`select v from prazo_da_migracao`))
    expect(linha?.v).toBe('0')
  })

  it.skipIf(!!URL_PG)('no PGlite, o prazo da sessão do app volta ao que era', async () => {
    const [linha] = m.linhas<{ v: string }>(await m.db.execute(sql`select current_setting('statement_timeout') as v`))
    expect(linha?.v).toBe('30s')
  })
})
