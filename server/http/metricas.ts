/**
 * MÉTRICAS PROMETHEUS — o `/metrics` que faltava (Fase 5 da rodada de saneamento).
 *
 * O QUE EXISTIA ANTES. O servidor sabia contar coisas de NEGÓCIO (`/api/metrics`, que é a rota de
 * perfil/seeds do jogo) e sabia escrever uma linha JSON por evento (`server/lib/logger.ts`). O que
 * ele não sabia era responder a pergunta de operação: "a p95 de `POST /api/sessions` subiu depois
 * do último deploy?". Log em linha responde "o que aconteceu com ESTE request"; ele não responde
 * distribuição sem alguém agregando texto depois. Métrica é o outro lado, e não havia nenhum.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * CARDINALIDADE: A LABEL É O PADRÃO DA ROTA, NUNCA O CAMINHO PEDIDO.
 *
 * É o erro clássico e ele é irreversível na base do Prometheus: `route="/api/sessions/8f3a…"`
 * cria UMA série temporal por sessão. Medido no banco anonimizado desta rodada, `sessions` tem
 * centenas de linhas e `vocab_cards` milhares — e cada série custa memória residente no servidor
 * de métricas, para sempre, mesmo depois de a sessão ser apagada. Com o padrão
 * (`/api/sessions/:id`) o número de séries é o número de ROTAS, que é 85 hoje e cresce com o
 * código, não com o uso.
 *
 * A label vem de `req.route.path` + `req.baseUrl` (o que o Express de fato casou), e não da URL.
 * Requisição que não casou rota nenhuma — varredura, 404, estático — cai em `desconhecida`, um
 * balde só: sem isso, um scanner de porta inventaria mil séries em dez minutos. `PADRAO_DE_ROTA`
 * fecha a porta de vez, recusando qualquer padrão fora do alfabeto de rota.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * CLUSTER — E POR QUE `AggregatorRegistry` FICOU DE FORA (decisão, não esquecimento).
 *
 * `CLUSTER_WORKERS` faz `server.ts` forkar N processos, e o primário TAMBÉM atende (ele chama
 * `startServer()` e só depois forka — ver `server.ts:306`). Cada processo tem o seu heap, logo o
 * seu registro de métricas: o contador de um não enxerga o do outro.
 *
 * `prom-client` oferece `AggregatorRegistry.clusterMetrics()` para isso, e ele foi RECUSADO aqui
 * depois de ler a implementação (`node_modules/prom-client/lib/cluster.js:70`): o laço pede as
 * métricas para `cluster.workers` — e SÓ para eles. O processo primário não está nessa lista.
 * Num deploy com `CLUSTER_WORKERS=4`, o primário atende ~1/4 do tráfego, e a resposta "agregada"
 * omitiria essa fatia sem dizer nada. Também não dá para concatenar os dois textos: o formato de
 * exposição do Prometheus recusa `# HELP`/`# TYPE` repetidos para a mesma família, então
 * `clusterMetrics()` + `register.metrics()` produz um scrape inválido, não um scrape somado.
 *
 * Entre um número agregado que mente por omissão e um número parcial que se declara parcial, a
 * casa fica com o segundo. O que este arquivo faz:
 *
 *   - responde SEMPRE com o registro DESTE processo;
 *   - diz qual processo respondeu, no header `x-metrics-processo` (papel + pid) e na métrica
 *     `processo_info`, que é o que permite ao operador perceber que os scrapes estão alternando;
 *   - emite um comentário no topo do corpo quando há mais de um processo, para quem lê o scrape
 *     na mão não interpretar um número parcial como total.
 *
 * O CONSERTO DE VERDADE é dar ao `/metrics` um listener próprio, ligado só no primário, para o
 * scrape nunca cair num worker — e isso é uma linha em `server.ts`, que esta fase não toca. Fica
 * registrado como o próximo passo, e não disfarçado de resolvido.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * O REGISTRO É O GLOBAL do `prom-client`, e não um `new Registry()`. Motivo único: `collectDefaultMetrics`
 * e um eventual agregador só enxergam o global, e um registro paralelo obrigaria a lembrar de
 * espelhar tudo. Como o módulo cria as métricas UMA vez (guardadas em `estado`), o risco clássico
 * do registro global — registrar o mesmo nome duas vezes e lançar — não existe aqui.
 */
import cluster from 'node:cluster'
import { timingSafeEqual } from 'node:crypto'

import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { collectDefaultMetrics, Counter, Gauge, Histogram, register } from 'prom-client'

import { tokenDeMetricas } from '../lib/config'
import { log } from '../lib/logger'

/** Rótulo único de tudo que não casou rota — o teto de cardinalidade do lado de fora. */
export const ROTA_DESCONHECIDA = 'desconhecida'

