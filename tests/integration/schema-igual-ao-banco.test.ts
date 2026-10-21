/**
 * O `schema.ts` É O BANCO QUE AS MIGRATIONS PRODUZEM — e o último snapshot do drizzle concorda com os dois.
 *
 * Auditoria de prontidão, Fase 6. No SQLite, migrations escritas à mão entraram sem snapshot e o
 * `drizzle-kit generate` passou a propor sete migrations de diferença já aplicadas; pior, nada
 * conferia se o `schema.ts` (que o código usa para montar as queries) descrevia o banco de verdade.
 * Este teste confere as duas coisas, agora no Postgres:
 *
 *   1. o banco migrado do zero (`migrations-pg`, o PGlite do harness) é o que o `schema.ts`
 *      descreve, lido do CATÁLOGO (`information_schema.columns`, `pg_index`, `pg_constraint`):
 *      as mesmas tabelas; em cada uma, as mesmas colunas com o mesmo tipo, a mesma nulidade, o
 *      mesmo VALOR de default e a mesma coluna gerada; os mesmos índices, com a mesma unicidade, as mesmas
 *      colunas na mesma ordem e o mesmo predicado dos índices parciais; as mesmas FKs.
 *      (No SQLite era a introspecção do drizzle-kit, `pushSQLiteSchema`; o `pushSchema` do Postgres
 *      não roda sobre o PGlite com esta versão do drizzle-orm — falha ao passar parâmetros —, e
 *      ler o catálogo direto também tira as duas exceções que a introspecção do SQLite exigia:
 *      o predicado do índice parcial e a expressão da coluna gerada são conferidos de verdade.)
 *   2. o snapshot mais recente do drizzle não difere do `schema.ts` — a conta que o
 *      `drizzle-kit generate` faz. Diferente de vazio = o próximo `db:generate` produziria SQL falso.
 *      As migrations depois dele (0001 gatilhos e sementes, 0002 segurança do Supabase) são SQL
 *      próprio, sem tabela nem coluna: o mesmo snapshot vale para elas.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { is, SQL } from 'drizzle-orm'
import { getTableConfig, PgDialect, PgTable } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../server/db/schema'
import { chavesEstrangeiras } from '../harness/catalogoPg'
import { clienteSql } from '../harness/clienteSql'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const PASTA = path.resolve(__dirname, '..', '..', 'server', 'db', 'migrations-pg')

let h: EphemeralDb
let c: ReturnType<typeof clienteSql>
beforeAll(async () => {
  h = await setupEphemeralDb()
  c = clienteSql(await h.load('../../server/db/db'))
})
afterAll(async () => {
  await h.cleanup()
})

const dialeto = new PgDialect()
const tabelas = (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable))

/** SQL do drizzle → texto, com os parâmetros inline (só aparecem literais nos predicados). */
function textoDe(s: SQL): string {
  const q = dialeto.sqlToQuery(s)
  return q.sql.replace(/\$(\d+)/g, (_, i) => {
    const v = q.params[Number(i) - 1]
    return typeof v === 'number' ? String(v) : `'${String(v)}'`
  })
}

/**
 * Normaliza uma expressão para comparar o que o drizzle escreve com o que o Postgres devolve em
 * `pg_get_indexdef`/`column_default`: sem aspas, sem o prefixo de tabela, sem parênteses e sem os
 * casts que o Postgres acrescenta (`'x'::text`), minúsculas e espaços colapsados.
 */
