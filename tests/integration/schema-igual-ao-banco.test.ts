/**
 * O `schema.ts` É O BANCO QUE AS MIGRATIONS PRODUZEM — e o último snapshot do drizzle concorda com os dois.
 *
 * Auditoria de prontidão, Fase 6. As migrations 0023 e 0025–0030 foram escritas à mão e entraram sem
 * snapshot; o `drizzle-kit generate` passou a comparar o `schema.ts` com o snapshot da 0024 e a
 * propor sete migrations de diferença já aplicadas. Pior: nada conferia se o `schema.ts` (que o
 * código usa para montar as queries) descrevia o banco de verdade. Este teste confere as duas coisas:
 *
 *   1. aplica TODAS as migrations num banco vazio em memória e pede ao drizzle-kit
 *      (`pushSQLiteSchema`, introspecção do banco vivo) o diff até o `schema.ts`. Tem que ser vazio.
 *      Foi assim que apareceu o `rank.combo DEFAULT 0` que existia no banco e faltava no schema;
 *   2. o snapshot da ÚLTIMA migration existe e não difere do `schema.ts` — é exatamente a conta que
 *      o `drizzle-kit generate` faz. Diferente de vazio = o próximo `db:generate` produziria SQL
 *      falso (ou travaria num prompt de renomeação no CI).
 *
 * DUAS LIMITAÇÕES CONHECIDAS da introspecção do drizzle-kit para SQLite, tratadas por nome e com
 * conferência própria (e não por lista de exceção cega):
 *   - índice PARCIAL (`WHERE deleted_at IS NULL`): a introspecção não lê o `WHERE`, então o diff
 *     sempre propõe `DROP INDEX x` + `CREATE INDEX x ... WHERE`. Aceito SÓ se o índice do banco
 *     também tiver `WHERE` (conferido no `sqlite_master`);
 *   - coluna GERADA (`GENERATED ALWAYS AS`): a introspecção não lê a expressão, e o diff propõe
 *     `DROP COLUMN` + `ADD ... GENERATED`. Aceito SÓ se a coluna do banco for gerada de fato
 *     (`hidden` 2 ou 3 no `table_xinfo`).
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { describe, expect, it } from 'vitest'

import * as schema from '../../server/db/schema'

const PASTA = path.resolve(__dirname, '..', '..', 'server', 'db', 'migrations')

describe('schema.ts × migrations × snapshot do drizzle', () => {
  it('o banco migrado do zero é o que o schema.ts descreve (introspecção pelo drizzle-kit)', async () => {
    const { pushSQLiteSchema } = await import('drizzle-kit/api')
    const cliente = createClient({ url: 'file::memory:' })
    const db = drizzle(cliente)
    await migrate(db, { migrationsFolder: PASTA })

    const { statementsToExecute } = await pushSQLiteSchema(schema as Record<string, unknown>, db as never)
    /* Tabelas que vivem FORA do schema.ts de propósito, como `__drizzle_migrations`: contabilidade
       interna mantida por gatilho (`versoes_de_dados`, migração 0032 — fora para não entrar no export
       LGPD). O drizzle só as veria como "sobrando" e mandaria apagar. */
    const FORA_DO_SCHEMA = ['versoes_de_dados']
    let resto = statementsToExecute.filter((s) => !FORA_DO_SCHEMA.some((t) => s.includes('`' + t + '`')))

    // Índice parcial: DROP INDEX `x` + CREATE ... INDEX `x` ... WHERE — só se o banco também tem WHERE.
    for (const drop of statementsToExecute) {
      const m = /^DROP INDEX `([^`]+)`;?$/.exec(drop.trim())
      if (!m) continue
      const create = resto.find((s) => new RegExp(`^CREATE (UNIQUE )?INDEX \`${m[1]}\` .* WHERE `, 's').test(s))
      if (!create) continue
      const noBanco = await cliente.execute({
        sql: "SELECT sql FROM sqlite_master WHERE type='index' AND name=?",
        args: [m[1]],
      })
      const sqlDoBanco = String(noBanco.rows[0]?.sql ?? '')
      expect(sqlDoBanco, `o índice ${m[1]} é parcial no schema.ts e não no banco`).toMatch(/\bWHERE\b/i)
      resto = resto.filter((s) => s !== drop && s !== create)
    }

    // Coluna gerada: DROP COLUMN + ADD ... GENERATED — só se a coluna do banco é gerada de fato.
    for (const drop of statementsToExecute) {
      const m = /^ALTER TABLE `([^`]+)` DROP COLUMN `([^`]+)`;?$/.exec(drop.trim())
      if (!m) continue
      const add = resto.find(
        (s) => s.startsWith(`ALTER TABLE \`${m[1]}\` ADD \`${m[2]}\``) && /GENERATED ALWAYS AS/.test(s),
      )
      if (!add) continue
      const info = await cliente.execute(`PRAGMA table_xinfo(${m[1]})`)
      const coluna = info.rows.find((r) => r.name === m[2])
      expect([2, 3], `${m[1]}.${m[2]} é gerada no schema.ts e não no banco`).toContain(Number(coluna?.hidden))
      resto = resto.filter((s) => s !== drop && s !== add)
    }

    cliente.close()
    expect(resto, 'o schema.ts diverge do banco que as migrations produzem').toEqual([])
  }, 60_000)

  it('o snapshot da última migration existe e não difere do schema.ts (o que o `drizzle-kit generate` compara)', async () => {
    const { generateSQLiteDrizzleJson, generateSQLiteMigration } = await import('drizzle-kit/api')
    const journal = JSON.parse(readFileSync(path.join(PASTA, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[]
    }
    const ultima = journal.entries[journal.entries.length - 1].tag.slice(0, 4)
    const snapshots = readdirSync(path.join(PASTA, 'meta'))
      .filter((n) => /^\d{4}_snapshot\.json$/.test(n))
      .sort()
    expect(
      snapshots.at(-1),
      'falta o snapshot da última migration: rode `npx tsx scripts/migracoes/snapshot-do-schema.ts`',
    ).toBe(`${ultima}_snapshot.json`)

    const anterior = JSON.parse(readFileSync(path.join(PASTA, 'meta', `${ultima}_snapshot.json`), 'utf8'))
    const atual = await generateSQLiteDrizzleJson(schema as Record<string, unknown>, anterior.id)
    const sql = await generateSQLiteMigration(anterior, atual)
    expect(
      sql,
      'o `drizzle-kit generate` produziria esta migration: o snapshot está velho ou o schema.ts mudou sem migration',
    ).toEqual([])
  }, 60_000)
})
