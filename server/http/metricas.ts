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
import { statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { type IntervalHistogram, monitorEventLoopDelay } from 'node:perf_hooks'

import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { collectDefaultMetrics, Counter, Gauge, Histogram, register } from 'prom-client'

import { cacheDeTraducao } from '../ai/cacheDeTraducao'
import { contagemDosDisjuntores } from '../ai/disjuntor'
import { rotulosDoRegistro } from '../ai/registroDeProvedores'
import { registrarObservadorDeConsultas, type TipoDeConsulta } from '../db/observadorDeConsultas'
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
const PREFIXOS_DE_IA = ['/api/ai', '/api/tutor', '/api/gemini']

/**
 * Baldes em MILISSEGUNDOS para as métricas de IA e de captura. Vão de 50 ms (um parcial do Whisper
 * local numa GPU boa) a 120 s (o teto do corpo da telemetria, e além do pior caso do STT com três
 * tentativas de 30 s).
 */
const BALDES_MS = [50, 100, 250, 500, 1000, 2000, 4000, 8000, 15000, 30000, 60000, 120000]

/** Fator de tempo real (processamento ÷ duração do áudio). Abaixo de 1 a captura acompanha a fala. */
const BALDES_RTF = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10, 50]

interface Estado {
  duracao: Histogram<'method' | 'route' | 'status'>
  errosHttp: Counter<'method' | 'route' | 'status'>
  chamadasDeIa: Counter<'route' | 'status' | 'resultado'>
  provedorLatencia: Histogram<'provedor' | 'funcao' | 'fornecedor' | 'modelo'>
  provedorCusto: Counter<'provedor' | 'funcao' | 'fornecedor' | 'modelo'>
  provedorLimite: Counter<'provedor' | 'modelo'>
  admissaoRecusada: Counter<'motivo' | 'plano'>
  sttDescartes: Counter<'motivo'>
  capturaSttFinal: Histogram<'motor'>
  capturaPrimeiroParcial: Histogram<'motor'>
  capturaMt: Histogram<'motor'>
  capturaRtf: Histogram<'motor'>
  capturaDescartes: Counter<never>
  capturaFallback: Counter<'motor'>
  dependenciaDegradada: Counter<'dependencia'>
  ofertaEventos: Counter<'evento' | 'gatilho' | 'componente'>
  ofertaEventosPorPlano: Counter<'evento' | 'plano_atual' | 'plano_sugerido' | 'variante'>
  /* Fase 5 de prontidão (25/09/2026): o que faltava para alertar e para decidir quando escalar. */
  dbDuracao: Histogram<'tipo'>
  dbEscritas: Counter<never>
  dbLeituras: Counter<never>
  iaCustoPorPlano: Counter<'plano'>
  gastoAnomalo: Counter<'motivo'>
  cacheDeTraducao: Counter<'resultado'>
  cacheDeTraducaoPorNivel: Counter<'nivel' | 'resultado'>
  uploadsRecusados: Counter<'motivo'>
  backupFalhas: Counter<never>
  backupUltimoSucesso: Gauge<never>
  backupBytes: Gauge<never>
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
    /* O PROVEDOR, AGORA DE DENTRO (Fase de qualidade da captura, 24/09/2026). O contador acima mede
       o proxy e diz, com razão, que não enxerga o provedor. Estas duas são alimentadas por
       `server/ai/sttProxy.ts` e `server/ai/cascata.ts`, que sabem QUEM atendeu. As labels são
       rótulos fixos do código (`llm-primario`, `llm-reserva`, `stt-gerenciado`, `byok`) — nunca a
       URL do provedor, que no BYOK é escolha do usuário e seria uma série por usuário.
       B2 DA FASE B: `fornecedor` e `modelo` dizem QUEM atendeu (`deepinfra`, `openai/gpt-oss-120b`).
       A lista é FECHADA e vem do registro de provedores (`rotulosDoRegistro`): o que não foi declarado
       vira `outro`, e o BYOK continua `byok` — a cardinalidade é a do registro, não a do tráfego. */
    provedorLatencia: new Histogram({
      name: 'ia_provedor_latencia_ms',
      help: 'Latência da chamada ao provedor de IA (com as retentativas), em ms, por papel (provedor), função, fornecedor e modelo.',
      labelNames: ['provedor', 'funcao', 'fornecedor', 'modelo'] as const,
      buckets: BALDES_MS,
    }),
    provedorCusto: new Counter({
      name: 'ia_provedor_custo_usd_total',
      help: 'Custo ESTIMADO (US$) das chamadas entregues com a chave do dono, pelo preço de fornecedor:modelo (server/lib/orcamentoDeIa.ts), por papel, função, fornecedor e modelo. BYOK não entra: não é dinheiro do serviço.',
      labelNames: ['provedor', 'funcao', 'fornecedor', 'modelo'] as const,
    }),
    /* O LIMITE DO PROVEDOR (429), por provedor e MODELO. É o número que diz "a camada gratuita da
       Groq não aguenta o tráfego — suba o tier". O modelo entra porque os limites da Groq são POR
       MODELO; a cardinalidade é a dos modelos configurados no env (BYOK vira o rótulo fixo `byok`,
       nunca o nome que o usuário escolheu). */
    provedorLimite: new Counter({
      name: 'ia_provedor_limite_total',
      help: 'Respostas 429 (limite de taxa) dos provedores de IA, por provedor e modelo. Subindo, é hora de subir o tier do provedor.',
      labelNames: ['provedor', 'modelo'] as const,
    }),
    /* A ADMISSÃO DE IA (ADR 0007): quantas chamadas o PRÓPRIO servidor recusou antes de gastar o
       limite do provedor, por motivo (`minuto`, `dia`, `tokens_dia`, `provedor_limitou`, `em_voo`) e
       plano (`pro`, `essencial`, `convidado`). Subindo `minuto` para o Pro é a hora de subir o tier
       do provedor; subindo só para `essencial` é a reserva do Pro fazendo o seu trabalho. */
    admissaoRecusada: new Counter({
      name: 'ia_admissao_recusada_total',
      help: 'Chamadas de IA ao vivo recusadas pela admissão do servidor (429 nuvem_ocupada), por motivo e plano.',
      labelNames: ['motivo', 'plano'] as const,
    }),
    sttDescartes: new Counter({
      name: 'stt_segmentos_descartados_total',
      help: 'Segmentos do Whisper de nuvem descartados no servidor, por motivo (sem_fala, repeticao) — e transcrições inteiras esvaziadas pelo filtro de alucinação (alucinacao).',
      labelNames: ['motivo'] as const,
    }),
    /* A TELEMETRIA DE CAPTURA que o cliente manda (`POST /api/metricas/captura`). Label só `motor`,
       e o motor já chega saneado contra uma allowlist de formato — ver `server/routes/metricasCaptura.ts`. */
    /* ADR 0009: o R2 fora do ar NÃO derruba mais o `/api/ready` — então a readiness deixou de
       ser o alarme dele. Este contador é o alarme: cresce a cada sonda que achou a dependência
       fora. Label fixa do código (`armazenamento`), nunca o endpoint. */
    dependenciaDegradada: new Counter({
      name: 'ready_dependencia_degradada_total',
      help: 'Sondas do /api/ready que acharam uma dependência DEGRADÁVEL fora do ar (hoje só o armazenamento S3/R2). O ready segue 200; este contador é o alarme.',
      labelNames: ['dependencia'] as const,
    }),
    capturaSttFinal: new Histogram({
      name: 'captura_stt_final_ms',
      help: 'Do fim da fala ao texto final do STT, medido no navegador, por motor de STT.',
      labelNames: ['motor'] as const,
      buckets: BALDES_MS,
    }),
    capturaPrimeiroParcial: new Histogram({
      name: 'captura_primeiro_parcial_ms',
      help: 'Do início da fala ao primeiro texto parcial, medido no navegador, por motor de STT.',
      labelNames: ['motor'] as const,
      buckets: BALDES_MS,
    }),
    capturaMt: new Histogram({
      name: 'captura_mt_ms',
      help: 'Latência da tradução de uma fala, medida no navegador, por motor de tradução.',
      labelNames: ['motor'] as const,
      buckets: BALDES_MS,
    }),
    capturaRtf: new Histogram({
      name: 'captura_rtf',
      help: 'Fator de tempo real do STT (processamento ÷ duração do áudio), por motor de STT.',
      labelNames: ['motor'] as const,
      buckets: BALDES_RTF,
    }),
    capturaDescartes: new Counter({
      name: 'captura_descartes_alucinacao_total',
      help: 'Transcrições descartadas pelo filtro de alucinação NO NAVEGADOR.',
    }),
    capturaFallback: new Counter({
      name: 'captura_fallback_total',
      help: 'Quedas de um motor para o seguinte na cadeia do cliente, por motor que falhou.',
      labelNames: ['motor'] as const,
    }),
    /* O FUNIL DAS OFERTAS DE PLANOS (Fase 8, `POST /api/metricas/ofertas`). Anônimo: nenhuma label
       identifica pessoa. `gatilho` só assume ids que existem (os embutidos e os do payload atual de
       `oferta_planos`, até 50) — o resto vira `outro`; ver `server/routes/metricasOfertas.ts`.
       Conversão = razão entre `evento`s do mesmo gatilho (docs/ofertas.md). */
    ofertaEventos: new Counter({
      name: 'oferta_eventos_total',
      help: 'Eventos do funil de ofertas de planos (exibida, dispensada, nao_mostrar, clicada, checkout_iniciado, assinatura_concluida), por gatilho e componente. Anônimo.',
      labelNames: ['evento', 'gatilho', 'componente'] as const,
    }),
    ofertaEventosPorPlano: new Counter({
      name: 'oferta_eventos_por_plano_total',
      help: 'Os mesmos eventos do funil de ofertas, por plano atual, plano sugerido e variante (A/B). Anônimo.',
      labelNames: ['evento', 'plano_atual', 'plano_sugerido', 'variante'] as const,
    }),
    /* O BANCO, medido no cliente libsql (`server/db/observadorDeConsultas.ts`). `tipo` é
       `leitura`|`escrita`, decidido pela primeira palavra do SQL — nunca o SQL, que seria uma série
       por consulta. É o número do gatilho do ADR 0006 (escritas/s sustentadas). */
    dbDuracao: new Histogram({
      name: 'db_consulta_duracao_segundos',
      help: 'Duração de cada execute/batch no cliente libsql, por tipo (leitura|escrita). Transações (emTransacao) ficam de fora.',
      labelNames: ['tipo'] as const,
      buckets: [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    }),
    dbEscritas: new Counter({
      name: 'db_escritas_total',
      help: 'Instruções de ESCRITA (INSERT/UPDATE/DELETE/REPLACE/DDL) enviadas ao SQLite. O gatilho do ADR 0006 é rate() disto > 50/s no pico.',
    }),
    dbLeituras: new Counter({
      name: 'db_leituras_total',
      help: 'Instruções de LEITURA (SELECT/WITH/PRAGMA) enviadas ao SQLite.',
    }),
    /* O CUSTO POR PLANO. O mesmo número que soma no orçamento (`registrarGastoDeIa`), agora com o
       plano de quem gastou — é o que diz se o Essencial se paga. Rótulo da allowlist `PLANOS`. */
    iaCustoPorPlano: new Counter({
      name: 'ia_custo_usd_total',
      help: 'Custo ESTIMADO (US$) das chamadas de IA pagas pelo serviço, por plano do usuário. Mesmo número que entra no orçamento global.',
      labelNames: ['plano'] as const,
    }),
    gastoAnomalo: new Counter({
      name: 'ia_gasto_anomalo_usuario_total',
      help: 'Alertas de gasto anômalo de UM usuário no dia (teto absoluto ou N× a mediana). O usuário vai no log, pseudonimizado; aqui só o motivo.',
      labelNames: ['motivo'] as const,
    }),
    cacheDeTraducao: new Counter({
      name: 'ia_cache_traducao_total',
      help: 'Consultas ao cache de tradução do servidor, por resultado (acerto|falta). Acerto é tradução que não foi paga de novo.',
      labelNames: ['resultado'] as const,
    }),
    /* Por NÍVEL (auditoria de eficiência da IA, 28/09): L1 é a memória do processo, L2 o SQLite. Série
       à parte, e não um rótulo a mais na de cima, para o painel e os alertas que já leem
       `ia_cache_traducao_total{resultado}` continuarem valendo. O L2 só é consultado quando o L1
       falta E a frase pode ir ao disco (curta) — por isso a soma dos dois não bate com a de cima. */
    cacheDeTraducaoPorNivel: new Counter({
      name: 'ia_cache_traducao_nivel_total',
      help: 'Consultas a cada nível do cache de tradução (nivel=l1 memória | l2 SQLite), por resultado (acerto|falta).',
      labelNames: ['nivel', 'resultado'] as const,
    }),
    uploadsRecusados: new Counter({
      name: 'uploads_grandes_recusados_total',
      help: 'Uploads grandes recusados pelo semáforo (429 upload_ocupado), por motivo (usuario|processo). `processo` subindo = o teto da máquina é o gargalo.',
      labelNames: ['motivo'] as const,
    }),
    backupFalhas: new Counter({
      name: 'backup_falhas_total',
      help: 'Snapshots diários do banco que falharam (server/operacao/snapshot.ts).',
    }),
    backupUltimoSucesso: new Gauge({
      name: 'backup_ultimo_sucesso_timestamp_segundos',
      help: 'Instante (epoch, s) do último snapshot diário bem-sucedido NESTE processo. Sem série = nenhum desde o boot.',
    }),
    backupBytes: new Gauge({
      name: 'backup_ultimo_tamanho_bytes',
      help: 'Tamanho (bytes, comprimido) do último snapshot diário bem-sucedido.',
    }),
  }
  histogramaDoEventLoop()
  registrarObservadorDeConsultas(observarConsulta)
  registrarMedidoresLidosNoScrape()
  /* O SALDO é lido NA HORA DO SCRAPE (`collect`), e não empurrado a cada chamada: o bucket se
     reabastece com o tempo, e um valor empurrado ficaria parado no último pedido — o painel
     mostraria "vazio" por uma hora depois que a fila já tinha voltado. Cardinalidade: os modelos
     configurados no env (um ou dois por função), nunca nome escolhido por usuário. */
  new Gauge({
    name: 'ia_admissao_saldo',
    help: 'Saldo atual do token bucket da admissão de IA (pedidos disponíveis no minuto), por provedor e modelo.',
    labelNames: ['provedor', 'modelo'] as const,
    collect() {
      this.reset()
      for (const s of leitorDeSaldo?.() ?? []) this.set({ provedor: s.provedor, modelo: s.modelo }, s.saldo)
    },
  })
  return estado
}

