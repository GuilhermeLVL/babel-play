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
import { Client, Pool, types } from 'pg'

import { temDisco } from '../lib/runtime'
import { configDoPool } from './configDoPool'
import { executorAtual } from './executor'
import { medirConsultas, registrarMedidorDeTamanho } from './observadorDeConsultas'
import * as schema from './schema'
import { ehBancoEmbutido, ehBancoEmMemoria, recusaDeUrlDeMigracao, URL_PADRAO_DO_BANCO } from './tipoDoBanco'
import { travarDiretorio } from './travaDoPglite'

/**
 * BANCO PREGUIÇOSO (Fase 2, boot preguiçoso). Importar este módulo não lê ambiente nem abre nada: a
 * `DATABASE_URL` é lida, e o driver aberto, no PRIMEIRO acesso a `db`. Num Worker o módulo é carregado
 * antes de haver ambiente; no Node, `server.ts` carrega o `.env` antes do primeiro acesso.
 *
 * Sem `DATABASE_URL` e sem disco (Worker), não há PGlite possível: o acesso lança `BancoIndisponivel`,
 * que o `erroGlobal` responde como 503 `banco_indisponivel` — falta de configuração, não erro interno.
 */
export class BancoIndisponivel extends Error {
  readonly status = 503
  readonly code = 'banco_indisponivel'
  constructor() {
    super('banco indisponível: DATABASE_URL ausente e sem disco para o PGlite embutido')
    this.name = 'BancoIndisponivel'
  }
}

/** A URL com que o banco foi aberto; antes da abertura, `undefined`. */
let urlEmUso: string | undefined

/** A URL do banco: a que está em uso ou, antes de abrir, a do ambiente (lida agora, nunca no import). */
export function urlDoBanco(): string {
  if (urlEmUso) return urlEmUso
  const doAmbiente = process.env.DATABASE_URL
  if (doAmbiente) return doAmbiente
  if (!temDisco()) throw new BancoIndisponivel()
  return URL_PADRAO_DO_BANCO
}

