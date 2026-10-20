/**
 * DUBLÊ DO BINDING HYPERDRIVE para os testes do executor por requisição (Fase 2, Task 6).
 *
 * Num Worker, `env.HYPERDRIVE.connectionString` aponta para o Hyperdrive, e cada requisição abre UM
 * `pg.Client` (`abrirClienteDoHyperdrive`). Aqui:
 *
 *  - com Postgres de verdade (a URL do banco do teste, de `TESTE_POSTGRES_URL` via `postgresDescartavel`):
 *    a connection string é essa URL, e cada `abrir()` é um `abrirClienteDoHyperdrive` novo — um `Client`
 *    por chamada, como no Worker;
 *  - sem ele (PGlite em memória): não há servidor para um `pg.Client` conectar. Cada `abrir()` devolve um
 *    executor sobre um PGlite em memória PRÓPRIO, para que a delegação do Proxy e a semântica de
 *    `fechar()` rodem nos dois modos. (Isolamento entre conexões só faz sentido no Postgres.)
 */
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

import { abrirClienteDoHyperdrive } from '../../../server/db/clientePorRequisicao'
import type { DB } from '../../../server/db/db'
import type { Executor } from '../../../server/db/executor'
import * as schema from '../../../server/db/schema'

export interface DubleDoHyperdrive {
  /** O que `env.HYPERDRIVE.connectionString` entregaria; `undefined` no modo PGlite. */
  connectionString: string | undefined
  /** Um executor novo (um `Client`, ou um PGlite) por chamada. */
  abrir: () => Promise<Executor>
}

export function dubleDoHyperdrive(urlDoBanco: string): DubleDoHyperdrive {
  if (/^postgres(ql)?:\/\//.test(urlDoBanco)) {
    return { connectionString: urlDoBanco, abrir: () => abrirClienteDoHyperdrive(urlDoBanco) }
  }
  return {
    connectionString: undefined,
    abrir: async () => {
      const p = new PGlite()
      await p.waitReady
      return { db: drizzle(p, { schema }) as unknown as DB, fechar: () => p.close() }
    },
  }
}
