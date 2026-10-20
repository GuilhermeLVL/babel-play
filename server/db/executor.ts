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

import { log } from '../lib/logger'
import type { DB } from './db'

export interface Executor {
  /** Drizzle sobre a conexão desta requisição. */
  db: DB
  /**
   * Encerra a conexão DEPOIS que o trabalho em voo terminar (`criarAtividade`). Depois disso, toda
   * consulta por este executor rejeita.
   */
  fechar(): Promise<void>
}

/** Quanto o `fechar()` espera, no máximo, o trabalho em voo antes de encerrar assim mesmo. */
export const TETO_DA_ESPERA_AO_FECHAR_MS = 20_000

/** O trabalho em voo de uma conexão e o fechamento que o espera. */
export interface Atividade {
  /** Roda `fn` contando-a como trabalho em voo. Depois do encerramento, rejeita sem rodar. */
  rastrear<T>(fn: () => T | PromiseLike<T>): Promise<T>
  /** Espera ocioso (até o teto, com `warn` se estourar) e só então `encerrar()`. Idempotente. */
  fechar(): Promise<void>
  /** `true` a partir do `encerrar()` (o `end()` da conexão). */
  encerrado(): boolean
}

const umaVolta = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * O CONTADOR DE TRABALHO EM VOO de um executor (revisão final da Fase 2, achado C1). No Worker, quem fecha
 * o `Client` é o `waitUntil` da requisição, e uma rota que responde e estorna no `finally` ainda pode ter
 * consulta na conexão (ou na fila de transações) quando ele chega: o `end()` do `pg` cortaria a consulta
 * ativa e rejeitaria as da fila. Aqui o `fechar()` espera o contador zerar — conferindo a cada volta do
 * laço de eventos, e duas voltas seguidas ociosas, porque entre duas consultas do mesmo `finally` o
 * contador passa por zero — com teto de `tetoMs`; no teto, encerra assim mesmo e avisa.
 */
export function criarAtividade(encerrar: () => Promise<void>, tetoMs = TETO_DA_ESPERA_AO_FECHAR_MS): Atividade {
  let emVoo = 0
  let encerrou = false
  let fechando: Promise<void> | undefined

  async function esperarOcioso(): Promise<void> {
    const inicio = Date.now()
    let ociosoAntes = false
    for (;;) {
      const ocioso = emVoo === 0
      if (ocioso && ociosoAntes) return
      if (Date.now() - inicio >= tetoMs) {
        log('warn', { event: 'executor_fechou_ocupado', total: emVoo, latencyMs: Date.now() - inicio })
        return
      }
      ociosoAntes = ocioso
      await umaVolta()
    }
  }

  function rastrear<T>(fn: () => T | PromiseLike<T>): Promise<T> {
    if (encerrou) {
      return Promise.reject(
        new Error(
          'conexão da requisição já fechada: consulta depois do fechar() (trabalho depois da resposta tem de passar por emSegundoPlano)',
        ),
      )
    }
    emVoo++
    let p: Promise<T>
    try {
      p = Promise.resolve(fn()) as Promise<T>
    } catch (err) {
      p = Promise.reject(err)
    }
    return p.finally(() => {
      emVoo--
    })
  }

  return {
    rastrear,
    fechar() {
      return (fechando ??= esperarOcioso().then(() => {
        encerrou = true
        return encerrar()
      }))
    },
    encerrado: () => encerrou,
  }
}

const als = new AsyncLocalStorage<Executor>()

/**
 * Roda `fn` com `executor` como o banco de todo `db.*`, `emTransacao`, `emLote` e `travar*` de dentro.
 *
 * `worker.ts` abre um por requisição (e por disparo do cron); os testes também.
 */
export function comExecutor<T>(executor: Executor, fn: () => T): T {
  return als.run(executor, fn)
}

/** O executor do escopo atual; fora de `comExecutor`, `undefined` (vale o `db` do Node). */
export function executorAtual(): Executor | undefined {
  return als.getStore()
}
