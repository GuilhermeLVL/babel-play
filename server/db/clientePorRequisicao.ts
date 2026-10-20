/**
 * UM `pg.Client` POR REQUISIÇÃO (Fase 2, Task 6) — o que o Hyperdrive pede num Worker: nada de pool
 * global no isolate (o pool é do Hyperdrive), uma conexão aberta no começo da requisição e encerrada no
 * fim. `worker.ts` (Task 12) faz `comExecutor(await abrirClienteDoHyperdrive(env.HYPERDRIVE.connectionString), …)`.
 *
 * Igual ao `Pool` do Node (`db.ts`): os mesmos parsers de int8/numeric, o mesmo gancho de medição no
 * `query` (as instruções de dentro de `emTransacao` passam por ele também, porque numa conexão só o
 * Drizzle roda a transação no próprio `Client`), os mesmos prazos de `configDoPool` (sem `max`/ociosa,
 * que são do pool). O `ssl` vem da própria URL (`sslmode`), como no `Pool`.
 *
 * UMA CONEXÃO, UMA TRANSAÇÃO DE CADA VEZ. No `Pool`, duas `db.transaction` em paralelo pegam conexões
 * distintas; num `Client` só, os dois `BEGIN` se embaralhariam e o primeiro `COMMIT` confirmaria o
 * trabalho das duas. Aqui as transações do executor entram numa FILA. E uma `db.transaction` chamada de
 * DENTRO de outra (no Pool, uma conexão nova e independente) aqui esperaria a de fora para sempre:
 * rejeita na hora, com o motivo — use `tx.transaction` (savepoint) ou faça fora.
 *
 * O que a fila NÃO cobre: uma consulta avulsa em `db` disparada em paralelo a uma transação aberta na
 * mesma requisição entra na conexão no meio da transação (e é desfeita com ela). No Pool ela iria por
 * outra conexão.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'

import { configDoPool } from './configDoPool'
import { type DB, ligarParsersNumericos, medida } from './db'
import type { Executor } from './executor'
import * as schema from './schema'

/** Qual executor tem uma transação aberta nesta cadeia assíncrona (para recusar a aninhada). */
const transacaoAberta = new AsyncLocalStorage<DB>()

function transacoesEmFila(d: DB): void {
  const original = d.transaction.bind(d)
  let fila: Promise<unknown> = Promise.resolve()
  ;(d as { transaction: typeof original }).transaction = ((fn, config) => {
    if (transacaoAberta.getStore() === d) {
      return Promise.reject(
        new Error('transação aninhada no mesmo Client da requisição: use tx.transaction (savepoint) ou rode fora'),
      )
    }
    const vez = fila.then(() => original((tx) => transacaoAberta.run(d, () => fn(tx)), config))
    fila = vez.catch(() => {})
    return vez
  }) as typeof original
}

export async function abrirClienteDoHyperdrive(connectionString: string): Promise<Executor> {
  ligarParsersNumericos()
  const { max: _max, idleTimeoutMillis: _ociosa, ...daConexao } = configDoPool()
  const cliente = new Client({ connectionString, ...daConexao })
  let fechado: Promise<void> | undefined
  // Sem handler, a queda da conexão vira 'error' não tratado e derruba o isolate sem contexto.
  cliente.on('error', (err) => {
    /* No workerd, o `end()` faz o socket emitir "This socket has been closed": fechar não é erro. */
    if (fechado) return
    console.error('[db] erro na conexão da requisição:', String(err?.message ?? err).slice(0, 160))
  })
  await cliente.connect()
  cliente.query = medida(cliente.query.bind(cliente) as (...a: unknown[]) => Promise<unknown>) as typeof cliente.query
  const d = drizzle(cliente, { schema })
  transacoesEmFila(d)
  return { db: d, fechar: () => (fechado ??= cliente.end()) }
}
