/**
 * PONTO DE ENTRADA DO WORKER (Fase 2, Task 12). O par do `server.ts` (Node): o mesmo `criarApp()`, servido
 * pelo `httpServerHandler` do `cloudflare:node` (`nodejs_compat`). Configuração em `wrangler.jsonc`.
 *
 *   /api/*   → Express. Todo o resto → `env.ASSETS` (o build do Vite): o SITE PÚBLICO na raiz e o app em
 *              `/app` (`server/http/siteNoWorker.ts`: www→apex, legados do app→`/app`, 404 de verdade,
 *              `noindex` fora do host de produção). O
 *              `run_worker_first` traz para cá a API e os DOCUMENTOS (`/*`, menos os estáticos pesados; a
 *              página de anúncios não mora mais aqui, é o Worker próprio `frasy-anuncios`, R35): é aqui que a
 *              CSP dos anúncios é sobreposta quando a flag está ligada (`servirEstatico`, rulings R31/R32). Os estáticos pesados vão direto ao Static Assets.
 *   cron     → `executarJobsDoCron(controller.cron)` (o registro em `server/jobs/registro.ts`).
 *
 * POR REQUISIÇÃO (e por disparo do cron), nesta ordem:
 *   1. `ligarBucketDoR2(env.MIDIA)` — idempotente; antes do portão do boot e de qualquer rota (o store de
 *      sessões memoiza). O app Express é montado FORA dos escopos abaixo (`express()`).
 *   2. um `pg.Client` pelo Hyperdrive (`abrirClienteDoHyperdrive`) dentro de `comExecutor`: todo `db.*` de
 *      dentro usa ESTA conexão. Fora do escopo, `db` lança no Worker (`aberto()` em `server/db/db.ts`).
 *   3. `comContextoDoWorker` com um `waitUntil` que ANOTA cada promessa (e a repassa ao `ctx`): o
 *      `emSegundoPlano` de dentro segue vivo depois da resposta.
 *   4. o `Client` só fecha depois que o corpo da resposta terminou de sair E todo `waitUntil` anotado
 *      assentou — o trabalho em segundo plano ainda consulta o banco. O handler de cada rota entra nessa
 *      lista (`capturarAssincrono`, por causa do `finally` que estorna depois da resposta), e o `fechar()`
 *      ainda espera o trabalho em voo do executor. Os passos 2–4: `server/lib/escopoDaRequisicao.ts`.
 *
 * O MODO: o Worker é SEMPRE produção. O `define` do `wrangler.jsonc` fixa o literal `process.env.NODE_ENV` em
 * `"production"` (também no `wrangler dev`), e `fixarModo()` copia o mesmo valor para o `process.env` do
 * runtime, que é o que lê quem recebe `env = process.env` por parâmetro (`config.ts`, registro de IA,
 * Langfuse). Sem isso as travas de produção ficariam abertas: o wrangler só troca o literal.
 *
 * O BOOT: as travas de `validarBoot()` rodam na primeira requisição do isolate e, enquanto alguma abortar, a
 * cada requisição (`server/boot/portaoDoWorker.ts`): toda `/api/*` responde 503 `boot_falhou` até passar.
 *
 * O IP: o `X-Forwarded-For` do cliente é apagado e substituído pelo `CF-Connecting-IP` (`ipDaBorda.ts`).
 *
 * O AMBIENTE: com `nodejs_compat` e data de compatibilidade ≥ 2025-04-01 os `vars`/secrets já chegam em
 * `process.env` (confirmado no spike S7); nada é copiado à mão. As MIGRAÇÕES não rodam aqui (são do deploy):
 * a primeira requisição de cada isolate confere `schemaPresente()` e, sem schema, responde 503
 * `banco_indisponivel` (fail closed) e confere de novo na próxima.
 */
import { createServer } from 'node:http'

import { httpServerHandler } from 'cloudflare:node'

import { conferirBootDoWorker } from './server/boot/portaoDoWorker'
import { abrirClienteDoHyperdrive } from './server/db/clientePorRequisicao'
import type { Executor } from './server/db/executor'
import { schemaPresente } from './server/db/manutencao'
import { FLAG_ANUNCIOS } from './src/core/anuncios/politicaDeAnuncio'
import { anunciosLigadosNoIsolate } from './server/http/anunciosNoWorker'
import { criarApp } from './server/http/app'
import { cspComAnuncios, origemDosAnuncios } from './server/http/csp'
import { definicoesDasFlags } from './server/lib/flags'
import { comIpDaBorda } from './server/http/ipDaBorda'
import {
  CABECALHO_NOINDEX,
  comNoindex,
  decidirRotaDoSite,
  hostIndexavel,
  ROBOTS_BLOQUEADO,
} from './server/http/siteNoWorker'
import { executarJobsDoCron } from './server/jobs/executar'
import { ligarAnalyticsEngine, type BindingDeMetricas } from './server/http/metricasDoAnalyticsEngine'
import { type BucketR2, ligarBucketDoR2 } from './server/lib/armazenamentoR2'
import { erroGlobal } from './server/lib/erroGlobal'
import { rodarNoEscopoDaRequisicao } from './server/lib/escopoDaRequisicao'
import { log } from './server/lib/logger'