/**
 * O ATRASO DO EVENT LOOP como HISTOGRAMA de verdade, alimentado pelo `monitorEventLoopDelay`.
 *
 * O `collectDefaultMetrics` já expõe `nodejs_eventloop_lag_p99_seconds`, mas como GAUGE do intervalo
 * entre dois scrapes: não dá para tirar dele um p99 de 5 minutos, nem somar processos. A Fase 2
 * mediu que o driver libsql prende o loop pela consulta inteira (115 ms de `list` = 117 ms de buraco)
 * e que o snapshot chegou a 34 s — é o número que mais cedo denuncia "um usuário travou todos".
 *
 * COMO. O `IntervalHistogram` do Node (HDR, resolução de 20 ms) guarda a distribuição do intervalo;
 * a cada scrape ele vira observações: para cada percentil `p` com valor `v`, entram as amostras entre
 * o percentil anterior e `p`, todas com o valor `v`. É exato na resolução de percentis do HDR (fina) e
 * custa, por scrape, no máximo o número de amostras do intervalo (~750 a cada 15 s). Depois zera.
 */
const RESOLUCAO_DO_LOOP_MS = 20
const BALDES_DO_LOOP = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30]
let monitorDoLoop: IntervalHistogram | undefined

function histogramaDoEventLoop(): void {
  monitorDoLoop = monitorEventLoopDelay({ resolution: RESOLUCAO_DO_LOOP_MS })
  monitorDoLoop.enable()
  new Histogram({
    name: 'event_loop_atraso_segundos',
    help: 'Atraso do event loop (monitorEventLoopDelay, resolução 20 ms), em segundos. p99 alto = algo síncrono está travando todos os usuários.',
    buckets: BALDES_DO_LOOP,
    collect() {
      const h = monitorDoLoop
      if (!h || !(h.count > 0)) return
      const pontos = [...h.percentiles.entries()].sort((a, b) => a[0] - b[0])
      let observadas = 0
      for (const [percentil, ns] of pontos) {
        const alvo = Math.min(h.count, Math.round((percentil / 100) * h.count))
        /* O HDR registra o INTERVALO entre dois disparos do timer, que inclui a própria resolução
           (20 ms): um loop ocioso mediria 20 ms. Descontada, o ocioso mede ~0 e o limiar do alerta
           (500 ms) é atraso de verdade. */
        const atraso = Math.max(0, ns / 1e9 - RESOLUCAO_DO_LOOP_MS / 1000)
        for (; observadas < alvo; observadas++) this.observe(atraso)
      }
      h.reset()
    },
  })
}

