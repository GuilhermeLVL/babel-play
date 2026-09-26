/**
 * A MONTAGEM DO SERVIDOR — e só ela.
 *
 * O `server.ts` tinha 703 linhas e misturava três coisas: montar o Express, servir uma rota de
 * negócio inteira (o tutor, hoje `/api/tutor/chat`) e subir o processo (migrations, Vite, cluster, `listen`).
 * A Fase 3 da rodada de saneamento separou as três. Aqui fica a PRIMEIRA: quem entra na pilha de
 * middlewares, e em que ORDEM — porque a ordem é o comportamento. Um router antes do
 * `authMiddleware` é público; o mesmo router depois dele é privado. Um limitador antes do auth
 * chaveia por IP; depois, por usuário.
 *
 * O QUE NÃO ESTÁ AQUI, e por quê:
 *
 *   `erroGlobal`      — o Express escolhe o handler de erro pela POSIÇÃO, e ele precisa ser o
 *                       ÚLTIMO. Quem monta o Vite/estático é o bootstrap, então é lá que o
 *                       `erroGlobal` entra, depois de tudo. Montá-lo aqui o colocaria ANTES do
 *                       middleware do Vite e ele deixaria de existir na prática.
 *   Vite / estático   — dependem de `NODE_ENV` e de import dinâmico de devDependency (ver
 *                       `server.ts`); são decisão de PROCESSO, não de aplicação.
 *   `listen`          — idem. Uma função que devolve um app e não escuta é o que permite o
 *                       harness de caracterização subir o servidor de verdade numa porta efêmera.
 *
 * TUDO É LIDO NO MOMENTO DA CHAMADA, nunca no import: `authRequired()` decide metade da montagem
 * (limitadores, stub de YouTube, stub de áudio) e o harness troca `AUTH_REQUIRED` entre arquivos
 * de teste. Uma decisão congelada no import daria a montagem do primeiro teste para todos.
 */
import compression from 'compression'
import type { RequestHandler } from 'express'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'

import { audioRouter } from '../audio/loopback'
import { exigirAal2SeTiver2fa } from '../lib/aal'
import { abertura, portaDoCadastro } from '../lib/abertura'
import { authMiddleware, authRequired, verificarTokenPadrao } from '../lib/auth'
import type { UserId } from '../lib/authContext'
import { metricasHabilitadas, portaInternaDeMetricas, segredoDeOrigem } from '../lib/config'
import { exigirContaParaEscrever } from '../lib/convidado'
import { capturarAssincrono } from '../lib/erroGlobal'
import { exigirAdultoDeclarado, exigirContaLiberada } from '../lib/idade'
import { criarLimitadorDeFalhas } from '../lib/limitadorDeFalhas'
import {
  limitadorDeBuscaDeImagem,
  limitadorDeExportacao,
  limitadorDeLeitura,
  limitadorDoPlacar,
  marcarVerbos,
} from '../lib/limitesDeLeitura'
import {
  chaveDoRequest,
  createDbRateLimitStore,
  METRIC_RATELIMIT_AUTH,
  METRIC_RATELIMIT_CARO,
  METRIC_RATELIMIT_ESCRITA,
  METRIC_RATELIMIT_FLAGS,
  METRIC_RATELIMIT_TELEMETRIA,
} from '../lib/rateLimitStore'
import { requestIdMiddleware } from '../lib/requestId'
import { responderErro } from '../lib/respostaDeErro'
import { CABECALHO_DA_VERSAO, versaoDoApp } from '../lib/versao'
import { adminRouter } from '../routes/admin'
import { aiRouter } from '../routes/ai'
import { ankiRouter } from '../routes/anki'
import { asaasWebhookRouter, billingRouter } from '../routes/billing'
import { errosRouter } from '../routes/erros'
import { exercisesRouter } from '../routes/exercises'
import { criarRotaDeFlags } from '../routes/flags'
import { healthHandler, readyHandler } from '../routes/health'
import { imagesRouter } from '../routes/images'
import { importRouter } from '../routes/import'
import { meRouter } from '../routes/me'
import { metricasCapturaRouter } from '../routes/metricasCaptura'
import { metricasOfertasRouter } from '../routes/metricasOfertas'
import { metricsRouter } from '../routes/metrics'
import { rankRouter } from '../routes/rank'
import { responsavelRouter } from '../routes/responsavel'
import { sessionsRouter } from '../routes/sessions'
import { settingsRouter } from '../routes/settings'
import { tutorRouter } from '../routes/tutor'
import { vocabRouter } from '../routes/vocab'
import { diretivasDeCsp } from './csp'
import { jsonAntesDoAuth, jsonDepoisDoAuth, ROTAS_DE_CORPO_GRANDE } from './limitesDeCorpo'
import { handlerDeMetricas, middlewareDeMetricas } from './metricas'
import { exigirOrigem } from './origemProtegida'

