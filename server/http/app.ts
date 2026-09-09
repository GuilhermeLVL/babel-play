/**
 * A MONTAGEM DO SERVIDOR — e só ela.
 *
 * O `server.ts` tinha 703 linhas e misturava três coisas: montar o Express, servir uma rota de
 * negócio inteira (`/api/gemini/chat`) e subir o processo (migrations, Vite, cluster, `listen`).
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
import { authMiddleware, authRequired } from '../lib/auth'
import { metricasHabilitadas } from '../lib/config'
import { capturarAssincrono } from '../lib/erroGlobal'
import {
  chaveDoRequest,
  createDbRateLimitStore,
  METRIC_RATELIMIT_AUTH,
  METRIC_RATELIMIT_CARO,
  METRIC_RATELIMIT_ESCRITA,
} from '../lib/rateLimitStore'
import { requestIdMiddleware } from '../lib/requestId'
import { adminRouter } from '../routes/admin'
import { aiRouter } from '../routes/ai'
import { ankiRouter } from '../routes/anki'
import { asaasWebhookRouter, billingRouter } from '../routes/billing'
import { errosRouter } from '../routes/erros'
import { exercisesRouter } from '../routes/exercises'
import { geminiRouter, iniciarClienteGemini } from '../routes/gemini'
import { healthHandler, readyHandler } from '../routes/health'
import { imagesRouter } from '../routes/images'
import { importRouter } from '../routes/import'
import { meRouter } from '../routes/me'
import { metricsRouter } from '../routes/metrics'
import { rankRouter } from '../routes/rank'
import { sessionsRouter } from '../routes/sessions'
import { settingsRouter } from '../routes/settings'
import { vocabRouter } from '../routes/vocab'
import { handlerDeMetricas, middlewareDeMetricas } from './metricas'

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

  // Rastreabilidade (auditoria Fase 5): ID de correlação por request, ANTES de tudo — assim
  // qualquer log emitido no ciclo do request pode ser amarrado a ele, inclusive falhas de
  // parsing do corpo. Volta ao cliente no header `x-request-id`.
  app.use(requestIdMiddleware)

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
    app.get('/metrics', handlerDeMetricas())
  }

  app.use(express.json({ limit: '5mb' }))

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
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'wasm-unsafe-eval'", 'blob:'],
          workerSrc: ["'self'", 'blob:'],
          connectSrc: ["'self'", 'https:', 'blob:', 'data:'],
          imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:', 'data:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
        },
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
    // GET e HEAD não alocam corpo; limitá-los penalizaria a navegação sem fechar o vetor.
    skip: (req) => req.method === 'GET' || req.method === 'HEAD',
  })

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
  // routers /api E o /api/gemini/chat (registrado mais abaixo). Modo aberto (self-host):
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
  app.use('/api/rank', capturarAssincrono(rankRouter))

  /**
   * FORÇA BRUTA CONTRA O TOKEN — o balde que faltava (Fase 4).
   *
   * Os dois limitadores existentes são montados DEPOIS do `authMiddleware`, porque a chave deles é
   * o tenant. A consequência, lida na matriz rota × guarda: uma requisição que termina em **401
   * nunca chega a limitador nenhum**. Quem tenta adivinhar token — ou reusa um vazado contra várias
   * contas — não encontrava teto em lugar nenhum do servidor.
   *
   * Este vem ANTES do auth e conta SÓ o que falhou: `requestWasSuccessful` marca como sucesso
   * tudo que não é 401, e `skipSuccessfulRequests` faz o contador ignorar os sucessos. Um usuário
   * legítimo, com token válido, nunca soma um ponto aqui, por mais que navegue.
   *
   * A chave é o IP (`chaveDoRequest` cai nele quando não há usuário resolvido, que é exatamente o
   * caso de um 401) — e é por isso que ele depende de `TRUST_PROXY` estar certo atrás de proxy.
   *
   * 30 por 15 minutos: um token expirado que o cliente reenvia em algumas telas antes de renovar
   * cabe com folga; um laço de adivinhação, não. Só em modo público — no self-host o
   * `authMiddleware` injeta o dono e 401 não existe.
   */
  if (authRequired()) {
    app.use(
      '/api',
      rateLimit({
        windowMs: 15 * 60_000,
        limit: 30,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: chaveDoRequest,
        store: createDbRateLimitStore(METRIC_RATELIMIT_AUTH),
        skipSuccessfulRequests: true,
        requestWasSuccessful: (_req, res) => res.statusCode !== 401,
      }),
    )
  }

  app.use('/api', opcoes.autenticacao ?? authMiddleware)

  // Rate-limit por tenant — DEPOIS do auth, para a chave ser o usuário e não o IP.
  app.use(['/api/ai', '/api/import', '/api/gemini'], expensiveLimiter)

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
      ],
      writeLimiter,
    )
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

  // Tutor de chat (cascata Groq → Gemini → Ollama). O cliente do Gemini é resolvido AQUI, e não no
  // import do módulo: o `.env` do bootstrap já foi carregado quando `criarApp()` roda — é o mesmo
  // ponto do boot em que a inicialização acontecia quando esta rota morava no `server.ts`.
  iniciarClienteGemini()
  app.use('/api/gemini', capturarAssincrono(geminiRouter))

  return app
}