const PADRAO_DE_ESCRITA = /^\s*(insert|update|delete|replace|create|alter|drop)\b/i

/** Classifica pela primeira palavra do SQL. `WITH … INSERT` é raro aqui e conta como leitura. */
export function tipoDaInstrucao(sql: string): TipoDeConsulta {
  return PADRAO_DE_ESCRITA.test(sql) ? 'escrita' : 'leitura'
}

function observarConsulta(o: { instrucoes: string[]; segundos: number }): void {
  if (!estado) return
  let escritas = 0
  for (const sql of o.instrucoes) if (tipoDaInstrucao(sql) === 'escrita') escritas++
  const leituras = o.instrucoes.length - escritas
  if (escritas) estado.dbEscritas.inc(escritas)
  if (leituras) estado.dbLeituras.inc(leituras)
  estado.dbDuracao.observe({ tipo: escritas ? 'escrita' : 'leitura' }, o.segundos)
}

/* ─────────────── o que é LIDO na hora do scrape (estado de agora, não evento) ─────────────── */

export interface GastoParaMetricas {
  diaUsd: number
  mesUsd: number
  /** `Infinity` = sem teto; aí a série não é emitida (um `+Inf` quebraria a razão do alerta). */
  tetoDiaUsd: number
  tetoMesUsd: number
}

