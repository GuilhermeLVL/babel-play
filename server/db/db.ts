/**
 * Conexão do banco (Postgres). Instância única do Drizzle, com dois drivers escolhidos pela
 * `DATABASE_URL`:
 *
 *  - `pglite:<caminho>` / `pglite://memory`: Postgres embutido (WASM), sem servidor. Dev local e testes.
 *  - `postgres://…` / `postgresql://…`: Postgres de verdade via `pg` (Supabase, Hyperdrive etc.).
 *
 * O schema e os repositories são os mesmos nos dois; só este arquivo conhece a diferença.
 */
import 'dotenv/config'

import { mkdirSync } from 'node:fs'

import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle as drizzleNode, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite'
import { Pool } from 'pg'

import { medirConsultas } from './observadorDeConsultas'
import * as schema from './schema'

export const urlDoBanco: string = process.env.DATABASE_URL ?? 'pglite:./data/pg'

/** Banco embutido (PGlite) ou servidor Postgres remoto. */
export const bancoEmbutido: boolean = urlDoBanco.startsWith('pglite:')

const emMemoria = urlDoBanco === 'pglite://memory'
const ehPostgres = /^postgres(ql)?:\/\//.test(urlDoBanco)

if (!bancoEmbutido && !ehPostgres) {
  throw new Error('Erro de configuração: DATABASE_URL deve começar com pglite: ou postgres:')
}

/** Texto SQL da instrução, venha ela como string ou como `{ text }` (config do `pg`). */
const textoDe = (q: unknown): string | { sql: string } =>
  typeof q === 'string' ? q : { sql: String((q as { text?: string } | undefined)?.text ?? '') }

/* MEDIÇÃO (Fase 5 de prontidão): escritas/s e duração por tipo, para o gatilho do ADR 0006. Embrulha o
   método `query` do driver antes de passá-lo ao Drizzle; sem observador registrado (métricas desligadas),
   o custo é um `if`. Consultas dentro de `transaction()` rodam numa conexão/objeto próprio e não passam
   por aqui. Ver `observadorDeConsultas.ts`. */
function medir<T extends { query: (...args: never[]) => Promise<unknown> }>(alvo: T): void {
  const original = alvo.query.bind(alvo) as (...args: unknown[]) => Promise<unknown>
  alvo.query = medirConsultas(original, (q: unknown) => [textoDe(q)]) as unknown as T['query']
}

let pglite: PGlite | undefined
let pool: Pool | undefined

type DriverDb = PgliteDatabase<typeof schema> | NodePgDatabase<typeof schema>

function abrir(): DriverDb {
  if (bancoEmbutido) {
    if (emMemoria) {
      pglite = new PGlite()
    } else {
      const caminho = urlDoBanco.replace(/^pglite:/, '')
      mkdirSync(caminho, { recursive: true })
      pglite = new PGlite(caminho)
    }
    medir(pglite)
    return drizzlePglite(pglite, { schema })
  }
  pool = new Pool({ connectionString: urlDoBanco, max: 5 })
  medir(pool)
  return drizzleNode(pool, { schema })
}

/**
 * `db` tipado como a união dos dois drivers: é a forma que deixa `db.select()/insert()/execute()/
 * transaction()` chamáveis sem cast nos repositories (as duas variantes compartilham a API do `PgDatabase`).
 */
export const db: DB = abrir()
export type DB = DriverDb

/** `db` ou uma transação — quem escreve em duas etapas aceita os dois (P1-N3). */
export type ExecutorDb = DB | Parameters<Parameters<DB['transaction']>[0]>[0]

export const dbReady: Promise<void> = (async () => {
  await db.execute(sql`select 1`)
  console.log(
    `[db] banco ${bancoEmbutido ? `pglite (${emMemoria ? 'memória' : urlDoBanco.replace(/^pglite:/, '')})` : 'postgres'}`,
  )
})()

// Falha aqui não deve derrubar o import (o boot reporta via dbReady); mas não pode
// virar unhandled rejection e matar o processo.
dbReady.catch((err) => {
  console.error('[db] falha ao conectar ao banco:', String(err).slice(0, 160))
})

/**
 * Roda `fn` numa transação. Qualquer erro lançado desfaz tudo. Atenção: no Postgres, um erro de SQL
 * dentro da transação a deixa ABORTADA mesmo que o `catch` o engula — o COMMIT seguinte falha.
 */
export async function emTransacao<T>(fn: (tx: ExecutorDb) => Promise<T>): Promise<T> {
  return (db as PgliteDatabase<typeof schema>).transaction(
    fn as Parameters<PgliteDatabase<typeof schema>['transaction']>[0],
  ) as Promise<T>
}

/**
 * Roda instruções EM SEQUÊNCIA numa só transação e devolve os resultados na ordem (substitui `db.batch`).
 * Cada item é uma função que dispara a instrução — nunca `Promise.all`: a transação usa uma conexão só e
 * instruções concorrentes nela se embaralhariam.
 */
export async function emLote<T extends readonly unknown[]>(
  montar: (tx: ExecutorDb) => { [K in keyof T]: PromiseLike<T[K]> | (() => Promise<T[K]>) },
): Promise<T> {
  return emTransacao(async (tx) => {
    const itens = montar(tx) as ReadonlyArray<PromiseLike<unknown> | (() => Promise<unknown>)>
    const resultados: unknown[] = []
    for (const item of itens) resultados.push(await (typeof item === 'function' ? item() : item))
    return resultados as unknown as T
  })
}

/** Linhas modificadas por um INSERT/UPDATE/DELETE: `rowCount` (pg) ou `affectedRows` (PGlite). */
export function linhasAfetadas(r: unknown): number {
  const x = r as { rowCount?: number | null; affectedRows?: number | null } | null | undefined
  return x?.rowCount ?? x?.affectedRows ?? 0
}

/* OIDs do Postgres cujo valor o `pg`/PGlite pode devolver como string: int8 (20), numeric (1700). */
const OIDS_NUMERICOS = new Set([20, 1700])

/**
 * Linhas de um resultado de `db.execute`. `count(*)`/`sum()` chegam como string (int8/numeric); usando o
 * `fields` do resultado, convertemos para `number` quando o valor é seguro (inteiro seguro ou decimal finito).
 * Sem metadado, devolve como veio.
 */
export function linhas<T>(r: unknown): T[] {
  const x = r as { rows?: Record<string, unknown>[]; fields?: Array<{ name: string; dataTypeID: number }> } | undefined
  const rows = x?.rows ?? []
  const numericos = (x?.fields ?? []).filter((f) => OIDS_NUMERICOS.has(f.dataTypeID)).map((f) => f.name)
  if (numericos.length === 0) return rows as T[]
  return rows.map((linha) => {
    const copia = { ...linha }
    for (const nome of numericos) {
      const v = copia[nome]
      if (typeof v !== 'string' || v.trim() === '') continue
      const n = Number(v)
      if (Number.isFinite(n) && (!/^-?\d+$/.test(v) || Number.isSafeInteger(n))) copia[nome] = n
    }
    return copia
  }) as T[]
}

let fechado: Promise<void> | undefined

/** Encerra o driver. Idempotente: chamadas seguintes devolvem o mesmo fechamento. */
export function fecharBanco(): Promise<void> {
  fechado ??= (async () => {
    if (pool) await pool.end()
    else if (pglite) await pglite.close()
  })()
  return fechado
}
