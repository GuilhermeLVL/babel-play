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
import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { Pool, types } from 'pg'

import { configDoPool } from './configDoPool'
import { medirConsultas, registrarMedidorDeTamanho } from './observadorDeConsultas'
import * as schema from './schema'
import { ehBancoEmbutido, ehBancoEmMemoria, URL_PADRAO_DO_BANCO } from './tipoDoBanco'
import { travarDiretorio } from './travaDoPglite'

export const urlDoBanco: string = process.env.DATABASE_URL ?? URL_PADRAO_DO_BANCO

/** Banco embutido (PGlite) ou servidor Postgres remoto. */
export const bancoEmbutido: boolean = ehBancoEmbutido(urlDoBanco)

const emMemoria = ehBancoEmMemoria(urlDoBanco)
const ehPostgres = /^postgres(ql)?:\/\//.test(urlDoBanco)

if (!bancoEmbutido && !ehPostgres) {
  throw new Error('Erro de configuração: DATABASE_URL deve começar com pglite: ou postgres:')
}

/** Texto SQL da instrução, venha ela como string ou como `{ text }` (config do `pg`). */
const textoDe = (q: unknown): string | { sql: string } =>
  typeof q === 'string' ? q : { sql: String((q as { text?: string } | undefined)?.text ?? '') }

/* MEDIÇÃO (Fase 5 de prontidão): escritas/s e duração por tipo, para o gatilho do ADR 0006. Embrulha o
   método `query` do driver antes de passá-lo ao Drizzle; sem observador registrado (métricas desligadas),
   o custo é um `if`. Ver `observadorDeConsultas.ts`.

   AS TRANSAÇÕES TAMBÉM SÃO MEDIDAS. `emTransacao`/`emLote` (o que era o `batch` do SQLite, e que o gancho
   medía) rodam num objeto próprio do driver: no PGlite, o `tx` que `pglite.transaction` entrega; no `pg`,
   o cliente que `pool.connect()` empresta ao Drizzle. Os dois são embrulhados abaixo, e cada instrução de
   dentro conta como uma avulsa conta. O controle da transação (`BEGIN`/`COMMIT`/`ROLLBACK`/`SAVEPOINT`,
   que o Drizzle manda pelo cliente no `pg`) fica de fora: não é trabalho da aplicação. */
type Consultar = (...args: unknown[]) => Promise<unknown>
const CONTROLE_DE_TRANSACAO = /^\s*(begin|commit|rollback|savepoint|release|start\s+transaction)\b/i

function medida(original: Consultar): Consultar {
  const medido = medirConsultas(original, (q: unknown) => [textoDe(q)])
  return (...args: unknown[]) => {
    const t = textoDe(args[0])
    return CONTROLE_DE_TRANSACAO.test(typeof t === 'string' ? t : t.sql) ? original(...args) : medido(...args)
  }
}

function medir<T extends { query: (...args: never[]) => Promise<unknown> }>(alvo: T): void {
  const original = alvo.query.bind(alvo) as Consultar
  alvo.query = medida(original) as unknown as T['query']
  /* O tamanho do banco pelo `query` ORIGINAL: a sonda de métrica não conta como leitura da aplicação. */
  registrarMedidorDeTamanho(async () => {
    const r = (await original('select pg_database_size(current_database()) as n')) as { rows?: Array<{ n: unknown }> }
    return Number(r.rows?.[0]?.n ?? 0)
  })
}

/** PGlite: o `tx` de cada transação ganha o mesmo embrulho no `query`. */
function medirTransacoesDoPglite(p: PGlite): void {
  const original = p.transaction.bind(p) as (fn: (tx: { query: Consultar }) => Promise<unknown>) => Promise<unknown>
  ;(p as unknown as { transaction: typeof original }).transaction = (fn) =>
    original((tx) => {
      tx.query = medida(tx.query.bind(tx))
      return fn(tx)
    })
}

/**
 * `pg`: o cliente que `pool.connect()` empresta (é o que o Drizzle usa dentro de `db.transaction`) ganha
 * o embrulho até ser devolvido. Só na forma de PROMESSA (`await pool.connect()`): a forma de callback é a
 * que o próprio `pool.query` usa por dentro, e essa consulta já é medida pelo embrulho do `pool.query`.
 */
