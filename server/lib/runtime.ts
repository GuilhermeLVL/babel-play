/**
 * ONDE ESTE CÓDIGO RODA — Node (servidor de sempre, CI, scripts) ou Cloudflare Worker.
 *
 * Regra da Fase 2 (boot preguiçoso): nenhum módulo do servidor lê ambiente ou disco ao ser importado.
 * Quem precisa saber se há disco, ou se está num isolate, pergunta AQUI, na hora de usar.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

import { log } from './logger'

/**
 * Num Worker, `navigator.userAgent` é exatamente `Cloudflare-Workers`. No Node é `Node.js/<versão>`.
 *
 * `BABEL_RUNTIME=worker` é o GANCHO DE TESTE (como `BABEL_SEM_DISCO`): faz o Node responder como o Worker, para
 * provar que a fachada de métricas não carrega o `prom-client` ali. Lido a cada chamada, nunca no import.
 */
export function ehWorker(): boolean {
  if (process.env.BABEL_RUNTIME === 'worker') return true
  return (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent === 'Cloudflare-Workers'
}

/**
 * Há sistema de arquivos gravável (PGlite em diretório, `secret.key`, áudio em disco)? Por ora: só fora do Worker.
 *
 * `BABEL_SEM_DISCO=1` é o GANCHO DE TESTE: faz o Node responder como o Worker, para os testes exercitarem
 * o caminho sem disco (upload em stream para o R2) sem `workerd`. Lido a cada chamada, nunca no import.
 */
export function temDisco(): boolean {
  if (ehWorker()) return false
  return process.env.BABEL_SEM_DISCO !== '1'
}

/** O pedaço do `ExecutionContext` do Worker que interessa aqui. */
export interface ContextoDoWorker {
  waitUntil(p: Promise<unknown>): void
}

/* Criado no primeiro uso, nunca no import (regra do boot preguiçoso). O `AsyncLocalStorage` existe no
   Worker com `nodejs_compat` — é o mesmo que `server/db/executor.ts` usa para o executor por requisição. */
let alsDoWorker: AsyncLocalStorage<ContextoDoWorker> | undefined
const als = (): AsyncLocalStorage<ContextoDoWorker> => (alsDoWorker ??= new AsyncLocalStorage<ContextoDoWorker>())

/**
 * Roda `fn` com o `ctx` da requisição do Worker à mão de `emSegundoPlano`. Quem abre é o `worker.ts`
 * (Task 12), em volta de cada `fetch`/`scheduled`; o contexto segue a cadeia assíncrona de `fn`.
 */
export function comContextoDoWorker<T>(ctx: ContextoDoWorker, fn: () => T): T {
  return als().run(ctx, fn)
}

/**
 * Trabalho que segue depois da resposta, sem segurar quem pediu (envelope do Sentry, lote do Langfuse,
 * recálculo de dificuldade depois da rodada).
 *
 * - Dentro de `comContextoDoWorker`: vai para o `ctx.waitUntil` — num Worker, uma promessa solta morre
 *   com o fim da requisição, e o `waitUntil` é o que a mantém viva até terminar.
 * - Fora dele (o Node de sempre, timers, testes): só não espera.
 *
 * Nos dois casos a falha vai para o log (`segundo_plano_falhou`, só a mensagem, que o logger redige)
 * e NUNCA vira exceção nem rejeição não tratada — nem a do `waitUntil`.
 */
export function emSegundoPlano(p: PromiseLike<unknown>): void {
  const falhou = (err: unknown) =>
    log('error', { event: 'segundo_plano_falhou', error: String((err as Error)?.message ?? err).slice(0, 300) })
  /* `Promise.resolve`: um thenable qualquer (ou uma promessa de outro realm) vira promessa de verdade. */
  const seguro = Promise.resolve(p).then(() => undefined, falhou)
  const ctx = alsDoWorker?.getStore()
  if (!ctx) return
  try {
    ctx.waitUntil(seguro)
  } catch (err) {
    /* `waitUntil` fora de hora (contexto já encerrado) não derruba quem chamou: a tarefa segue solta. */
    falhou(err)
  }
}

/**
 * Amarra `fn` ao contexto da requisição ATUAL. Para ouvintes de evento da resposta (`close`, `finish`): o
 * ouvinte é registrado dentro da requisição, mas o evento é emitido depois, de fora da cadeia assíncrona
 * dela (o socket que fechou), e lá `emSegundoPlano` não acharia o `waitUntil`.
 */
export function noContextoAtual<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return AsyncLocalStorage.bind(fn)
}