/**
 * Alfabeto de um padrão de rota do Express: segmentos, parâmetros (`:id`) e nada mais.
 *
 * Existe como segunda barreira, não como formatação: `req.route.path` pode ser uma RegExp ou um
 * array quando alguém monta a rota assim, e `req.baseUrl` vem da URL REAL do request. Um padrão
 * que escape deste alfabeto vira `desconhecida` em vez de virar uma série nova.
 */
const PADRAO_DE_ROTA = /^\/[A-Za-z0-9/:_.@-]*$/

/**
 * Baldes em SEGUNDOS, e escolhidos pelo que este servidor faz — não os defaults do prom-client.
 *
 * As medições da rodada dão as duas pontas: `/api/sessions` responde em 7 ms sem concorrência
 * (server.ts:284) e o proxy de IA tem timeout PADRÃO de 30 s (`server/ai/llmClient.ts:72`), com o
 * caminho de importação indo bem além disso. Um
 * conjunto de baldes que pare em 10 s jogaria toda chamada de IA no `+Inf` e a p95 dela deixaria
 * de existir justamente onde ela importa.
 */
const BALDES = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60]

/** Os prefixos que fazem uma rota ser CHAMADA DE IA. Ver `server/http/app.ts`. */
const PREFIXOS_DE_IA = ['/api/ai', '/api/gemini']

interface Estado {
  duracao: Histogram<'method' | 'route' | 'status'>
  errosHttp: Counter<'method' | 'route' | 'status'>
  chamadasDeIa: Counter<'route' | 'status' | 'resultado'>
}

let estado: Estado | undefined

/**
 * Cria as métricas uma vez só.
 *
 * Preguiçoso de propósito: com `METRICS_ENABLED` desligado — que é o default — nada é registrado
 * e `collectDefaultMetrics` não liga o seu timer. Observabilidade que custa mesmo desligada é a
 * primeira coisa que alguém desliga.
 */
function metricas(): Estado {
  if (estado) return estado
  collectDefaultMetrics()

  /* `processo_info` é o que torna o cluster LEGÍVEL a partir do próprio scrape: papel e pid do
     processo que respondeu. Cardinalidade de 1 série por processo vivo, que é o mínimo possível
     para a informação existir. */
  new Gauge({
    name: 'processo_info',
    help: 'Marca o processo que respondeu ao scrape (papel=primario|worker). Ver o bloco de cluster em server/http/metricas.ts.',
    labelNames: ['papel', 'pid'] as const,
  }).set({ papel: cluster.isPrimary ? 'primario' : 'worker', pid: String(process.pid) }, 1)

  estado = {
    duracao: new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duração das respostas HTTP, por PADRÃO de rota (nunca o caminho com id), método e status.',
      labelNames: ['method', 'route', 'status'] as const,
      buckets: BALDES,
    }),
    errosHttp: new Counter({
      name: 'http_errors_total',
      help: 'Respostas HTTP com status >= 400, por padrão de rota, método e status.',
      labelNames: ['method', 'route', 'status'] as const,
    }),
    /* IA SEM TOCAR EM `server/ai/**`: o que dá para medir daqui é o RESULTADO DO NOSSO PROXY —
       200, 402 (sem crédito), 429 (teto), 501 (não configurado), 502 (provedor caiu). O que NÃO
       dá é provedor e nível de fallback, que só existem dentro do `mtProxy`/`llmClient`. Um
       contador que dissesse `provider` a partir da rota estaria inventando. */
    chamadasDeIa: new Counter({
      name: 'ia_chamadas_total',
      help: 'Chamadas às rotas de IA do servidor, por rota e status. Mede o proxy, NÃO o provedor: provedor e nível de fallback vivem em server/ai/** e não são instrumentados aqui.',
      labelNames: ['route', 'status', 'resultado'] as const,
    }),
  }
  return estado
}

/**
 * O padrão de rota que o Express casou, saneado.
 *
 * Lido no `finish` da resposta: é o único momento em que `req.route` já existe para todas as
 * rotas, inclusive as que respondem dentro de um `await`.
 */
export function padraoDaRota(req: Request): string {
  const rota = req.route as { path?: unknown } | undefined
  const caminho = typeof rota?.path === 'string' ? rota.path : undefined
  if (caminho === undefined) return ROTA_DESCONHECIDA
  const base = typeof req.baseUrl === 'string' ? req.baseUrl : ''
  const junto = base + (caminho === '/' ? '' : caminho) || '/'
  return PADRAO_DE_ROTA.test(junto) ? junto : ROTA_DESCONHECIDA
}

/**
 * Middleware de instrumentação. Montado ANTES de tudo em `criarApp()`, senão ele não veria as
 * respostas que os middlewares de cima encerram (401 do auth, 429 do limitador) — que são
 * justamente as que um operador procura primeiro.
 */