function medirClientesDoPool(p: Pool): void {
  const conectar = p.connect.bind(p) as (...args: unknown[]) => unknown
  ;(p as unknown as { connect: (...args: unknown[]) => unknown }).connect = (...args: unknown[]) => {
    if (args.length > 0) return conectar(...args)
    return (conectar() as Promise<{ query: Consultar; release: (...a: unknown[]) => unknown }>).then((cliente) => {
      const consultaOriginal = cliente.query
      const devolverOriginal = cliente.release
      cliente.query = medida(consultaOriginal.bind(cliente))
      cliente.release = (...a: unknown[]) => {
        cliente.query = consultaOriginal
        cliente.release = devolverOriginal
        return devolverOriginal.apply(cliente, a)
      }
      return cliente
    })
  }
}

/* OIDs do Postgres cujo valor o `pg`/PGlite pode devolver como string: int8 (20), numeric (1700). */
const OIDS_NUMERICOS = [20, 1700]

/**
 * int8/numeric em texto → `number` quando cabe sem perder nada (inteiro seguro ou decimal finito);
 * senão o texto como veio (int8 acima de 2^53 continua string, sem arredondar). Regra única do
 * parser do `pg` (abaixo) e de `linhas()`.
 */
function numeroDoBanco(v: string): number | string {
  if (v.trim() === '') return v
  const n = Number(v)
  return Number.isFinite(n) && (!/^-?\d+$/.test(v) || Number.isSafeInteger(n)) ? n : v
}

let pglite: PGlite | undefined
let pool: Pool | undefined
let soltarTrava: (() => void) | undefined

function abrir(): DB {
  if (bancoEmbutido) {
    if (emMemoria) {
      pglite = new PGlite()
    } else {
      const caminho = urlDoBanco.replace(/^pglite:/, '')
      mkdirSync(caminho, { recursive: true })
      // Um processo por diretório: o PGlite não trava, e dois perdem escritas em silêncio (travaDoPglite.ts).
      soltarTrava = travarDiretorio(caminho)
      pglite = new PGlite(caminho)
    }
    medir(pglite)
    medirTransacoesDoPglite(pglite)
    return drizzlePglite(pglite, { schema })
  }
  /* INT8 CHEGA COMO STRING NO `pg` e como number no PGlite: `min(occurred_at)` virava "1712345678901" na
     API de produção e `new Date()` do cliente lançava RangeError. O parser vale para o `pg` do PROCESSO
     (`types.setTypeParser` é global): o `types` por pool existe, mas o Drizzle passa o seu `types` por
     consulta (datas), que cai no parser GLOBAL para os demais OIDs e passaria por cima do do pool.
     Só roda neste ramo: um processo com PGlite não muda o `pg` de ninguém. */
  for (const oid of OIDS_NUMERICOS) types.setTypeParser(oid, numeroDoBanco)
  pool = new Pool({ connectionString: urlDoBanco, ...configDoPool() })
  // Sem handler, a queda de uma conexão OCIOSA vira 'error' não tratado e derruba o processo.
  pool.on('error', (err) => {
    console.error('[db] erro em conexão ociosa do pool:', String(err?.message ?? err).slice(0, 160))
  })
  medir(pool)
  medirClientesDoPool(pool)
  return drizzleNode(pool, { schema })
}

/**
 * `db` tipado como a base comum dos dois drivers (`PgDatabase`): `select()/insert()/execute()/transaction()`
 * e `.returning({...})` chamáveis sem cast nos repositories. (Uma união dos dois tipos quebrava assinaturas
 * sobrecarregadas como `returning`.)
 */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>
export const db: DB = abrir()

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
  return db.transaction(fn)
}

/**
 * Roda instruções EM SEQUÊNCIA numa só transação e devolve os resultados na ordem (substitui `db.batch`).
 * Cada item é uma função que dispara a instrução (só funções: um builder pronto já nasceria ligado a `db`, fora da
 * transação) — e nunca `Promise.all`: a transação usa uma conexão só e instruções concorrentes nela se embaralhariam.
 * Monte as instruções a partir do `tx` recebido, nunca de `db`.
 */