let leitorDeGasto: (() => Promise<GastoParaMetricas>) | undefined
/** `server/lib/orcamentoDeIa.ts` se registra aqui — ele lê `gasto_de_ia`; este módulo não importa o banco. */
export function registrarLeitorDeGasto(fn: () => Promise<GastoParaMetricas>): void {
  leitorDeGasto = fn
}

let leitorDeUploads: (() => { emVoo: number; limite: number }) | undefined
/** `server/lib/corposGrandes.ts` se registra aqui (ele importa este módulo; o contrário faria ciclo). */
export function registrarLeitorDeUploads(fn: () => { emVoo: number; limite: number }): void {
  leitorDeUploads = fn
}

/** O arquivo do SQLite (e o WAL), quando o banco é local. Remoto: sem série. */
function tamanhoDoBanco(): number | undefined {
  const url = process.env.DATABASE_URL ?? 'file:./data/babel.db'
  if (!url.startsWith('file:')) return undefined
  const arquivo = url.slice('file:'.length)
  let total = 0
  for (const sufixo of ['', '-wal']) {
    try {
      total += statSync(arquivo + sufixo).size
    } catch {
      /* sem WAL (ou sem banco ainda): conta o que existe */
    }
  }
  return total
}

/** Uma leitura do gasto por scrape, compartilhada pelos dois gauges que dependem dela. */
let gastoEmVoo: Promise<GastoParaMetricas | undefined> | undefined
function lerGastoUmaVez(): Promise<GastoParaMetricas | undefined> {
  if (!leitorDeGasto) return Promise.resolve(undefined)
  gastoEmVoo ??= leitorDeGasto()
    .catch(() => undefined) // banco fora: sem série; a regra `absent()` é quem avisa
    .finally(() => setImmediate(() => (gastoEmVoo = undefined)))
  return gastoEmVoo
}