/**
 * A ÚNICA COSTURA da montagem, e ela existe para os testes: o `authMiddleware` de produção resolve
 * o JWKS do Supabase pela REDE, e o harness de caracterização assina os seus próprios tokens com
 * uma chave gerada na hora. Sem este ponto de injeção, ou o harness voltaria a repetir a montagem
 * inteira (a duplicação que esta change apagou), ou os testes do modo público dependeriam de um
 * endpoint remoto. Em produção o parâmetro não é passado e vale o middleware real.
 */
export interface OpcoesDoApp {
  /** Substitui `app.use("/api", authMiddleware)`. Só o harness de testes usa. */
  autenticacao?: RequestHandler
  /**
   * O verificador de token da rota PÚBLICA de flags, onde o token é opcional (`server/routes/flags.ts`).
   * Mesma razão da costura de cima: o harness assina com uma chave local. Em produção, o padrão.
   */
  verificarToken?: (token: string) => Promise<UserId>
}

/**
 * O valor de `TRUST_PROXY` no tipo que o Express espera.
 *
 * `'1'` precisa virar o NÚMERO 1 (um salto), e não a string `'1'` — o Express trataria uma string
 * como lista de endereços confiáveis e `1` não é endereço nenhum, o que confiaria em ninguém com
 * cara de configurado. `'true'`/`'false'` viram booleano pela mesma razão. Qualquer outra coisa
 * segue como string: é a forma de lista (`'loopback, 10.0.0.0/8'`) que o Express já entende.
 */
function interpretarTrustProxy(valor: string): boolean | number | string {
  if (/^\d+$/.test(valor)) return Number(valor)
  if (valor === 'true') return true
  if (valor === 'false') return false
  return valor
}

