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
import { criarAtividade, type Executor } from '../../../server/db/executor'
import * as schema from '../../../server/db/schema'

export interface DubleDoHyperdrive {
  /** O que `env.HYPERDRIVE.connectionString` entregaria; `undefined` no modo PGlite. */
  connectionString: string | undefined
  /** Um executor novo (um `Client`, ou um PGlite) por chamada. */
  abrir: (opcoes?: { tetoDaEsperaMs?: number }) => Promise<Executor>
}

export function dubleDoHyperdrive(urlDoBanco: string): DubleDoHyperdrive {
  if (/^postgres(ql)?:\/\//.test(urlDoBanco)) {
    return { connectionString: urlDoBanco, abrir: (opcoes) => abrirClienteDoHyperdrive(urlDoBanco, opcoes) }
  }
  return {
    connectionString: undefined,
    /* O mesmo contador de trabalho em voo do `Client` (`criarAtividade`): o `fechar()` espera ocioso e,
       depois dele, consulta e transação rejeitam com o motivo. */
    abrir: async (opcoes) => {
      const p = new PGlite()
      await p.waitReady
      const atividade = criarAtividade(() => p.close(), opcoes?.tetoDaEsperaMs)
      const query = p.query.bind(p)
      const transaction = p.transaction.bind(p)
      const exec = p.exec.bind(p)
      p.query = ((...a: Parameters<typeof query>) => atividade.rastrear(() => query(...a))) as typeof p.query
      p.exec = ((...a: Parameters<typeof exec>) => atividade.rastrear(() => exec(...a))) as typeof p.exec
      p.transaction = ((...a: Parameters<typeof transaction>) =>
        atividade.rastrear(() => transaction(...a))) as typeof p.transaction
      return { db: drizzle(p, { schema }) as unknown as DB, fechar: () => atividade.fechar() }
    },
  }
}