/** Banco embutido (PGlite) ou servidor Postgres remoto. Sem banco configurável (Worker sem URL): `false`. */
export function bancoEmbutido(): boolean {
  try {
    return ehBancoEmbutido(urlDoBanco())
  } catch {
    return false
  }
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

/** O `query` do driver embrulhado pela medição (exportado para o `Client` por requisição). */
export function medida(original: Consultar): Consultar {
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

/** Liga o parser de int8/numeric no `pg` do processo (global, idempotente): o `Pool` do Node e o `Client` por requisição. */
export function ligarParsersNumericos(): void {
  for (const oid of OIDS_NUMERICOS) types.setTypeParser(oid, numeroDoBanco)
}

let pglite: PGlite | undefined
let pool: Pool | undefined
let soltarTrava: (() => void) | undefined

function abrir(): DB {
  const url = urlDoBanco()
  const embutido = ehBancoEmbutido(url)
  if (!embutido && !/^postgres(ql)?:\/\//.test(url)) {
    throw new Error('Erro de configuração: DATABASE_URL deve começar com pglite: ou postgres:')
  }
  urlEmUso = url
  if (embutido) {
    if (ehBancoEmMemoria(url)) {
      pglite = new PGlite()
    } else {
      const caminho = url.replace(/^pglite:/, '')
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
  ligarParsersNumericos()
  pool = new Pool({ connectionString: url, ...configDoPool() })
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

let instancia: DB | undefined
/** `fecharBanco()` já rodou: o banco do Node não (re)abre mais — uma instância aberta depois nunca seria fechada. */
let encerrado = false
function aberto(): DB {
  if (!instancia && encerrado) throw new Error('banco do processo já fechado (fecharBanco)')
  instancia ??= abrir()
  return instancia
}

/** O banco desta chamada: o executor da requisição (`comExecutor`, Worker) ou, fora dele, o do Node. */
const atual = (): DB => executorAtual()?.db ?? aberto()

/**
 * O `db` de sempre, aberto no primeiro acesso: um Proxy que repassa cada propriedade ao banco ATUAL
 * (métodos ligados a ele). Dentro de `comExecutor` (`executor.ts`) é o `Client` da requisição; fora, a
 * instância única do Node. Quem importa `db` continua escrevendo `db.select()`, `db.transaction()`…
 */
export const db: DB = new Proxy({} as DB, {
  get(_alvo, prop) {
    const real = atual()
    const valor: unknown = Reflect.get(real, prop, real)
    return typeof valor === 'function' ? (valor as (...a: unknown[]) => unknown).bind(real) : valor
  },
  has: (_alvo, prop) => Reflect.has(atual(), prop),
  getPrototypeOf: () => Reflect.getPrototypeOf(atual()),
  /* Atribuir (ou `vi.spyOn`) no Proxy cairia num objeto vazio que ninguém lê: falha alto em vez de sumir. */
  set: (_alvo, prop) => {
    throw new TypeError(
      `db é só leitura (tentou definir "${String(prop)}"); use o executor (db/tx) ou um dublê do módulo`,
    )
  },
  defineProperty: (_alvo, prop) => {
    throw new TypeError(
      `db é só leitura (tentou definir "${String(prop)}"); use o executor (db/tx) ou um dublê do módulo`,
    )
  },
})

/** `db` ou uma transação — quem escreve em duas etapas aceita os dois (P1-N3). */
export type ExecutorDb = DB | Parameters<Parameters<DB['transaction']>[0]>[0]

let pronto: Promise<void> | undefined

/**
 * Abre o banco (se ainda não aberto) e confirma que responde. Memoizado: todos esperam a mesma sonda.
 * Dentro de `comExecutor` resolve na hora: o executor já conectou ao ser aberto.
 */
export function dbReady(): Promise<void> {
  if (executorAtual()) return Promise.resolve()
  if (pronto) return pronto
  pronto = (async () => {
    await db.execute(sql`select 1`)
    const url = urlDoBanco()
    console.log(
      `[db] banco ${bancoEmbutido() ? `pglite (${ehBancoEmMemoria(url) ? 'memória' : url.replace(/^pglite:/, '')})` : 'postgres'}`,
    )
  })()
  // Falha aqui é reportada a quem espera `dbReady()` (o boot); mas não pode virar unhandled
  // rejection e matar o processo quando ninguém espera.
  pronto.catch((err) => {
    console.error('[db] falha ao conectar ao banco:', String(err).slice(0, 160))
  })
  return pronto
}

/**
 * Roda `fn` (as migrations) com `statement_timeout = 0` na conexão que as aplica.
 *
 * A migration 0004 dá ao PAPEL do banco um `statement_timeout` de 30 s, e o pool manda o mesmo prazo no
 * `options`: uma migração longa (índice numa tabela grande, backfill) estouraria no meio. No `pg`, um
 * `Client` PRÓPRIO, uma sessão só (o migrator do Drizzle usa a mesma conexão para a transação), que
 * fecha no fim e não devolve ao pool uma conexão sem prazo. No PGlite (uma conexão só, a do app), o
 * prazo anterior volta ao fim.
 */
export async function comConexaoDeMigracao<T>(fn: (dbm: DB) => Promise<T>): Promise<T> {
  if (bancoEmbutido()) {
    const anterior = linhas<{ v: string }>(await db.execute(sql`select current_setting('statement_timeout') as v`))[0]
    await db.execute(sql`SET statement_timeout = 0`)
    try {
      return await fn(db)
    } finally {
      await db.execute(sql`select set_config('statement_timeout', ${anterior?.v ?? '0'}, false)`)
    }
  }
  /* Pooler em modo transação perderia o `SET` abaixo: recusa com o motivo (`recusaDeUrlDeMigracao`). */
  const url = urlDoBanco()
  const recusa = recusaDeUrlDeMigracao(url)
  if (recusa) throw new Error(recusa)
  const { max: _max, idleTimeoutMillis: _ociosa, ...daConexao } = configDoPool()
  const cliente = new Client({ connectionString: url, ...daConexao })
  // Sem handler, a queda da conexão no meio das migrations vira 'error' não tratado e derruba o processo sem contexto.
  cliente.on('error', (err) => {
    console.error('[db] erro na conexão das migrations:', String(err?.message ?? err).slice(0, 160))
  })
  await cliente.connect()
  try {
    await cliente.query('SET statement_timeout = 0')
    return await fn(drizzleNode(cliente, { schema }))
  } finally {
    await cliente.end()
  }
}

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
 * Trava a LINHA `chave` da tabela `travas` até o fim da transação, numa instrução só (uma ida ao banco):
 *
 *  - linha nova: o INSERT a cria e a transação que a criou a segura; quem chegar depois com a mesma chave
 *    espera esse COMMIT na checagem do índice único e então cai no ON CONFLICT;
 *  - linha existente: o `ON CONFLICT DO UPDATE` trava a linha como um UPDATE (espera quem a segura).
 *
 * O UPDATE regrava `criado_em` com o próprio valor (coluna sem índice: atualização HOT, sem mexer no índice).
 * Duas instruções (`ON CONFLICT DO NOTHING` e depois `SELECT … FOR UPDATE`) teriam um buraco: se a linha
 * fosse apagada entre as duas, o SELECT não acharia nada e voltaria SEM trava; o UPSERT, nesse caso,
 * insere de novo. A espera obedece ao `lock_timeout` da sessão (55P03), como a trava consultiva obedecia.
 *
 * Por que não advisory lock (trava consultiva): o Hyperdrive (pool por transação) não suporta travas consultivas;
 * trava de linha vive e morre com a transação, que é o que o pool por transação preserva.
 */
async function travarChave(tx: ExecutorDb, chave: string): Promise<void> {
  await tx.execute(
    sql`INSERT INTO travas (chave, criado_em) VALUES (${chave}, ${Date.now()})
      ON CONFLICT (chave) DO UPDATE SET criado_em = travas.criado_em`,
  )
}

/**
 * Trava do usuário até o fim da transação (linha `u:<userId>` em `travas`). Deve ser a PRIMEIRA instrução
 * de `emTransacao`: serializa, por usuário, o que no SQLite vinha do escritor único (saldo, teto,
 * reconstrução). Não depende de o usuário existir em `users`. Fora de transação a trava se soltaria na
 * hora — não chame com `db`.
 */
export async function travarUsuario(tx: ExecutorDb, userId: string): Promise<void> {
  await travarChave(tx, `u:${userId}`)
}

/**
 * Trava GLOBAL, nomeada (ex.: o teto da conta no R2), até o fim da transação (linha `g:<nome>`). Tome-a
 * DEPOIS de `travarUsuario` — uma ordem só, para duas transações nunca esperarem uma pela outra em cruz.
 * O prefixo separa os espaços: `g:x` não colide com a trava do usuário `x` (`u:x`).
 */
export async function travarGlobal(tx: ExecutorDb, nome: string): Promise<void> {
  await travarChave(tx, `g:${nome}`)
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
  if (!bancoEmbutido()) return false
  await db.execute(sql`ANALYZE`)
  return true
}

let fechado: Promise<void> | undefined

/**
 * Encerra o driver do NODE (o executor de uma requisição se fecha pelo próprio `fechar()`). Idempotente:
 * chamadas seguintes devolvem o mesmo fechamento. Chamado antes do primeiro acesso, impede a abertura.
 */
export function fecharBanco(): Promise<void> {
  encerrado = true
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