export async function emLote<T extends readonly unknown[]>(
  montar: (tx: ExecutorDb) => { [K in keyof T]: () => Promise<T[K]> },
): Promise<T> {
  return emTransacao(async (tx) => {
    const resultados: unknown[] = []
    for (const instrucao of montar(tx) as ReadonlyArray<() => Promise<unknown>>) resultados.push(await instrucao())
    return resultados as unknown as T
  })
}

/**
 * Trava consultiva do usuário até o fim da transação (`pg_advisory_xact_lock`). Deve ser a PRIMEIRA
 * instrução de `emTransacao`: serializa, por usuário, o que no SQLite vinha do escritor único (saldo,
 * teto, reconstrução). Fora de transação a trava se soltaria na hora — não chame com `db`.
 */
export async function travarUsuario(tx: ExecutorDb, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
}

/**
 * Trava consultiva GLOBAL, nomeada (ex.: o teto da conta no R2), até o fim da transação. Tome-a DEPOIS
 * de `travarUsuario` — uma ordem só, para duas transações nunca esperarem uma pela outra em cruz. Usa a
 * forma de DUAS chaves int4, que no Postgres é outro espaço de travas: não colide com a de usuário
 * (`hashtext(userId)`, chave única int8), mesmo que um userId tenha o mesmo nome.
 */
export async function travarGlobal(tx: ExecutorDb, nome: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(0, hashtext(${nome}))`)
}

/** Linhas modificadas por um INSERT/UPDATE/DELETE: `rowCount` (pg) ou `affectedRows` (PGlite). */
export function linhasAfetadas(r: unknown): number {
  const x = r as { rowCount?: number | null; affectedRows?: number | null } | null | undefined
  return x?.rowCount ?? x?.affectedRows ?? 0
}

/**
 * Linhas de um resultado de `db.execute`. `count(*)`/`sum()` podem chegar como string (int8/numeric); usando o
 * `fields` do resultado, convertemos para `number` quando o valor é seguro (`numeroDoBanco`, a mesma regra do
 * parser do `pg`). Sem metadado, devolve como veio; int8 fora do intervalo seguro (string ou `bigint`) fica como
 * está, sem perder precisão.
 */
export function linhas<T>(r: unknown): T[] {
  const x = r as { rows?: Record<string, unknown>[]; fields?: Array<{ name: string; dataTypeID: number }> } | undefined
  const rows = x?.rows ?? []
  const numericos = (x?.fields ?? []).filter((f) => OIDS_NUMERICOS.includes(f.dataTypeID)).map((f) => f.name)
  if (numericos.length === 0) return rows as T[]
  return rows.map((linha) => {
    const copia = { ...linha }
    for (const nome of numericos) {
      const v = copia[nome]
      if (typeof v === 'bigint') {
        if (Number.isSafeInteger(Number(v))) copia[nome] = Number(v)
        continue
      }
      if (typeof v === 'string') copia[nome] = numeroDoBanco(v)
    }
    return copia
  }) as T[]
}

/**
 * `ANALYZE` SÓ NO BANCO EMBUTIDO. O PGlite roda em modo de usuário único: não há autovacuum nem
 * autoanalyze, e sem estatística o planejador estima `rows=1` em tudo — medido com 20 mil cartões, o
 * seletor de jogo levava 5 a 7 s em três casos (`scripts/medicao-filtro/medir.ts`). É o que o
 * `PRAGMA optimize` fazia no SQLite. No `pg` de produção quem cuida disso é o autovacuum do servidor,
 * e um ANALYZE manual da aplicação só competiria com ele: lá não roda. Devolve se rodou.
 */
export async function analisarBancoEmbutido(): Promise<boolean> {
  if (!bancoEmbutido) return false
  await db.execute(sql`ANALYZE`)
  return true
}

let fechado: Promise<void> | undefined

/** Encerra o driver. Idempotente: chamadas seguintes devolvem o mesmo fechamento. */
export function fecharBanco(): Promise<void> {
  fechado ??= (async () => {
    try {
      if (pool) await pool.end()
      else if (pglite) await pglite.close()
    } finally {
      soltarTrava?.()
    }
  })()
  return fechado
}