function registrarMedidoresLidosNoScrape(): void {
  new Gauge({
    name: 'ia_gasto_usd',
    help: 'Gasto ESTIMADO de IA de nuvem no período corrente (dia UTC | mês), em US$, lido de gasto_de_ia no scrape.',
    labelNames: ['periodo'] as const,
    async collect() {
      this.reset()
      const g = await lerGastoUmaVez()
      if (!g) return
      this.set({ periodo: 'dia' }, g.diaUsd)
      this.set({ periodo: 'mes' }, g.mesUsd)
    },
  })
  new Gauge({
    name: 'ia_orcamento_teto_usd',
    help: 'Teto do orçamento de IA por período (AI_BUDGET_USD_DAY | AI_BUDGET_USD_MONTH). Sem teto = sem série.',
    labelNames: ['periodo'] as const,
    async collect() {
      this.reset()
      const g = await lerGastoUmaVez()
      if (!g) return
      if (Number.isFinite(g.tetoDiaUsd)) this.set({ periodo: 'dia' }, g.tetoDiaUsd)
      if (Number.isFinite(g.tetoMesUsd)) this.set({ periodo: 'mes' }, g.tetoMesUsd)
    },
  })
  /* Contagem por ESTADO, e não uma série por disjuntor: a chave do disjuntor é endereço + modelo, e
     no BYOK o endereço é escolha do usuário — seria uma série por usuário. */
  new Gauge({
    name: 'ia_disjuntores',
    help: 'Disjuntores de provedor de IA por estado (fechado|aberto|meio-aberto). aberto > 0 = um provedor está sendo pulado.',
    labelNames: ['estado'] as const,
    collect() {
      this.reset()
      for (const [e, n] of Object.entries(contagemDosDisjuntores())) this.set({ estado: e }, n)
    },
  })
  new Gauge({
    name: 'uploads_grandes_em_voo',
    help: 'Uploads grandes (áudio de sessão, .apkg) em andamento neste processo (server/lib/corposGrandes.ts).',
    collect() {
      const u = leitorDeUploads?.()
      if (u) this.set(u.emVoo)
    },
  })
  new Gauge({
    name: 'uploads_grandes_limite',
    help: 'Teto de uploads grandes simultâneos por processo (UPLOADS_GRANDES_POR_PROCESSO).',
    collect() {
      const u = leitorDeUploads?.()
      if (u) this.set(u.limite)
    },
  })
  new Gauge({
    name: 'ia_cache_traducao_entradas',
    help: 'Traduções guardadas no cache EM MEMÓRIA (L1) do servidor agora (teto 2.000, TTL 24 h).',
    collect() {
      this.set(cacheDeTraducao.tamanho())
    },
  })
  new Gauge({
    name: 'db_tamanho_bytes',
    help: 'Tamanho do arquivo do SQLite + WAL, em bytes. O gatilho do ADR 0006 é 5 GB.',
    collect() {
      const t = tamanhoDoBanco()
      if (t !== undefined) this.set(t)
    },
  })
}