/** Os bindings do `wrangler.jsonc` (tipados à mão: ver `cloudflare.d.ts`). */
interface Env {
  HYPERDRIVE: { connectionString: string }
  MIDIA: BucketR2
  /** Analytics Engine (`frasy_metricas`). Opcional: sem ele (dev local, testes) as métricas do Worker não saem. */
  METRICAS?: BindingDeMetricas
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

/** O runtime concorda com o literal embutido pelo `define` (sempre `production`; ver o topo). */
function fixarModo(): void {
  process.env['NODE' + '_ENV'] = process.env.NODE_ENV
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
 * O CLIENTE DESISTIU NO MEIO DO CORPO (upload cancelado, aba fechada)? A rota que perde o corpo volta sem
 * responder (`CorpoInterrompido`: não há a quem), e o `fetch` do Express nunca resolveria — o escopo não
 * fecharia e o `Client` ficaria aberto. O corpo passa por um leitor que distingue a FONTE falhar (o cliente
 * caiu: `desistiu` resolve) de quem lê parar (a rota recusou e cancelou a leitura: nada muda). O handler
 * segue até o fim pelo `waitUntil` (`capturarAssincrono`), estornos incluídos.
 */
function vigiarCorpo(request: Request): [Request, Promise<Response>] {
  const nunca = new Promise<Response>(() => {})
  if (!request.body) return [request, nunca]
  const fonte = request.body.getReader()
  let avisar!: () => void
  const desistiu = new Promise<Response>((ok) => {
    avisar = () => ok(json(499, { error: 'o cliente desistiu da requisição', code: 'cliente_desistiu' }))
  })
  const corpo = new ReadableStream<Uint8Array>({
    async pull(c) {
      let lido: Awaited<ReturnType<typeof fonte.read>>
      try {
        lido = await fonte.read()
      } catch (err) {
        avisar()
        c.error(err)
        return
      }
      if (lido.done) c.close()
      else c.enqueue(lido.value)
    },
    cancel: (motivo) => fonte.cancel(motivo),
  })
  return [new Request(request, { body: corpo }), desistiu]
}

/**
 * Abre o `Client` e roda `fn` no escopo da requisição (`rodarNoEscopoDaRequisicao`: `waitUntil` anotado,
 * executor, e o `Client` fechando só depois do corpo, de todo `waitUntil` e do trabalho em voo). O
 * bucket do R2 já foi ligado por quem chama, antes do portão do boot.
 */
async function noEscopo<T>(env: Env, ctx: Contexto, fn: () => Promise<[T, Promise<void>]>): Promise<T> {
  let executor: Executor
  try {
    executor = await abrirClienteDoHyperdrive(env.HYPERDRIVE.connectionString)
  } catch (err) {
    throw new BancoInacessivel(err)
  }
  return rodarNoEscopoDaRequisicao(executor, ctx, fn)
}

/** A flag `anuncios` no banco (a linha habilitada), por um `Client` do Hyperdrive aberto só para isso. */
async function lerFlagDosAnuncios(env: Env, ctx: Contexto): Promise<boolean> {
  ligarBucketDoR2(env.MIDIA) // antes do portão, como na API
  if (conferirBootDoWorker()) return false
  return noEscopo(env, ctx, async () => {
    const def = (await definicoesDasFlags()).find((d) => d.chave === FLAG_ANUNCIOS)
    return [def?.habilitada === true, Promise.resolve()]
  })
}

/**
 * O ESTÁTICO (rulings R31 e R32). Sai do `ASSETS` como está (com os cabeçalhos do `_headers`), salvo um
 * caso: documento HTML, `ANUNCIOS_ORIGEM` configurada e a flag `anuncios` ligada — aí a origem de anúncios
 * entra em `frame-src` da CSP (`cspComAnuncios`), e só ali. Sem a origem a flag nem é lida. A página de
 * anúncios NÃO mora aqui (Worker `frasy-anuncios`, R35): `/anuncios/*` é um caminho qualquer (404), e uma
 * `ANUNCIOS_ORIGEM` igual à origem do app é recusada (`origemDosAnuncios`).
 */
async function servirEstatico(request: Request, env: Env, ctx: Contexto): Promise<Response> {
  const resposta = await env.ASSETS.fetch(request)
  const origem = origemDosAnuncios(process.env, new URL(request.url).origin)
  if (!origem) return resposta
  /* Documento = o navegador diz (`Sec-Fetch-Dest: document`, vale também para o 304 de revalidação, que vem
     sem `content-type`) OU a resposta é HTML. */
  const documento =
    request.headers.get('sec-fetch-dest') === 'document' ||
    (resposta.headers.get('content-type') ?? '').toLowerCase().includes('text/html')
  if (!documento) return resposta
  const csp = resposta.headers.get('content-security-policy')
  if (!csp) return resposta
  if (!(await anunciosLigadosNoIsolate(() => lerFlagDosAnuncios(env, ctx)))) return resposta
  const r = new Response(resposta.body, resposta)
  r.headers.set('content-security-policy', cspComAnuncios(csp, origem))
  return r
}

/**
 * O SITE E O APP (`server/http/siteNoWorker.ts`): redireciona, ou pede ao `ASSETS` o arquivo da decisão
 * (`/` para o app, `/inicio` para a home) pelo `servirEstatico` — a CSP dos anúncios vale aqui também.
 * Fora do host de produção, `X-Robots-Tag: noindex, nofollow` em tudo e o `robots.txt` que bloqueia.
 */
async function servirSite(request: Request, url: URL, env: Env, ctx: Contexto): Promise<Response> {
  const indexavel = hostIndexavel(url.hostname)
  if (url.pathname === '/robots.txt' && !indexavel) {
    return new Response(ROBOTS_BLOQUEADO, {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': CABECALHO_NOINDEX },
    })
  }
  const d = decidirRotaDoSite(url)
  if (d.tipo === 'redirecionar') {
    const r = new Response(null, { status: d.status, headers: { location: d.destino } })
    if (!indexavel) r.headers.set('x-robots-tag', CABECALHO_NOINDEX)
    return r
  }
  const pedido = d.caminho === url.pathname ? request : new Request(new URL(d.caminho + url.search, url), request)
  const resposta = await servirEstatico(pedido, env, ctx)
  return indexavel ? resposta : comNoindex(resposta)
}

export default {
  async fetch(request: Request, env: Env, ctx: Contexto): Promise<Response> {
    fixarModo()
    const url = new URL(request.url)
    const { pathname } = url
    /* `www.` → o domínio sem `www`, antes de tudo (API inclusive): um endereço só por página. */
    if (url.hostname.toLowerCase().startsWith('www.')) {
      const d = decidirRotaDoSite(url)
      if (d.tipo === 'redirecionar') return new Response(null, { status: d.status, headers: { location: d.destino } })
    }
    /* `/metrics` é só do Node (prom-client); aqui é um 404 explícito, não o `index.html` da SPA. */
    if (pathname === '/metrics') return json(404, { error: 'rota inexistente', code: 'rota_inexistente' })
    /* `/api` sem barra e `/API/...` (qualquer caixa) também são da API: o Express roteia com caixa
       sensível e responde 404 JSON (`server/http/app.ts`); aqui o mesmo 404, e não a SPA do `ASSETS`
       (que serviria o `index.html` com 200 num caminho que o Node nega; ruling R26). */
    if (/^\/api(\/|$)/i.test(pathname) && (pathname === '/api' || !pathname.startsWith('/api/'))) {
      return json(404, { error: 'rota inexistente', code: 'rota_inexistente' })
    }
    if (!pathname.startsWith('/api/')) return servirSite(request, url, env, ctx)
    ligarAnalyticsEngine(env.METRICAS)
    ligarBucketDoR2(env.MIDIA) // antes do portão: o armazenamento de mídia é uma das travas
    if (conferirBootDoWorker()) {
      return json(503, { error: 'servidor mal configurado (ver o log: boot_falhou)', code: 'boot_falhou' })
    }
    try {
      /* O app é montado (e o `http.Server` escuta) FORA de qualquer escopo de requisição: nada do que ele
         guarda pode nascer amarrado ao `AsyncLocalStorage` (executor, `waitUntil`) da primeira. */
      const app = express()
      return await noEscopo(env, ctx, async () => {
        if (!schemaConferido) {
          /* `schemaPresente` já devolve `false` quando o banco falha; o `catch` é para o que escapar dele. */
          const presente = await schemaPresente().catch(() => false)
          if (!presente) {
            const r = indisponivel('banco sem schema: rode as migrações (npm run db:migrate) antes de servir')
            return [r, Promise.resolve()]
          }
          schemaConferido = true
        }
        const [pedido, desistiu] = vigiarCorpo(comIpDaBorda(request))
        return acompanharCorpo(await Promise.race([app.fetch(pedido, env, ctx), desistiu]))
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
    fixarModo()
    ligarAnalyticsEngine(env.METRICAS)
    ligarBucketDoR2(env.MIDIA)
    if (conferirBootDoWorker()) {
      log('error', { event: 'cron_falhou', route: controller.cron, error: 'boot_falhou' })
      return
    }
    ctx.waitUntil(
      noEscopo(env, ctx, async () => [await executarJobsDoCron(controller.cron), Promise.resolve()]).then(
        (resultados) => log('info', { event: 'cron_fim', route: controller.cron, total: resultados.length }),
        (err) => log('error', { event: 'cron_falhou', route: controller.cron, error: mensagem(err) }),
      ),
    )
  },
}