export function criarApp(opcoes: OpcoesDoApp = {}): express.Express {
  const app = express()

  /**
   * TRUST PROXY — e por que ele NÃO liga sozinho (Fase 4 da rodada de saneamento).
   *
   * `app.set('trust proxy', ...)` nunca era chamado, então o Express mantinha o default `false` e
   * `req.ip` era SEMPRE o IP da conexão TCP. Duas coisas dependem dele:
   *
   *   - `chaveDoRequest` (server/lib/rateLimitStore.ts) cai no IP quando não há usuário resolvido —
   *     que é exatamente o caso das rotas públicas montadas antes do auth (webhook e ranking);
   *   - a trava de um envio por minuto por origem do ranking (server/routes/rank.ts).
   *
   * ATRÁS DE PROXY REVERSO o IP da conexão é o do proxy: todo mundo vira a MESMA chave e divide um
   * balde só. Um visitante esgota a cota do placar para o planeta inteiro — é o mesmo defeito P1-2
   * que o `keyGenerator` por tenant corrigiu nas rotas privadas, sobrevivendo nas públicas, onde
   * não existe tenant para chavear.
   *
   * O OUTRO LADO É PIOR, e por isso o default continua desligado: confiar no `X-Forwarded-For` sem
   * proxy à frente entrega a chave do balde ao cliente — qualquer um manda um header diferente por
   * requisição e o limitador deixa de existir. Um valor errado aqui não falha alto; ele desliga a
   * proteção em silêncio.
   *
   * Então é DECISÃO DE DEPLOY, declarada: `TRUST_PROXY` no inventário (server/lib/config.ts).
   * Aceita o que o Express aceita — `1` (um salto, o caso do Nginx/Caddy na frente), `true`,
   * `false`, `loopback`, ou uma lista de sub-redes confiáveis. Ausente, nada é confiado.
   */
  const trustProxy = process.env.TRUST_PROXY?.trim()
  if (trustProxy) app.set('trust proxy', interpretarTrustProxy(trustProxy))

  /* PARSER DE QUERY SIMPLES (auditoria de segurança 2026-09-26). O padrão do Express 4 é o
     "extended", que passa TODA query string pelo `qs` — antes do auth, em toda requisição — e o
     `qs` instalado tem dois avisos abertos de negação de serviço (GHSA-x5fp-wj9c-mxmx e
     GHSA-4mjr-xmp4-gh2g, `npm audit`). Nenhuma rota usa a sintaxe aninhada (`a[b]=`, `a[]=`):
     o `querystring` do Node atende tudo e ainda devolve valores repetidos como lista.
     `tests/seguranca/limites-de-leitura.test.ts` trava a escolha. */
  app.set('query parser', 'simple')

  // Rastreabilidade (auditoria Fase 5): ID de correlação por request, ANTES de tudo — assim
  // qualquer log emitido no ciclo do request pode ser amarrado a ele, inclusive falhas de
  // parsing do corpo. Volta ao cliente no header `x-request-id`.
  app.use(requestIdMiddleware)

  /* VERSÃO EM TODA RESPOSTA DA API (P0-7b). Aqui, logo depois do `requestId` e antes de qualquer
     guarda, para ir também no 401, no 429 e no 404 — o cliente compara com a versão do bundle e
     avisa quando o servidor já é outro (`src/lib/versao.ts`). Só em `/api`: o `index.html` e os
     chunks não precisam dela. Ver `server/lib/versao.ts`. */
  app.use('/api', (_req, res, next) => {
    res.setHeader(CABECALHO_DA_VERSAO, versaoDoApp())
    next()
  })

  /* ORIGEM PROTEGIDA (GAP-004): com `ORIGEM_SEGREDO`, só quem passou pelo Cloudflare entra — o acesso
     direto a `<app>.fly.dev` pularia o WAF e forjaria o `X-Forwarded-For` em que o `TRUST_PROXY`
     confia. Ver `server/http/origemProtegida.ts`. */
  const segredo = segredoDeOrigem()
  if (segredo) app.use(exigirOrigem(segredo))

  /**
   * MÉTRICAS PROMETHEUS (Fase 5) — o middleware ANTES de tudo, a rota ANTES do auth.
   *
   * A POSIÇÃO DO MIDDLEWARE é o ponto: montado aqui, ele observa TODA resposta, inclusive as que
   * nunca chegam a um router — o 401 do `authMiddleware`, o 429 dos limitadores, o 413 do teto de
   * corpo. Montado junto dos routers, ele mediria só o caminho feliz, que é o caminho que ninguém
   * precisa observar. Fica depois do `requestIdMiddleware` porque este é o contrato de
   * rastreabilidade da casa e não custa nada.
   *
   * O `if` é sobre EXISTIR, não sobre responder: com `METRICS_ENABLED` desligado (o default) nem a
   * rota nem o histograma existem, e `/metrics` responde o 404 de qualquer caminho desconhecido.
   * Uma rota sempre montada respondendo 403 confirmaria a um estranho que o servidor é
   * instrumentado — e o corpo de um scrape descreve rota, volume e taxa de erro do servidor todo.
   *
   * `/metrics` NA RAIZ, e não `/api/metrics`: essa já existe e é rota de NEGÓCIO (perfil, seeds,
   * presença — `server/routes/metrics.ts`, montada bem mais abaixo, atrás do auth). Além da
   * convenção do Prometheus, a raiz é o que mantém o scrape fora do `authMiddleware`, do balde
   * anti-força-bruta e do `writeLimiter` de `/api/*`: um scraper não tem JWT de ninguém, e um
   * scrape a cada 15 s consumindo cota de rate limit derrubaria a própria observabilidade.
   */
  if (metricasHabilitadas()) {
    app.use(middlewareDeMetricas())
    /* Sem `capturarAssincrono`: ele embrulha um ROUTER (`server/lib/erroGlobal.ts:35`), e isto é um
       handler solto no app — o mesmo caso de `/api/health` logo abaixo. O handler trata a própria
       falha e devolve 500; telemetria que derruba o request que observa é pior que telemetria
       nenhuma. */
    /* Com `METRICS_PORTA_INTERNA` o scrape mora num listener próprio (`server.ts`), e a porta
       PÚBLICA não tem `/metrics` nenhum — 404 como qualquer caminho. Menos superfície que um token. */
    if (portaInternaDeMetricas() === undefined) app.get('/metrics', handlerDeMetricas())
  }

  /* GAP-015: o teto de 5 MB valia ANTES do login. Agora o topo aceita só 100 KB, e as poucas rotas
     de corpo grande são lidas depois do `authMiddleware` — ver `server/http/limitesDeCorpo.ts`. */
  app.use(jsonAntesDoAuth())

  // C3 — COMPRESSÃO. Medido com Lighthouse sobre o build de produção: LCP entre 10,7 s e 23,3 s em
  // todas as rotas, com o limiar "ruim" do Google em 4 s. O diagnóstico não foi "o bundle é grande":
  // dos 4,1 MB de uma carga, 2,9 MB eram JSON de API — `/api/vocab` mandava 1,65 MB sozinho.
  // E o servidor não comprimia NADA. JSON é o caso em que gzip mais rende (chaves repetidas em
  // cada objeto do array); medido no teste, ~15x.
  //
  // A POSIÇÃO É PARTE DA CORREÇÃO: depois do `helmet` seria tarde para as respostas que importam
  // só se os routers viessem antes — o que manda é estar ANTES de quem escreve o corpo. Daqui ele
  // alcança tanto as rotas `/api/*` quanto os estáticos servidos mais abaixo.
  // `tests/integration/compressao-http.test.ts` trava essa ordem.
  app.use(compression())

  /**
   * Headers de segurança (achado da auditoria: nenhum header de hardening).
   *
   * A política cobre o que o app realmente usa: WASM (`wasm-unsafe-eval`), workers em blob, pesos
   * de modelo/tradução/dicionário via https, áudio e imagens em blob/data.
   *
   * EM DEV ELA PASSA A EXISTIR, EM MODO RELATÓRIO (Fase 4). Antes era `false` fora de produção, e
   * a consequência é a que se espera de um portão que só liga no fim: a primeira vez que alguém vê
   * a CSP é em produção, quando ela já está bloqueando. `reportOnly` emite
   * `Content-Security-Policy-Report-Only` com as MESMAS diretivas — o navegador reclama no console
   * e não bloqueia nada, nem o inline nem o eval que o HMR do Vite precisa.
   *
   * O ruído no console de desenvolvimento não é efeito colateral, é o produto: cada violação em dev
   * é uma que teria sido um recurso que não carrega em produção.
   */
  app.use(
    helmet({
      contentSecurityPolicy: {
        // Em dev, relatar; em produção, bloquear. As diretivas são as mesmas de propósito.
        reportOnly: process.env.NODE_ENV !== 'production',
        /* Fase 6: `connect-src` deixou de ser `https:` — a lista, e o porquê de cada host, está
           em `server/http/csp.ts`. */
        directives: { ...diretivasDeCsp() },
      },
      crossOriginEmbedderPolicy: false, // COEP é opt-in via CROSS_ORIGIN_ISOLATION (abaixo)
    }),
  )

  // Rate-limit nas rotas CARAS (proxy de IA e importação) — anti-abuso básico.
  //
  // Chaveado por TENANT e contado no BANCO (auditoria P1-2 e P1-3). O default — por IP e em
  // memória — dava dois furos medidos: atrás de proxy reverso um usuário esgotava a cota dos
  // outros, e o teto virava 60/min POR RÉPLICA. Ver server/lib/rateLimitStore.ts.
  //
  // Montado DEPOIS do authMiddleware, senão `req.userId` ainda não existe e tudo cairia no IP.
  const expensiveLimiter = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: chaveDoRequest,
    /* BALDE PROPRIO. Os dois limitadores compartilhavam a metrica, entao compartilhavam o contador:
       60 salvamentos de transcricao esgotavam a cota de IA da pessoa (achado A27). */
    store: createDbRateLimitStore(METRIC_RATELIMIT_CARO),
  })

  /**
   * Rate-limit das rotas de ESCRITA — achado F4-02 da auditoria (e D6 de deploy-readiness.md).
   *
   * O comentário que estava aqui dizia que "as rotas de CRUD local ficam livres, o teto global de
   * body já limita o resto". Isso é verdade no self-host e FALSO em público, e a auditoria mediu o
   * quanto: `express.raw` bufferiza o corpo inteiro antes do handler, cada upload de áudio no teto
   * custa **120,02 MB de RSS**, e `docker-compose.yml` limita o container a 1 GB. **Oito
   * requisições simultâneas bastam** — e nenhuma delas passava por limitador nenhum.
   *
   * O teto é mais generoso que o das rotas caras (120 vs 60/min) porque escrita de CRUD é
   * legítima e frequente: salvar transcrição, marcar review, ajustar preferência. O objetivo aqui
   * não é economizar recurso externo, é impedir que uma conta sozinha ocupe a memória do processo.
   *
   * SÓ EM MODO PÚBLICO. No self-host o dono é o único usuário e limitá-lo seria atrapalhar sem
   * proteger ninguém — a mesma lógica que já governa `authRequired()` no resto do arquivo.
   */
  const writeLimiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: chaveDoRequest,
    store: createDbRateLimitStore(METRIC_RATELIMIT_ESCRITA),
    // GET e HEAD não alocam corpo; limitá-los penalizaria a navegação sem fechar o vetor. A
    // leitura tem teto próprio, em memória: `limitadorDeLeitura` (auditoria de 2026-09-26).
    skip: (req) => req.method === 'GET' || req.method === 'HEAD',
  })
  /* A marca de verbos é o que a matriz rota × guarda lê para não contar este limitador em GET
     (`server/lib/limitesDeLeitura.ts`). Separada da declaração porque
     `tests/integration/rate-limit-escrita.test.ts` lê a forma `const writeLimiter = rateLimit({`. */
  marcarVerbos(writeLimiter, 'escrita')

  // Cross-origin isolation (opt-in via CROSS_ORIGIN_ISOLATION=1). Habilita SharedArrayBuffer →
  // WASM multithread do Whisper/opus-mt (decode local mais rápido) e um contexto de cache estável.
  // DESLIGADO por padrão: COEP pode bloquear recursos cross-origin (imagens de hover) e o embed em
  // iframe (AI Studio). Ligue em deploy no domínio próprio, onde os pesos são same-origin (self-host).
  if (process.env.CROSS_ORIGIN_ISOLATION === '1') {
    app.use((_req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
      next()
    })
  }

  // Health check (Fase 0) — status do servidor + conectividade do banco. Fica PÚBLICO:
  // registrado ANTES do authMiddleware, então nunca exige token (útil para probes de deploy).
  app.get('/api/health', healthHandler)

  /* PRONTIDÃO, separada da vivacidade (Fase 5). `health` responde "estou vivo" e quem lê decide
     REINICIAR; `ready` responde "consigo atender" e quem lê decide TIRAR DO BALANCEADOR. As duas
     ficam públicas pelo mesmo motivo — uma probe de orquestrador não tem token —, e o `ready` fica
     ao lado do `health` para as duas estarem, sempre, do mesmo lado do `authMiddleware`. O porquê
     de serem duas rotas está escrito em `server/routes/health.ts`. */
  app.get('/api/ready', readyHandler)

  // Auth (Marco 1) — montada UMA vez, após o health e antes de todo router. Cobre todos os
  // routers /api E o /api/tutor/chat (registrado mais abaixo). Modo aberto (self-host):
  // injeta LOCAL_OWNER sem token nem tela. Modo público (AUTH_REQUIRED=1): exige JWT do Supabase.
  /* E3 — o WEBHOOK de billing vem ANTES do auth de usuário: o Asaas não tem JWT de ninguém. A
     autenticação dele é própria (header asaas-access-token, comparação em tempo constante) e sem o
     segredo configurado ele recusa tudo. */
  /* E o webhook ganha TETO (01/09). Ele fica fora do `writeLimiter` de baixo por estar antes do
     auth, e ficava sem limite nenhum: cada POST faz consulta e escrita no banco, e a autenticação
     dele é um bearer estático — segredo vazado virava escrita ilimitada. A chave cai no IP
     (`chaveDoRequest` só usa o usuário quando existe), e um 429 aqui é seguro: o Asaas reentrega o
     evento que não recebeu 200, e a idempotência por id garante que a reentrega não duplica. */
  if (authRequired()) app.use('/api/billing/webhook/asaas', writeLimiter)
  app.use('/api/billing/webhook/asaas', capturarAssincrono(asaasWebhookRouter))

  /* RANKING GLOBAL — público, e por isso ANTES do auth, como o health e o webhook.
     Ele veio do Cloudflare quando a edição leve foi encerrada (07/09). O placar é anônimo por
     desenho e precisa funcionar igual com e sem conta; exigir token aqui o quebraria justamente no
     modo para o qual ele foi feito. Ganha o `writeLimiter` no modo público pela mesma razão do
     webhook: estando antes do auth, ele ficaria sem teto nenhum, e o POST escreve no banco. A trava
     de um envio por minuto por origem, dentro da rota, é sobre o placar; esta é sobre o servidor. */
  if (authRequired()) app.use('/api/rank', writeLimiter)
  /* E a LEITURA do placar (auditoria de segurança 2026-09-26): pública, vai ao banco e não tinha
     balde nenhum — o `writeLimiter` pula GET. Por IP, em memória; ver `server/lib/limitesDeLeitura.ts`. */
  if (authRequired()) app.use('/api/rank', limitadorDoPlacar())
  /* PERFIL PROTEGIDO (Fase 4 — ECA Digital): no modo público, PUBLICAR no placar exige conta de
     adulto declarado. Ler continua público. Menor — ou quem ainda não disse a idade, inclusive sem
     conta — não aparece num ranking público; o recorde dele continua salvo no aparelho. */
  if (authRequired()) {
    app.post('/api/rank/:jogo', opcoes.autenticacao ?? authMiddleware, exigirAdultoDeclarado)
  }
  app.use('/api/rank', capturarAssincrono(rankRouter))

  /* TELEMETRIA ANÔNIMA DE CAPTURA — pública, ANTES do auth, como o ranking. Ela precisa funcionar
     igual com e sem conta (quem estuda sem conta também usa a captura), e ficar antes do
     `authMiddleware` é também o que garante que ela não conhece identidade: nem com token existe
     `req.userId` aqui. O corpo tem teto de 8 KB (`ROTAS_DE_CORPO_MINIMO` em `limitesDeCorpo.ts`) e,
     no modo público, um balde PRÓPRIO por IP: o cliente manda um lote por sessão de captura, e 30
     por minuto só um laço alcança. Ver `server/routes/metricasCaptura.ts`. */
  if (authRequired()) {
    app.use(
      '/api/metricas',
      rateLimit({
        windowMs: 60_000,
        limit: 30,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: chaveDoRequest,
        store: createDbRateLimitStore(METRIC_RATELIMIT_TELEMETRIA),
      }),
    )
  }
  app.use('/api/metricas', capturarAssincrono(metricasCapturaRouter))
  /* O FUNIL DAS OFERTAS (Fase 8): o mesmo desenho — anônimo, antes do auth, corpo de 8 KB e o mesmo
     balde por IP de `/api/metricas`. Ver `server/routes/metricasOfertas.ts`. */
  app.use('/api/metricas', capturarAssincrono(metricasOfertasRouter))

  /* AS PORTAS DE EMERGÊNCIA (Fase 3): a tela de login e a de planos perguntam aqui, antes de
     haver sessão, se o cadastro e a venda estão abertos. Pública pelo mesmo motivo do health. */
  app.get('/api/abertura', abertura)

  /* FEATURE FLAGS (Fase 6b): pública, como a abertura — o cliente sem conta (servidor em memória) e
     o convidado da Fase 7 também precisam delas. Token OPCIONAL (define o plano quando vem), e só o
     resultado avaliado sai; nunca as regras. No modo público, balde PRÓPRIO por IP: o cliente lê ao
     abrir, ao focar a aba e a cada poucos minutos — 60 por minuto só um laço alcança. Ver
     `server/routes/flags.ts` e `docs/flags.md`. */
  if (authRequired()) {
    app.use(
      '/api/flags',
      rateLimit({
        windowMs: 60_000,
        limit: 60,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: chaveDoRequest,
        store: createDbRateLimitStore(METRIC_RATELIMIT_FLAGS),
      }),
    )
  }
  app.get('/api/flags', criarRotaDeFlags(opcoes.verificarToken ?? verificarTokenPadrao))

  /**
   * FORÇA BRUTA CONTRA O TOKEN — o balde que faltava (Fase 4).
   *
   * Os dois limitadores existentes são montados DEPOIS do `authMiddleware`, porque a chave deles é
   * o tenant. A consequência, lida na matriz rota × guarda: uma requisição que termina em **401
   * nunca chega a limitador nenhum**. Quem tenta adivinhar token — ou reusa um vazado contra várias
   * contas — não encontrava teto em lugar nenhum do servidor.
   *
   * Este vem ANTES do auth e conta SÓ o que falhou (401). Um usuário legítimo, com token válido,
   * nunca soma um ponto aqui, por mais que navegue — e, desde a auditoria de prontidão de
   * 2026-09-25 (fase 2 §2.5), também nunca ESCREVE nada nem é barrado por concorrência.
   *
   * POR QUE DEIXOU DE SER `rateLimit` com `skipSuccessfulRequests`: aquela opção soma toda
   * requisição na entrada e estorna na saída. Medido: com mais de 30 requisições simultâneas do
   * mesmo IP (escola/NAT), 88–100% recebiam 429 sem nenhuma falha de auth, o contador ficava preso
   * em 30 e depois disso até uma conexão sozinha levava 429 por 15 minutos — além de dobrar as
   * escritas no SQLite em todo request. O `criarLimitadorDeFalhas` só LÊ na entrada e só soma no
   * `finish` de um 401. O desenho e o preço aceito estão em `server/lib/limitadorDeFalhas.ts`.
   *
   * A chave é o IP (`chaveDoRequest` cai nele quando não há usuário resolvido, que é exatamente o
   * caso de um 401) — e é por isso que ele depende de `TRUST_PROXY` estar certo atrás de proxy.
   *
   * 30 falhas por 15 minutos: um token expirado que o cliente reenvia em algumas telas antes de
   * renovar cabe com folga; um laço de adivinhação, não. Só em modo público — no self-host o
   * `authMiddleware` injeta o dono e 401 não existe.
   */
  if (authRequired()) {
    app.use(
      '/api',
      criarLimitadorDeFalhas({
        metric: METRIC_RATELIMIT_AUTH,
        janelaMs: 15 * 60_000,
        teto: 30,
        falhou: (_req, res) => res.statusCode === 401,
        code: 'muitas_falhas_de_autenticacao',
        mensagem: 'muitas tentativas de autenticação falharam; tente de novo mais tarde',
      }),
    )
  }

  app.use('/api', opcoes.autenticacao ?? authMiddleware)

  /* `SIGNUP_ENABLED=0` (Fase 3): conta que o banco ainda não conhece é recusada em qualquer rota
     (403 `cadastro_fechado`). Ligado, este middleware não faz nem consulta. */
  app.use('/api', portaDoCadastro)

  /* Fase 7 — MODO CONVIDADO: o usuário anônimo do Supabase (`is_anonymous`) só escreve no servidor
     pela nuvem (STT, tradução, tutor — com as travas de `server/lib/convidado.ts`) e pela exclusão
     do titular. Todo o resto responde 403 `exige_conta`: o convidado guarda no aparelho. */
  app.use('/api', exigirContaParaEscrever)

  // GAP-015: o corpo grande só é lido depois de o token ser aceito (ver `limitesDeCorpo.ts`).
  app.use([...ROTAS_DE_CORPO_GRANDE], jsonDepoisDoAuth())

  /* Fase 6 — 2FA de verdade: quem ativou a verificação em duas etapas precisa de sessão AAL2 nas
     rotas de cobrança, exclusão/exportação de conta, credencial BYOK e admin (`server/lib/aal.ts`). */
  app.use('/api', exigirAal2SeTiver2fa())

  // Rate-limit por tenant — DEPOIS do auth, para a chave ser o usuário e não o IP.
  app.use(['/api/ai', '/api/import', '/api/tutor', '/api/gemini'], expensiveLimiter)

  /* MENOR DE 16 SEM RESPONSÁVEL FICA SEM NUVEM (Fase 4 — ECA Digital art. 24, LGPD art. 14): as
     rotas que guardam ou processam dados na nuvem respondem 403 `responsavel_pendente` até o
     responsável aceitar (e consentir, abaixo de 12). A conta (`/api/me`: idade, convite, exportar,
     excluir), a cobrança e o `/api/responsavel` ficam de fora: direitos do titular nunca travam. */
  app.use(
    [
      '/api/ai',
      '/api/sessions',
      '/api/import',
      '/api/vocab',
      '/api/anki',
      '/api/metrics',
      '/api/exercises',
      '/api/settings',
      '/api/images',
      '/api/tutor',
      '/api/gemini',
    ],
    exigirContaLiberada,
  )

  // F4-02: as rotas de escrita também. Só em modo público — ver `writeLimiter`.
  if (authRequired()) {
    app.use(
      // `/api/me` entrou junto com a exclusão de conta: `DELETE /api/me` apaga 17 tabelas e
      // `GET /api/me/exportar` lê a conta inteira em memória. As duas sem teto seriam o mesmo
      // vetor de F4-02 por outra porta.
      // `/api/admin` e `/api/audio` entraram na Fase 4, pela matriz rota × guarda
      // (`tests/seguranca/matriz-de-rotas.test.ts`), que leu a montagem em tempo de execução e
      // mostrou os dois como os ÚNICOS mounts privados fora de qualquer limitador.
      //
      // `/api/admin` é o caso sério: nove rotas, e quatro delas escrevem CROSS-TENANT (mudar papel
      // e status de qualquer conta, trocar o plano de qualquer conta, reprocessar evento de
      // cobrança, e a reconciliação de armazenamento, que percorre TODOS os usuários fazendo
      // `stat`/`HEAD` por arquivo). O `requireRole` diz QUEM entra, e não QUANTAS vezes: uma conta
      // admin comprometida — ou um script de operação em laço — não encontrava teto nenhum. O
      // limitador não é sobre confiança no admin, é sobre o custo por requisição.
      //
      // `/api/audio` no modo público é o stub 403 (a captura WASAPI só existe no self-host), então
      // hoje ele não tem rota de escrita para limitar. Ele entra mesmo assim para a lista voltar a
      // ser "todo mount privado", e não "os mounts de que alguém se lembrou": no dia em que a
      // captura ganhar uma variante hospedada, ela nasce com teto em vez de reabrir o furo.
      [
        '/api/sessions',
        '/api/vocab',
        '/api/settings',
        '/api/exercises',
        '/api/metrics',
        '/api/images',
        '/api/me',
        '/api/erros-do-cliente',
        '/api/billing',
        '/api/anki',
        '/api/admin',
        '/api/audio',
        '/api/responsavel',
      ],
      writeLimiter,
    )

    /* TETOS DE LEITURA (auditoria de segurança 2026-09-26). O `writeLimiter` pula GET por desenho,
       e nenhuma leitura autenticada tinha teto — inclusive as que montam a conta inteira em memória
       ou fazem chamada de saída. Os dois baldes específicos vêm ANTES do geral para o 429 deles
       sair com o código próprio. O porquê de memória × banco em cada um está em
       `server/lib/limitesDeLeitura.ts`. */
    app.use('/api/me/exportar', limitadorDeExportacao())
    app.use('/api/images/search', limitadorDeBuscaDeImagem())
    app.use('/api', limitadorDeLeitura())
  }

  // AI Gateway proxy (Fase 1) — chokepoint de segredos + guard anti-SSRF.
  app.use('/api/ai', capturarAssincrono(aiRouter))

  // Dados (Fase 2) — sessões/transcrições + vocabulário/SRS (FSRS persistido).
  app.use('/api/sessions', capturarAssincrono(sessionsRouter))
  // Importação (Fase nova) — YouTube (yt-dlp: áudio + legenda) · documento (.txt/.pdf/.docx) · link web.
  // Produz sessões no formato canônico → reaproveita Análise/vocabulário/exercícios.
  // A importação de YouTube roda yt-dlp NO SERVIDOR (capacidade local perigosa): no modo público
  // ela é bloqueada mesmo autenticado; só existe no self-host. O guard vem ANTES do router.
  if (authRequired()) {
    app.post('/api/import/youtube', (_req, res) =>
      res.status(403).json({ error: 'importação de YouTube indisponível no modo hospedado' }),
    )
  }
  app.use('/api/import', capturarAssincrono(importRouter))
  app.use('/api/vocab', capturarAssincrono(vocabRouter))
  // Acervo Anki (motor-anki-acervo) — decks/notas/ativação, escopado por userId (auth já resolvido acima).
  app.use('/api/anki', capturarAssincrono(ankiRouter))
  app.use('/api/metrics', capturarAssincrono(metricsRouter))
  app.use('/api/exercises', capturarAssincrono(exercisesRouter))
  app.use('/api/settings', capturarAssincrono(settingsRouter))
  app.use('/api/images', capturarAssincrono(imagesRouter))
  // SaaS Fatia 1a — entitlements do usuário atual (read-only; a autoridade do plano é o servidor).
  app.use('/api/me', capturarAssincrono(meRouter))
  // Fase 4 — o lado do responsável: ver e aceitar o convite do menor, listar os vinculados.
  app.use('/api/responsavel', capturarAssincrono(responsavelRouter))
  // SaaS Fatia 2 — RBAC: endpoints admin cross-tenant (cada rota gateada por requireRole internamente).
  app.use('/api/admin', capturarAssincrono(adminRouter))
  // E4 — erros do NAVEGADOR entram no mesmo funil do diário; teto por usuário dentro da rota.
  app.use('/api/erros-do-cliente', capturarAssincrono(errosRouter))
  // E3 — assinar/cancelar (atrás do auth; a PROMOÇÃO do plano é só do webhook acima).
  app.use('/api/billing', capturarAssincrono(billingRouter))
  // Áudio do sistema via WASAPI loopback do PRÓPRIO servidor local (Windows) — a rota sem
  // fricção para capturar o que o computador toca; o navegador só consome o PCM.
  // Capacidade local: no modo público (AUTH_REQUIRED) ela some (403), mesmo autenticado.
  if (authRequired()) {
    app.use('/api/audio', (_req, res) =>
      res.status(403).json({ error: 'captura de áudio do sistema indisponível no modo hospedado' }),
    )
  } else {
    app.use('/api/audio', capturarAssincrono(audioRouter))
  }

  // Tutor (cascata Groq → OpenRouter; Ollama só no self-host). `/api/gemini` é ALIAS TEMPORÁRIO:
  // o cliente em cache de antes da Fase 2 do lançamento ainda chama `/api/gemini/chat`, e o corpo
  // antigo (com `systemInstruction`) é aceito — o system dele é descartado. Remover o alias quando
  // o service worker/cache do cliente antigo tiver expirado.
  app.use('/api/tutor', capturarAssincrono(tutorRouter))
  app.use('/api/gemini', capturarAssincrono(tutorRouter))

  /* 404 DA API — o ÚLTIMO de `/api`, e antes do fallback da SPA (P0-7a). Em produção o `montarSpa`
     termina num `app.get('*')` que devolve o `index.html` com 200 para qualquer caminho: sem este
     handler, `/api/<inexistente>` respondia HTML com 200, e um cliente de versão antiga chamando
     uma rota removida estourava no `res.json()`, longe da causa. Qualquer método, no envelope de
     erro da casa. Fica DEPOIS do `authMiddleware` (montado acima em `/api`): no modo público, sem
     token, a resposta continua 401 — dizer "esta rota não existe" a um estranho é mapa da API. */
  app.use('/api', (_req, res) => {
    responderErro(res, 404, 'rota inexistente', 'rota_inexistente')
  })

  return app
}
