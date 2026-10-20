/**
 * O ESCOPO DE UMA REQUISIÇÃO (ou disparo do cron) NO WORKER, depois que o `Client` abriu: o miolo do
 * `noEscopo` do `worker.ts`, aqui para os testes exercitarem o ciclo de verdade sem `workerd`.
 *
 *   1. `comContextoDoWorker` com um `waitUntil` que ANOTA cada promessa (e a repassa ao `ctx`): o
 *      `emSegundoPlano` de dentro segue vivo depois da resposta;
 *   2. `comExecutor`: todo `db.*` de dentro usa a conexão desta requisição;
 *   3. o `Client` só fecha depois que o corpo da resposta terminou de sair E todo `waitUntil` anotado
 *      assentou — o trabalho em segundo plano (e o `finally` dos handlers, que `capturarAssincrono`
 *      registra ali no Worker) ainda consulta o banco. E o próprio `fechar()` espera o executor ficar
 *      ocioso antes do `end()` (`server/db/executor.ts`).
 */
import { comExecutor, type Executor } from '../db/executor'
import { log } from './logger'
import { comContextoDoWorker, type ContextoDoWorker } from './runtime'

const mensagem = (err: unknown) => String((err as Error)?.message ?? err).slice(0, 300)

/**
 * Roda `fn` no escopo da requisição. `fn` devolve o resultado e a promessa de "terminou de verdade" (o
 * corpo da resposta, no `fetch`); o `Client` fecha depois dela e de todo `waitUntil` anotado.
 */
export async function rodarNoEscopoDaRequisicao<T>(
  executor: Executor,
  ctx: ContextoDoWorker,
  fn: () => Promise<[T, Promise<void>]>,
): Promise<T> {
  const pendentes: Promise<unknown>[] = []
  const contexto: ContextoDoWorker = {
    waitUntil(p) {
      pendentes.push(p)
      ctx.waitUntil(p)
    },
  }
  let terminou: Promise<void> = Promise.resolve()
  try {
    const [resultado, fim] = await comContextoDoWorker(contexto, () => comExecutor(executor, fn))
    terminou = fim
    return resultado
  } finally {
    ctx.waitUntil(
      (async () => {
        await terminou
        /* Um `waitUntil` pode chegar enquanto os outros assentam (o `finish` da resposta, um lote do
           Langfuse): espera até a lista parar de crescer. */
        for (let vistos = -1; vistos !== pendentes.length; ) {
          vistos = pendentes.length
          await Promise.allSettled(pendentes)
        }
        await executor.fechar()
      })().catch((err) => log('error', { event: 'worker_fechar_cliente_falhou', error: mensagem(err) })),
    )
  }
}
