/**
 * EXECUTOR POR REQUISIÇÃO (Fase 2, Task 6). Num Worker não há pool global: o Hyperdrive quer UM
 * `pg.Client` por requisição (`clientePorRequisicao.ts`). A requisição roda dentro de
 * `comExecutor(executor, fn)`, e o `db` de `db.ts` — o mesmo que todo repository importa — resolve, a
 * cada acesso, para o executor do escopo atual. Fora de qualquer escopo (o Node de sempre), `db` é a
 * instância única do processo (Pool ou PGlite).
 *
 * O escopo segue a cadeia assíncrona (AsyncLocalStorage, que o Worker tem com `nodejs_compat`): duas
 * requisições em paralelo no mesmo isolate nunca enxergam o executor uma da outra.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

import type { DB } from './db'

export interface Executor {
  /** Drizzle sobre a conexão desta requisição. */
  db: DB
  /** Encerra a conexão. Depois disso, toda consulta por este executor rejeita. */
  fechar(): Promise<void>
}

const als = new AsyncLocalStorage<Executor>()

/**
 * Roda `fn` com `executor` como o banco de todo `db.*`, `emTransacao`, `emLote` e `travar*` de dentro.
 *
 * @public — por ora só os testes chamam; a Task 12 (`worker.ts`) liga por requisição.
 */
export function comExecutor<T>(executor: Executor, fn: () => T): T {
  return als.run(executor, fn)
}

/** O executor do escopo atual; fora de `comExecutor`, `undefined` (vale o `db` do Node). */
export function executorAtual(): Executor | undefined {
  return als.getStore()
}