function normalizar(expr: string, tabela: string): string {
  return expr
    .replace(new RegExp(`"?${tabela}"?\\.`, 'g'), '')
    .replace(/::[a-z ]+(\[\])?/gi, '')
    .replace(/["()]/g, '')
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Tipo do Postgres como o `information_schema` o escreve, a partir do tipo SQL do drizzle. */
function tipoDoCatalogo(sqlType: string): string {
  const t = sqlType.toLowerCase()
  if (t === 'bigint') return 'bigint'
  if (t === 'integer') return 'integer'
  if (t === 'double precision') return 'double precision'
  if (t === 'boolean') return 'boolean'
  if (t === 'text') return 'text'
  if (t === 'jsonb') return 'jsonb'
  return t
}

/**
 * Um default como o `column_default` o escreve, sem os casts que o Postgres acrescenta (`'x'::text`,
 * `'{}'::text`) e sem os parênteses de expressão. Maiúsculas e o conteúdo das aspas ficam: `'Active'`
 * e `'active'` são defaults diferentes.
 */
const normalizarDefault = (x: string): string =>
  x
    .replace(/::[a-z ]+(\[\])?/gi, '')
    .replace(/^\((.*)\)$/, '$1')
    .trim()

/**
 * O default do drizzle no mesmo formato: número e booleano como estão, texto entre aspas simples (com
 * a aspa interna dobrada), SQL renderizado. `null` = sem default SQL.
 */
function defaultDoSchema(v: unknown): string | null {
  if (v === undefined || v === null) return null
  if (is(v, SQL)) return normalizarDefault(textoDe(v))
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
  return String(v)
}

/**
 * As divergências entre as colunas de cada tabela do drizzle e as do banco: nomes, tipo, nulidade,
 * coluna gerada (com a expressão) e o VALOR do default.
 */
async function divergenciasDeColunas(tabelasConferidas: PgTable[]): Promise<string[]> {
  const divergencias: string[] = []
  for (const tabela of tabelasConferidas) {
    const cfg = getTableConfig(tabela)
    const linhas = (
      await c.execute({
        sql: `SELECT column_name, data_type, is_nullable, column_default, is_generated, generation_expression
                FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ?`,
        args: [cfg.name],
      })
    ).rows
    const doBanco = new Map(linhas.map((l) => [String(l.column_name), l]))
    const nomesDoSchema = cfg.columns.map((col) => col.name).sort()
    const nomesDoBanco = [...doBanco.keys()].sort()
    if (JSON.stringify(nomesDoSchema) !== JSON.stringify(nomesDoBanco)) {
      divergencias.push(`${cfg.name}: colunas schema=${nomesDoSchema.join(',')} banco=${nomesDoBanco.join(',')}`)
      continue
    }
    for (const col of cfg.columns) {
      const l = doBanco.get(col.name)!
      const onde = `${cfg.name}.${col.name}`
      if (String(l.data_type) !== tipoDoCatalogo(col.getSQLType())) {
        divergencias.push(`${onde}: tipo schema=${col.getSQLType()} banco=${l.data_type}`)
      }
      /* Chave primária é NOT NULL no banco mesmo sem `.notNull()` no schema. */
      const notNullNoSchema = col.notNull || col.primary
      if (notNullNoSchema !== (l.is_nullable === 'NO')) {
        divergencias.push(`${onde}: NOT NULL schema=${notNullNoSchema} banco=${l.is_nullable === 'NO'}`)
      }
      const gerada = (col as unknown as { generated?: { as: SQL | (() => SQL) } }).generated
      if (!!gerada !== (l.is_generated === 'ALWAYS')) {
        divergencias.push(`${onde}: gerada schema=${!!gerada} banco=${l.is_generated}`)
      } else if (gerada) {
        const expr = typeof gerada.as === 'function' ? gerada.as() : gerada.as
        const doSchema = normalizar(is(expr, SQL) ? textoDe(expr) : String(expr), cfg.name)
        if (doSchema !== normalizar(String(l.generation_expression), cfg.name)) {
          divergencias.push(`${onde}: expressão gerada schema="${doSchema}" banco="${l.generation_expression}"`)
        }
      }
      /* Default SQL, comparado pelo VALOR (o `$defaultFn` é do JS e não chega ao banco). */
      if (!gerada) {
        const doSchema = defaultDoSchema(col.default)
        const doBanco = l.column_default === null ? null : normalizarDefault(String(l.column_default))
        if (doSchema !== doBanco) divergencias.push(`${onde}: default schema=${doSchema} banco=${doBanco}`)
      }
    }
  }
  return divergencias
}

describe('schema.ts × banco migrado (catálogo do Postgres)', () => {
  it('as mesmas tabelas no schema `public`', async () => {
    const noBanco = (
      await c.execute(
        "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1",
      )
    ).rows.map((r) => String(r.t))
    const noSchema = tabelas.map((t) => getTableConfig(t).name).sort()
    expect(noSchema.length).toBeGreaterThan(30)
    expect(noBanco).toEqual(noSchema)
  })

  it('cada tabela tem as mesmas colunas: tipo, nulidade, default (o valor) e coluna gerada', async () => {
    const divergencias = await divergenciasDeColunas(tabelas)
    expect(divergencias, 'o schema.ts diverge do banco que as migrations produzem').toEqual([])
  })

  it('a comparação de default pega o VALOR: DEFAULT 0 no schema × DEFAULT 1 no banco (e texto com outra caixa)', async () => {
    const { bigint, pgTable, text } = await import('drizzle-orm/pg-core')
    const brinquedo = pgTable('_brinquedo_default', {
      n: bigint('n', { mode: 'number' }).notNull().default(0),
      estado: text('estado').notNull().default('active'),
      igual: text('igual').notNull().default("d'água"),
    })
    await c.execute(
      "CREATE TABLE _brinquedo_default (n bigint NOT NULL DEFAULT 1, estado text NOT NULL DEFAULT 'Active', igual text NOT NULL DEFAULT 'd''água')",
    )
    try {
      expect((await divergenciasDeColunas([brinquedo])).sort()).toEqual([
        "_brinquedo_default.estado: default schema='active' banco='Active'",
        '_brinquedo_default.n: default schema=0 banco=1',
      ])
    } finally {
      await c.execute('DROP TABLE _brinquedo_default')
    }
  })

  it('os mesmos índices: unicidade, colunas na ordem e predicado dos parciais', async () => {
    const divergencias: string[] = []
    for (const tabela of tabelas) {
      const cfg = getTableConfig(tabela)
      const linhas = (
        await c.execute({
          sql: `SELECT i.relname AS nome, x.indisunique AS unico, x.indisprimary AS primario,
                       pg_get_expr(x.indpred, x.indrelid) AS predicado,
                       array_to_string(ARRAY(SELECT pg_get_indexdef(x.indexrelid, k, true)
                                               FROM generate_series(1, x.indnkeyatts) k ORDER BY k), '|') AS colunas
                  FROM pg_index x
                  JOIN pg_class t ON t.oid = x.indrelid
                  JOIN pg_class i ON i.oid = x.indexrelid
                  JOIN pg_namespace ns ON ns.oid = t.relnamespace
                 WHERE ns.nspname = 'public' AND t.relname = ?`,
          args: [cfg.name],
        })
      ).rows.filter((l) => l.primario !== true)
      const doBanco = new Map(linhas.map((l) => [String(l.nome), l]))

      type Esperado = { nome: string; unico: boolean; colunas: string[]; predicado: string | null }
      const esperados: Esperado[] = [
        ...cfg.indexes.map((i) => ({
          nome: i.config.name!,
          unico: !!i.config.unique,
          colunas: i.config.columns.map((col) =>
            'name' in col && typeof col.name === 'string'
              ? col.name
              : normalizar(textoDe(col as unknown as SQL), cfg.name),
          ),
          predicado: i.config.where ? normalizar(textoDe(i.config.where), cfg.name) : null,
        })),
        ...cfg.uniqueConstraints.map((u) => ({
          nome: u.getName()!,
          unico: true,
          colunas: u.columns.map((col) => col.name),
          predicado: null,
        })),
      ]
      const nomesEsperados = esperados.map((e) => e.nome).sort()
      const nomesDoBanco = [...doBanco.keys()].sort()
      if (JSON.stringify(nomesEsperados) !== JSON.stringify(nomesDoBanco)) {
        divergencias.push(`${cfg.name}: índices schema=${nomesEsperados.join(',')} banco=${nomesDoBanco.join(',')}`)
        continue
      }
      for (const e of esperados) {
        const l = doBanco.get(e.nome)!
        if (e.unico !== (l.unico === true)) divergencias.push(`${e.nome}: único schema=${e.unico} banco=${l.unico}`)
        const colunasDoBanco = String(l.colunas)
          .split('|')
          .map((x) => normalizar(x, cfg.name))
        if (JSON.stringify(e.colunas.map((x) => normalizar(x, cfg.name))) !== JSON.stringify(colunasDoBanco)) {
          divergencias.push(`${e.nome}: colunas schema=${e.colunas.join(',')} banco=${colunasDoBanco.join(',')}`)
        }
        const predicadoDoBanco = l.predicado === null ? null : normalizar(String(l.predicado), cfg.name)
        if (e.predicado !== predicadoDoBanco) {
          divergencias.push(`${e.nome}: predicado schema="${e.predicado}" banco="${predicadoDoBanco}"`)
        }
      }
    }
    expect(divergencias, 'os índices do schema.ts divergem dos do banco').toEqual([])
  })

  it('as mesmas chaves estrangeiras', async () => {
    const doSchema = tabelas
      .flatMap((t) => {
        const cfg = getTableConfig(t)
        return cfg.foreignKeys.map((fk) => {
          const r = fk.reference()
          return `${cfg.name}(${r.columns.map((x) => x.name).join(',')})→${getTableConfig(r.foreignTable).name}(${r.foreignColumns.map((x) => x.name).join(',')})`
        })
      })
      .sort()
    const doBanco = (await chavesEstrangeiras(c))
      .map((fk) => `${fk.tabela}(${fk.colunas.join(',')})→${fk.pai}(${fk.colunasDoPai.join(',')})`)
      .sort()
    expect(doSchema.length).toBeGreaterThan(0)
    expect(doBanco).toEqual(doSchema)
  })
})

describe('schema.ts × snapshot do drizzle', () => {
  it('o snapshot mais recente existe e não difere do schema.ts (o que o `drizzle-kit generate` compara)', async () => {
    const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api')
    const journal = JSON.parse(readFileSync(path.join(PASTA, 'meta', '_journal.json'), 'utf8')) as {
      entries: { tag: string }[]
    }
    const snapshots = readdirSync(path.join(PASTA, 'meta'))
      .filter((n) => /^\d{4}_snapshot\.json$/.test(n))
      .sort()
    expect(snapshots.length, 'falta snapshot do drizzle em migrations-pg/meta').toBeGreaterThan(0)
    const ultimo = snapshots.at(-1)!
    /* As migrations depois do último snapshot não podem mexer em tabela ou coluna: se mexessem, o
       snapshot estaria velho e o `generate` proporia de novo o que elas já fizeram. */
    const depois = journal.entries.map((e) => e.tag).filter((tag) => tag.slice(0, 4) > ultimo.slice(0, 4))
    for (const tag of depois) {
      const sql = readFileSync(path.join(PASTA, `${tag}.sql`), 'utf8').replace(/--[^\n]*/g, '')
      expect(sql, `${tag} muda o schema sem snapshot`).not.toMatch(
        /\b(CREATE\s+TABLE|ALTER\s+TABLE\s+\S+\s+(ADD|DROP|ALTER)\s+COLUMN|CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+(TABLE|INDEX))\b/i,
      )
    }

    const anterior = JSON.parse(readFileSync(path.join(PASTA, 'meta', ultimo), 'utf8'))
    const atual = generateDrizzleJson(schema as Record<string, unknown>, anterior.id)
    const sql = await generateMigration(anterior, atual)
    expect(
      sql,
      'o `drizzle-kit generate` produziria esta migration: o snapshot está velho ou o schema.ts mudou sem migration',
    ).toEqual([])
  }, 60_000)
})
