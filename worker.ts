/**
 * PONTO DE ENTRADA DO WORKER (Fase 2, Task 12). O par do `server.ts` (Node): o mesmo `criarApp()`, servido
 * pelo `httpServerHandler` do `cloudflare:node` (`nodejs_compat`). Configuração em `wrangler.jsonc`.
 *
 *   /api/*   → Express. Todo o resto → `env.ASSETS` (o build do Vite; SPA cai no `index.html`). Com
 *              `run_worker_first: ["/api/*"]` o resto nem chega aqui, salvo o fallback da SPA.
 *   cron     → `executarJobsDoCron(controller.cron)` (o registro em `server/jobs/registro.ts`).
 *
 * POR REQUISIÇÃO (e por disparo do cron), nesta ordem:
 *   1. `ligarBucketDoR2(env.MIDIA)` — idempotente; antes de qualquer rota (o store de sessões memoiza).
 *   2. um `pg.Client` pelo Hyperdrive (`abrirClienteDoHyperdrive`) dentro de `comExecutor`: todo `db.*` de
 *      dentro usa ESTA conexão. Fora do escopo, `db` lança no Worker (`aberto()` em `server/db/db.ts`).
 *   3. `comContextoDoWorker` com um `waitUntil` que ANOTA cada promessa (e a repassa ao `ctx`): o
 *      `emSegundoPlano` de dentro segue vivo depois da resposta.
 *   4. o `Client` só fecha depois que o corpo da resposta terminou de sair E todo `waitUntil` anotado
 *      assentou — o trabalho em segundo plano ainda consulta o banco.
 *
 * O AMBIENTE: com `nodejs_compat` e data de compatibilidade ≥ 2025-04-01 os `vars`/secrets já chegam em
 * `process.env` (confirmado no spike S7); nada é copiado à mão. As MIGRAÇÕES não rodam aqui (são do deploy):
 * a primeira requisição de cada isolate confere `schemaPresente()` e, sem schema, responde 503
 * `banco_indisponivel` (fail closed) e confere de novo na próxima.
 */
import { createServer } from 'node:http'

import { httpServerHandler } from 'cloudflare:node'

import { abrirClienteDoHyperdrive } from './server/db/clientePorRequisicao'
import { comExecutor, type Executor } from './server/db/executor'
import { schemaPresente } from './server/db/manutencao'
import { criarApp } from './server/http/app'
import { executarJobsDoCron } from './server/jobs/executar'
import { type BucketR2, ligarBucketDoR2 } from './server/lib/armazenamentoR2'
import { erroGlobal } from './server/lib/erroGlobal'
import { log } from './server/lib/logger'
import { comContextoDoWorker } from './server/lib/runtime'

/** Os bindings do `wrangler.jsonc` (tipados à mão: ver `cloudflare.d.ts`). */
interface Env {
  HYPERDRIVE: { connectionString: string }
  MIDIA: BucketR2
  ASSETS: { fetch(request: Request): Promise<Response> }
}

/** O pedaço do `ExecutionContext` que interessa aqui. */
interface Contexto {
  waitUntil(p: Promise<unknown>): void
}

interface ControladorDoCron {
  cron: string
  scheduledTime: number
}

/** A porta "virtual" que liga o `http.Server` ao `fetch` (nada escuta de verdade no isolate). */
const PORTA_INTERNA = 8787

let doExpress: ReturnType<typeof httpServerHandler> | undefined

/** O app é montado na primeira requisição do isolate, quando o `process.env` já tem os `vars`/secrets. */
function express(): ReturnType<typeof httpServerHandler> {
  if (!doExpress) {
    const app = criarApp()
    app.use(erroGlobal) // o ÚLTIMO, como no `server.ts`
    createServer(app).listen(PORTA_INTERNA)
    doExpress = httpServerHandler({ port: PORTA_INTERNA })
  }
  return doExpress
}

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })

const indisponivel = (error: string) => json(503, { error, code: 'banco_indisponivel' })

const mensagem = (err: unknown) => String((err as Error)?.message ?? err).slice(0, 300)

/** Não deu para abrir o `Client` pelo Hyperdrive: 503, não 500 (falta de banco, não defeito). */
class BancoInacessivel extends Error {
  constructor(causa: unknown) {
    super(mensagem(causa))
    this.name = 'BancoInacessivel'
  }
}

/** O schema já foi visto neste isolate (só o `true` fica guardado: um banco migrado depois passa a valer). */
let schemaConferido = false

/** Até o corpo sair inteiro (ou o cliente desistir): o `Client` não pode fechar antes de quem ainda escreve nele. */
function acompanharCorpo(r: Response): [Response, Promise<void>] {
  if (!r.body) return [r, Promise.resolve()]
  const { readable, writable } = new TransformStream()
  const terminou = r.body.pipeTo(writable).catch(() => {})
  return [new Response(readable, r), terminou]
}

/**
 * Abre o escopo da requisição (R2, `Client`, `waitUntil`) e roda `fn` dentro. `fn` devolve o resultado e
 * a promessa de "terminou de verdade" (o corpo da resposta, no `fetch`); o `Client` fecha depois dela e de
 * todo `waitUntil` anotado.
 */
async function noEscopo<T>(env: Env, ctx: Contexto, fn: () => Promise<[T, Promise<void>]>): Promise<T> {
  ligarBucketDoR2(env.MIDIA)
  let executor: Executor
  try {
    executor = await abrirClienteDoHyperdrive(env.HYPERDRIVE.connectionString)
  } catch (err) {
    throw new BancoInacessivel(err)
  }
  const pendentes: Promise<unknown>[] = []
  const contexto: Contexto = {
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

export default {
  async fetch(request: Request, env: Env, ctx: Contexto): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    try {
      return await noEscopo(env, ctx, async () => {
        if (!schemaConferido) {
          if (!(await schemaPresente())) {
            const r = indisponivel('banco sem schema: rode as migrações (npm run db:migrate) antes de servir')
            return [r, Promise.resolve()]
          }
          schemaConferido = true
        }
        return acompanharCorpo(await express().fetch(request, env, ctx))
      })
    } catch (err) {
      /* O que escapa daqui veio de fora do Express (o `erroGlobal` responde o resto): abrir o `Client` ou
         o próprio `httpServerHandler`. */
      if (err instanceof BancoInacessivel) {
        log('error', { event: 'worker_banco_indisponivel', error: err.message })
        return indisponivel('banco indisponível')
      }
      log('error', { event: 'worker_requisicao_falhou', error: mensagem(err) })
      return json(500, { error: 'erro interno', code: 'erro_interno' })
    }
  },

  async scheduled(controller: ControladorDoCron, env: Env, ctx: Contexto): Promise<void> {
    ctx.waitUntil(
      noEscopo(env, ctx, async () => [await executarJobsDoCron(controller.cron), Promise.resolve()]).then(
        (resultados) => log('info', { event: 'cron_fim', route: controller.cron, total: resultados.length }),
        (err) => log('error', { event: 'cron_falhou', route: controller.cron, error: mensagem(err) }),
      ),
    )
  },
}