/** Os planos que viram rótulo — a lista fechada da PLAN_MATRIX. Fora dela, `desconhecido`. */
const PLANOS = new Set(['free', 'essencial', 'pro', 'selfhost'])

/** Custo de uma chamada paga pelo serviço, pelo plano de quem pediu. */
export function contarCustoPorPlano(plano: string | undefined, custoUsd: number): void {
  if (!estado || !Number.isFinite(custoUsd) || custoUsd <= 0) return
  estado.iaCustoPorPlano.inc({ plano: plano && PLANOS.has(plano) ? plano : 'desconhecido' }, custoUsd)
}

export function contarGastoAnomalo(motivo: 'teto' | 'mediana'): void {
  if (!estado) return
  estado.gastoAnomalo.inc({ motivo })
}

export function contarCacheDeTraducao(acerto: boolean): void {
  if (!estado) return
  estado.cacheDeTraducao.inc({ resultado: acerto ? 'acerto' : 'falta' })
}

export function contarNivelDoCacheDeTraducao(nivel: 'l1' | 'l2', acerto: boolean): void {
  if (!estado) return
  estado.cacheDeTraducaoPorNivel.inc({ nivel, resultado: acerto ? 'acerto' : 'falta' })
}

export function contarUploadRecusado(motivo: 'usuario' | 'processo'): void {
  if (!estado) return
  estado.uploadsRecusados.inc({ motivo })
}

export function observarBackup(r: { ok: true; bytes: number } | { ok: false }): void {
  if (!estado) return
  if (r.ok) {
    estado.backupUltimoSucesso.set(Math.floor(Date.now() / 1000))
    estado.backupBytes.set(r.bytes)
  } else estado.backupFalhas.inc()
}

/** Quem sabe ler o saldo da admissão (`server/ai/admissao.ts`) se registra aqui — sem import circular. */
let leitorDeSaldo: (() => Array<{ provedor: string; modelo: string; saldo: number }>) | undefined
export function registrarLeitorDeSaldo(fn: () => Array<{ provedor: string; modelo: string; saldo: number }>): void {
  leitorDeSaldo = fn
}