export function middlewareDeMetricas(): RequestHandler {
  const m = metricas()
  return function medir(req: Request, res: Response, next: NextFunction): void {
    const inicio = process.hrtime.bigint()
    res.on('finish', () => {
      const segundos = Number(process.hrtime.bigint() - inicio) / 1e9
      const route = padraoDaRota(req)
      const status = String(res.statusCode)
      const labels = { method: req.method, route, status }
      m.duracao.observe(labels, segundos)
      if (res.statusCode >= 400) m.errosHttp.inc(labels)
      if (route !== ROTA_DESCONHECIDA && PREFIXOS_DE_IA.some((p) => route.startsWith(p))) {
        m.chamadasDeIa.inc({ route, status, resultado: res.statusCode < 400 ? 'ok' : 'falha' })
      }
    })
    next()
  }
}

/**
 * Comparação em tempo constante — igualdade de string vaza o tamanho do prefixo certo.
 *
 * Copiada de `server/routes/billing.ts:294` (o token do Asaas) DE PROPÓSITO, e não importada:
 * fundir as duas criaria uma dependência de `server/http/` para uma rota de negócio por causa de
 * seis linhas. Se aparecer um terceiro caso, aí vale um `server/lib/`.
 */
function tokenConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * `GET /metrics`.
 *
 * NÃO é `/api/metrics` — essa já existe e é rota de NEGÓCIO (perfil, seeds, presença;
 * `server/routes/metrics.ts`, montada atrás do auth). A de operação mora na RAIZ, que é onde todo
 * scraper procura por convenção, e o prefixo diferente é o que garante que ela não passe pelo
 * `authMiddleware` de usuário — um scraper não tem JWT de ninguém.
 *
 * A GUARDA É EM DUAS CAMADAS, porque um scrape descreve a superfície inteira do servidor (nomes de
 * rota, volume, taxa de erro) e isso é reconhecimento gratuito para quem ataca:
 *
 *   1. a rota só é MONTADA com `METRICS_ENABLED=1` — desligada, ela responde o mesmo 404 de uma
 *      rota que não existe, e não um 403 que confirma a existência;
 *   2. com `METRICS_TOKEN` definida, exige `Authorization: Bearer <token>`.
 *
 * `METRICS_TOKEN` ausente é o caso do self-host e do scrape em rede interna fechada: exigir um
 * segredo ali seria fricção sem ameaça. Em rede pública ela é obrigatória na prática, e é isso que
 * o `.env.example` diz.
 */
export function handlerDeMetricas(): RequestHandler {
  metricas()
  return async function servirMetricas(req: Request, res: Response): Promise<void> {
    const esperado = tokenDeMetricas()
    if (esperado) {
      const cabecalho = req.header('authorization') ?? ''
      const recebido = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : undefined
      if (!tokenConfere(recebido, esperado)) {
        /* `WWW-Authenticate` porque é o que diz ao scraper COMO se autenticar, em vez de deixá-lo
           adivinhar entre header, query e cookie. */
        res.setHeader('www-authenticate', 'Bearer')
        res.status(401).json({ error: 'token de métricas inválido' })
        return
      }
    }
    /* O `try` existe porque este handler é montado SOLTO no app (`server/http/app.ts`), e
       `capturarAssincrono` só embrulha router: sem ele, uma rejeição de `register.metrics()`
       penduraria o request no Express 4 em vez de virar resposta. E o 500 é do endpoint de
       métricas, não do serviço — coletor quebrado não pode derrubar o que ele observa. */
    try {
      const corpo = await register.metrics()
      const irmaos = cluster.isPrimary ? Object.keys(cluster.workers ?? {}).length : 1
      const papel = cluster.isPrimary ? 'primario' : 'worker'
      res.setHeader('x-metrics-processo', `${papel}:${process.pid}`)
      res.setHeader('content-type', register.contentType)
      /* O aviso vai no CORPO, e não só no header: quem lê um scrape na mão (curl) não vê header, e
         é exatamente essa pessoa que corre o risco de somar errado. Linha de comentário é válida no
         formato de exposição e o Prometheus a ignora. */
      const aviso =
        irmaos > 0 || !cluster.isPrimary
          ? `# ATENCAO: numeros deste processo (${papel}:${process.pid}), nao do cluster inteiro. Ver server/http/metricas.ts.\n`
          : ''
      /* `res.end` e não `res.send`: `send` com valor dinâmico é o que a regra `resposta-crua`
         (audit/rules/ast-grep) marca, e aqui o corpo é texto puro já com content-type declarado. */
      res.end(aviso + corpo)
    } catch (err) {
      log('error', { event: 'metrics_falhou', route: '/metrics', status: 500, error: String(err).slice(0, 300) })
      res.status(500).json({ error: 'falha ao coletar métricas' })
    }
  }
}

/** Só para os testes: esquece as métricas registradas entre casos. */
export function esquecerMetricas(): void {
  register.clear()
  estado = undefined
}