/** Uma recusa da admissão de IA. `motivo` e `plano` são rótulos fixos do código. */
export function contarAdmissaoRecusada(motivo: string, plano: string): void {
  if (!estado) return
  estado.admissaoRecusada.inc({ motivo, plano })
}

/* ─────────────── ganchos para quem mede de dentro (server/ai, server/routes) ─────────────── */

/**
 * Os ganchos abaixo NÃO criam as métricas: com `METRICS_ENABLED` desligado (o default) `estado`
 * não existe e eles não fazem nada. Quem chama não precisa saber se a observabilidade está ligada.
 */

/**
 * O rótulo de fornecedor/modelo, pela lista FECHADA do registro de provedores. `byok` passa (é rótulo
 * fixo do código); o resto que o registro não conhece vira `outro`.
 */
function rotuloFechado(valor: string | undefined, conhecidos: Set<string>): string {
  if (valor === 'byok') return 'byok'
  return valor && conhecidos.has(valor) ? valor : 'outro'
}

/** Uma chamada ao provedor de IA terminou: latência sempre; custo só quando é dinheiro do dono. */
export function observarChamadaDeProvedor(o: {
  provedor: string
  funcao: string
  ms: number
  custoUsd?: number
  /** Quem atendeu (`groq`, `deepinfra`…) e o modelo — saneados contra o registro. */
  fornecedor?: string
  modelo?: string
}): void {
  if (!estado) return
  const conhecidos = rotulosDoRegistro()
  const labels = {
    provedor: o.provedor,
    funcao: o.funcao,
    fornecedor: rotuloFechado(o.fornecedor, conhecidos.fornecedores),
    modelo: rotuloFechado(o.modelo, conhecidos.modelos),
  }
  if (Number.isFinite(o.ms) && o.ms >= 0) estado.provedorLatencia.observe(labels, o.ms)
  if (o.custoUsd !== undefined && Number.isFinite(o.custoUsd) && o.custoUsd > 0)
    estado.provedorCusto.inc(labels, o.custoUsd)
}

/** Um 429 do provedor. Rótulos fixos do código ou do env — ver o bloco da métrica. */
export function contarLimiteDoProvedor(provedor: string, modelo: string): void {
  if (!estado) return
  estado.provedorLimite.inc({ provedor, modelo })
}

/** Uma sonda do `/api/ready` achou uma dependência degradável fora do ar (ADR 0009). */
export function contarDependenciaDegradada(dependencia: 'armazenamento'): void {
  if (!estado) return
  estado.dependenciaDegradada.inc({ dependencia })
}

/** Segmentos (ou transcrições inteiras) que o STT de nuvem descartou, por motivo. */
export function contarDescartesDoStt(motivo: 'sem_fala' | 'repeticao' | 'alucinacao', quantos: number): void {
  if (!estado || !(quantos > 0)) return
  estado.sttDescartes.inc({ motivo }, quantos)
}

/** O relatório de captura do navegador, JÁ VALIDADO e saneado pela rota. */
export interface RelatorioDeCaptura {
  sttFinalMs: number[]
  primeiroParcialMs: number[]
  mtMs: number[]
  rtf: number[]
  descartesAlucinacao: number
  fallbacks: Record<string, number>
  motorStt: string
  motorMt: string
}

export function observarCaptura(r: RelatorioDeCaptura): void {
  if (!estado) return
  const e = estado
  for (const v of r.sttFinalMs) e.capturaSttFinal.observe({ motor: r.motorStt }, v)
  for (const v of r.primeiroParcialMs) e.capturaPrimeiroParcial.observe({ motor: r.motorStt }, v)
  for (const v of r.mtMs) e.capturaMt.observe({ motor: r.motorMt }, v)
  for (const v of r.rtf) e.capturaRtf.observe({ motor: r.motorStt }, v)
  if (r.descartesAlucinacao > 0) e.capturaDescartes.inc(r.descartesAlucinacao)
  for (const [motor, n] of Object.entries(r.fallbacks)) if (n > 0) e.capturaFallback.inc({ motor }, n)
}

/** Os eventos de oferta JÁ VALIDADOS pela rota (alfabeto fechado em todas as labels). */
export function contarEventosDeOferta(
  eventos: ReadonlyArray<{
    evento: string
    gatilho: string
    componente: string
    plano_atual: string
    plano_sugerido: string
    variante: string
  }>,
): void {
  if (!estado) return
  for (const e of eventos) {
    estado.ofertaEventos.inc({ evento: e.evento, gatilho: e.gatilho, componente: e.componente })
    estado.ofertaEventosPorPlano.inc({
      evento: e.evento,
      plano_atual: e.plano_atual,
      plano_sugerido: e.plano_sugerido,
      variante: e.variante,
    })
  }
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
      const { corpo, processo } = await scrape()
      res.setHeader('x-metrics-processo', processo)
      res.setHeader('content-type', register.contentType)
      /* `res.end` e não `res.send`: `send` com valor dinâmico é o que a regra `resposta-crua`
         (audit/rules/ast-grep) marca, e aqui o corpo é texto puro já com content-type declarado. */
      res.end(corpo)
    } catch (err) {
      log('error', { event: 'metrics_falhou', route: '/metrics', status: 500, error: String(err).slice(0, 300) })
      res.status(500).json({ error: 'falha ao coletar métricas' })
    }
  }
}

/** O corpo do scrape e o processo que respondeu — o mesmo para a porta pública e a interna. */
async function scrape(): Promise<{ corpo: string; processo: string }> {
  const corpo = await register.metrics()
  const irmaos = cluster.isPrimary ? Object.keys(cluster.workers ?? {}).length : 1
  const papel = cluster.isPrimary ? 'primario' : 'worker'
  /* O aviso vai no CORPO, e não só no header: quem lê um scrape na mão (curl) não vê header, e
     é exatamente essa pessoa que corre o risco de somar errado. Linha de comentário é válida no
     formato de exposição e o Prometheus a ignora. */
  const aviso =
    irmaos > 0 || !cluster.isPrimary
      ? `# ATENCAO: numeros deste processo (${papel}:${process.pid}), nao do cluster inteiro. Ver server/http/metricas.ts.\n`
      : ''
  return { corpo: aviso + corpo, processo: `${papel}:${process.pid}` }
}

/**
 * O LISTENER SÓ DE MÉTRICAS — `METRICS_PORTA_INTERNA` (Fase 5 de prontidão, 25/09/2026).
 *
 * É o alvo do `[metrics]` do `fly.toml`. O Prometheus gerenciado do Fly raspa essa porta por dentro
 * da VM a cada 15 s e não sabe mandar `Authorization` (a doc só tem `port` e `path`), então aqui NÃO
 * há token. O que protege é a porta não estar publicada: o proxy do Fly só encaminha as portas de
 * `[http_service]`/`[[services]]` — conferido por `tests/integration/fly-metricas.test.ts`.
 *
 * `node:http` cru, e não Express: é UMA rota, sem corpo, sem auth — e fica fora de todo o pipeline
 * do app (inclusive do `middlewareDeMetricas`, para o próprio scrape não virar série). Só no
 * processo primário (ver `server.ts`): com cluster, é o que acaba com o "scrape alternando de
 * processo" descrito no topo deste arquivo, ao preço de mostrar só o primário — declarado no corpo.
 */
export function iniciarServidorDeMetricas(porta: number, host = '0.0.0.0'): Promise<Server> {
  metricas()
  const servidor = createServer((req, res) => {
    const caminho = (req.url ?? '').split('?')[0]
    if (req.method !== 'GET' || caminho !== '/metrics') {
      res.statusCode = 404
      res.end()
      return
    }
    scrape().then(
      ({ corpo, processo }) => {
        res.setHeader('x-metrics-processo', processo)
        res.setHeader('content-type', register.contentType)
        res.end(corpo)
      },
      (err: unknown) => {
        log('error', { event: 'metrics_falhou', route: '/metrics', status: 500, error: String(err).slice(0, 300) })
        res.statusCode = 500
        res.end()
      },
    )
  })
  return new Promise((resolve, reject) => {
    servidor.once('error', reject)
    servidor.listen(porta, host, () => {
      servidor.off('error', reject)
      /* Não segura o processo vivo no desligamento: quem drena é o servidor do app. */
      servidor.unref()
      resolve(servidor)
    })
  })
}

/** Só para os testes: esquece as métricas registradas entre casos. */
export function esquecerMetricas(): void {
  register.clear()
  monitorDoLoop?.disable()
  monitorDoLoop = undefined
  registrarObservadorDeConsultas(undefined)
  estado = undefined
}
