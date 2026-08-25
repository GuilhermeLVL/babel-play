import express from "express";
import path from "path";
import dotenv from "dotenv";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import { healthHandler } from "./server/routes/health";
import { aiRouter } from "./server/routes/ai";
import { sessionsRouter } from "./server/routes/sessions";
import { importRouter } from "./server/routes/import";
import { vocabRouter } from "./server/routes/vocab";
import { metricsRouter } from "./server/routes/metrics";
import { exercisesRouter } from "./server/routes/exercises";
import { settingsRouter } from "./server/routes/settings";
import { imagesRouter } from "./server/routes/images";
import { meRouter } from "./server/routes/me";
import { adminRouter } from "./server/routes/admin";
import { audioRouter } from "./server/audio/loopback";
import { prepareLlmRequest } from "./server/ai/llmRequest";
import { seedIfEmpty } from "./server/db/seed";
import { dbReady } from "./server/db/db";
import { createDbRateLimitStore, chaveDoRequest } from "./server/lib/rateLimitStore";
import { erroGlobal, capturarAssincrono } from "./server/lib/erroGlobal";
import { registrarFalhaDeBoot } from "./server/lib/bootStatus";
import { verificarConfiguracaoNoBoot } from "./server/lib/config";
import { mecanismoDe } from "./server/lib/auth";
import { authMiddleware, authRequired } from "./server/lib/auth";
import { requestIdMiddleware } from "./server/lib/requestId";
import { hasEntitlement } from "./server/lib/entitlements";
import { reserveManagedCall, refundManagedCall } from "./server/lib/usageQuota";

dotenv.config();

const app = express();

// Rastreabilidade (auditoria Fase 5): ID de correlação por request, ANTES de tudo — assim
// qualquer log emitido no ciclo do request pode ser amarrado a ele, inclusive falhas de
// parsing do corpo. Volta ao cliente no header `x-request-id`.
app.use(requestIdMiddleware);

app.use(express.json({ limit: "5mb" }));

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
app.use(compression());

// Headers de segurança (achado da auditoria: nenhum header de hardening).
// CSP só em PRODUÇÃO: em dev o Vite/HMR precisa de inline/eval e a CSP viraria ruído.
// A política cobre o que o app realmente usa: WASM (wasm-unsafe-eval), workers em blob,
// pesos de modelo/tradução/dicionário via https, áudio/imagens em blob/data.
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'wasm-unsafe-eval'", "blob:"],
      workerSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "https:", "blob:", "data:"],
      imgSrc: ["'self'", "https:", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:", "data:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false, // COEP é opt-in via CROSS_ORIGIN_ISOLATION (abaixo)
}));

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
  store: createDbRateLimitStore(),
});

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
  store: createDbRateLimitStore(),
  // GET e HEAD não alocam corpo; limitá-los penalizaria a navegação sem fechar o vetor.
  skip: (req) => req.method === "GET" || req.method === "HEAD",
});

// Cross-origin isolation (opt-in via CROSS_ORIGIN_ISOLATION=1). Habilita SharedArrayBuffer →
// WASM multithread do Whisper/opus-mt (decode local mais rápido) e um contexto de cache estável.
// DESLIGADO por padrão: COEP pode bloquear recursos cross-origin (imagens de hover) e o embed em
// iframe (AI Studio). Ligue em deploy no domínio próprio, onde os pesos são same-origin (self-host).
if (process.env.CROSS_ORIGIN_ISOLATION === "1") {
  app.use((_req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
    next();
  });
}

// Health check (Fase 0) — status do servidor + conectividade do banco. Fica PÚBLICO:
// registrado ANTES do authMiddleware, então nunca exige token (útil para probes de deploy).
app.get("/api/health", healthHandler);

// Auth (Marco 1) — montada UMA vez, após o health e antes de todo router. Cobre todos os
// routers /api E o /api/gemini/chat inline (registrado mais abaixo). Modo aberto (self-host):
// injeta LOCAL_OWNER sem token nem tela. Modo público (AUTH_REQUIRED=1): exige JWT do Supabase.
app.use("/api", authMiddleware);

// Rate-limit por tenant — DEPOIS do auth, para a chave ser o usuário e não o IP.
app.use(["/api/ai", "/api/import", "/api/gemini"], expensiveLimiter);

// F4-02: as rotas de escrita também. Só em modo público — ver `writeLimiter`.
if (authRequired()) {
  app.use(
    // `/api/me` entrou junto com a exclusão de conta: `DELETE /api/me` apaga 17 tabelas e
    // `GET /api/me/exportar` lê a conta inteira em memória. As duas sem teto seriam o mesmo
    // vetor de F4-02 por outra porta.
    ["/api/sessions", "/api/vocab", "/api/settings", "/api/exercises", "/api/metrics", "/api/images", "/api/me"],
    writeLimiter,
  );
}

// AI Gateway proxy (Fase 1) — chokepoint de segredos + guard anti-SSRF.
app.use("/api/ai", capturarAssincrono(aiRouter));

// Dados (Fase 2) — sessões/transcrições + vocabulário/SRS (FSRS persistido).
app.use("/api/sessions", capturarAssincrono(sessionsRouter));
// Importação (Fase nova) — YouTube (yt-dlp: áudio + legenda) · documento (.txt/.pdf/.docx) · link web.
// Produz sessões no formato canônico → reaproveita Análise/vocabulário/exercícios.
// A importação de YouTube roda yt-dlp NO SERVIDOR (capacidade local perigosa): no modo público
// ela é bloqueada mesmo autenticado; só existe no self-host. O guard vem ANTES do router.
if (authRequired()) {
  app.post("/api/import/youtube", (_req, res) =>
    res.status(403).json({ error: "importação de YouTube indisponível no modo hospedado" }));
}
app.use("/api/import", capturarAssincrono(importRouter));
app.use("/api/vocab", capturarAssincrono(vocabRouter));
app.use("/api/metrics", capturarAssincrono(metricsRouter));
app.use("/api/exercises", capturarAssincrono(exercisesRouter));
app.use("/api/settings", capturarAssincrono(settingsRouter));
app.use("/api/images", capturarAssincrono(imagesRouter));
// SaaS Fatia 1a — entitlements do usuário atual (read-only; a autoridade do plano é o servidor).
app.use("/api/me", capturarAssincrono(meRouter));
// SaaS Fatia 2 — RBAC: endpoints admin cross-tenant (cada rota gateada por requireRole internamente).
app.use("/api/admin", capturarAssincrono(adminRouter));
// Áudio do sistema via WASAPI loopback do PRÓPRIO servidor local (Windows) — a rota sem
// fricção para capturar o que o computador toca; o navegador só consome o PCM.
// Capacidade local: no modo público (AUTH_REQUIRED) ela some (403), mesmo autenticado.
if (authRequired()) {
  app.use("/api/audio", (_req, res) =>
    res.status(403).json({ error: "captura de áudio do sistema indisponível no modo hospedado" }));
} else {
  app.use("/api/audio", capturarAssincrono(audioRouter));
}

// A mensagem de erro de EADDRINUSE manda "definir PORT no .env" — então honre-a.
const PORT = Number(process.env.PORT) || 3000;

// Initialize Gemini Client
let ai: GoogleGenAI | null = null;
const apiKey = process.env.GEMINI_API_KEY;

if (apiKey && apiKey !== "MY_GEMINI_API_KEY") {
  try {
    ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
        // P1-10: era a ÚNICA chamada externa do servidor sem timeout algum — sem `signal` e
        // sem `httpOptions.timeout`, uma requisição pendurada segurava um slot do event loop
        // para sempre. 30s alinha com o caminho do Groq (tryGroqChat).
        timeout: 30_000,
      }
    });
    console.log("Gemini client initialized successfully.");
  } catch (err) {
    console.error("Error initializing Gemini client:", err);
  }
} else {
  console.log("Nenhuma chave de LLM em nuvem — usando LLM local (Ollama) quando disponível.");
}

// Local LLM via Ollama (endpoint compatível com a API da OpenAI).
// Honesto: se o Ollama não estiver acessível, avisamos o cliente em vez de
// fabricar conteúdo canned.
const OLLAMA_URL = "http://localhost:11434/v1/chat/completions";

async function tryOllamaChat(
  messages: Array<{ role: string; content: string }>,
  systemInstruction?: string
): Promise<string | null> {
  const chatMessages = [
    { role: "system", content: systemInstruction || "" },
    ...messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || "llama3.2",
        messages: chatMessages,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const data: any = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content : null;
  } catch (err) {
    console.warn("LLM local (Ollama) indisponível:", (err as Error)?.message || err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Groq (nuvem, OpenAI-compatible) — rápido e não depende de GPU local.
// Preferido para o iChat/tutor quando há GROQ_API_KEY no .env.
const GROQ_CHAT_URL =
  (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "") +
  "/chat/completions";
const GROQ_LLM_MODEL =
  process.env.GROQ_LLM_MODEL || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

async function tryGroqChat(
  messages: Array<{ role: string; content: string }>,
  systemInstruction?: string,
  opts?: { temperature?: number; maxTokens?: number }
): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const chatMessages = [
    { role: "system", content: systemInstruction || "" },
    ...messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  ];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: GROQ_LLM_MODEL,
        messages: chatMessages,
        stream: false,
        temperature: typeof opts?.temperature === "number" ? opts.temperature : 0.7,
        ...(opts?.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn("Groq HTTP", response.status, (await response.text()).slice(0, 160));
      return null;
    }
    const data: any = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === "string" && content.trim() ? content : null;
  } catch (err) {
    console.warn("LLM Groq indisponível:", (err as Error)?.message || err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Full-Stack API Route for LLM Interactions (Groq em nuvem → Gemini → Ollama local)
app.post("/api/gemini/chat", async (req, res) => {
  // Reserva pendente de quota gerenciada — estornada em todo caminho que não entrega
  // resposta da NUVEM (degradação para Ollama inclusive: o local não gasta a chave do dono).
  let reservaPendente = false;
  try {
    // S-06: validação + teto de tamanho do prompt e clamp de max_tokens no servidor.
    const prep = prepareLlmRequest(req.body);
    if (!prep.ok) {
      return res.status(prep.status).json({ error: prep.error });
    }
    const { messages, systemInstruction } = prep;
    const llmOpts = { temperature: prep.temperature, maxTokens: prep.maxTokens };

    // SaaS Fatia 1b — IA de nuvem GERENCIADA (Groq/Gemini) só para quem tem o entitlement. Sem ele,
    // o handler PULA a nuvem e usa o LLM local (Ollama) — não é 402 seco, porque o local é grátis e
    // um caminho válido (o free ainda conversa via Ollama; só não gasta a chave do dono).
    // Gerenciado só se o plano cobre E a reserva de quota coube; over-quota degrada para o local.
    // A reserva vem ANTES da chamada (P0-1) e cobre a tentativa de nuvem — Groq ou Gemini.
    const managed = (await hasEntitlement(req.userId, "managedCloudLlm"))
      && (reservaPendente = await reserveManagedCall(req.userId));

    // Preferência: Groq (nuvem) quando há GROQ_API_KEY e o plano cobre. Rápido e sem GPU local.
    const groqText = managed ? await tryGroqChat(messages, systemInstruction, llmOpts) : null;
    if (groqText) {
      reservaPendente = false; // consumada
      return res.json({ text: groqText, engine: "groq", local: false });
    }

    // Sem nuvem gerenciada (plano não cobre, ou sem Gemini, ou o Groq falhou): LLM local (Ollama).
    if (!managed || !ai) {
      const localText = await tryOllamaChat(messages, systemInstruction);
      if (localText) {
        return res.json({ text: localText, engine: "ollama", local: true });
      }
      // Honesto: sem modelo local. `reason` diz se falta plano Pro (nuvem) ou um modelo local.
      return res.json({ text: null, unavailable: true, reason: managed ? "no_local_model" : "managed_requires_pro" });
    }

    // Map conversation to GoogleGenAI format
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents,
      config: {
        systemInstruction,
        // M-02: o caminho Gemini ignorava os parâmetros do cliente (fixava 0.7, sem teto de saída).
        // Agora respeita temperature e o max_tokens JÁ CLAMPADO por prepareLlmRequest.
        temperature: prep.temperature ?? 0.7,
        maxOutputTokens: prep.maxTokens,
      },
    });

    // M-02: toda resposta agora carrega `engine` (o caminho Gemini não carregava — o cliente não
    // conseguia saber qual provedor respondeu).
    reservaPendente = false; // consumada pelo Gemini
    res.json({ text: response.text || "No response received from the model.", engine: "gemini", local: false });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    // Erro na nuvem: tentamos o LLM local como alternativa honesta.
    //
    // P2-2: aqui ia `req.body.messages` CRU, pulando `prepareLlmRequest` — o teto de 100k
    // chars (server/ai/llmRequest.ts) não se aplicava neste ramo, então um prompt gigante
    // que fosse rejeitado no caminho normal entrava pelo caminho de erro. Revalidamos.
    const prepFallback = prepareLlmRequest(req.body);
    if (!prepFallback.ok) {
      return res.status(prepFallback.status).json({ error: prepFallback.error });
    }
    const localText = await tryOllamaChat(prepFallback.messages, prepFallback.systemInstruction);
    if (localText) {
      return res.json({ text: localText, engine: "ollama", local: true });
    }
    res.json({ text: null, unavailable: true, reason: "no_local_model" });
  } finally {
    // Degradou para Ollama, falhou, ou nem chegou à nuvem: a reserva não virou chamada paga.
    if (reservaPendente) await refundManagedCall(req.userId);
  }
});

// Configure Vite middleware in development or serve static assets in production
/**
 * `prepararDados: false` é o modo WORKER do cluster: migrations, seed e backfill já foram feitos
 * pelo primário antes de forkar. Repetir não seria só desperdício — seria exatamente a contenção
 * de lock no boot que o modo cluster existe para eliminar.
 */
/**
 * Onde é seguro escrever — a mesma pasta em que o banco já vive.
 *
 * `DATA_DIR` não existe neste deploy: o compose passa `DATABASE_URL=file:/data/babel.db` e
 * `AUDIO_DIR=/data/audio`, e é `/data` que está montado como volume gravável. Deduzir o diretório
 * do próprio banco é o sinal mais confiável disponível — se o banco consegue escrever ali, o
 * diário também consegue, e os dois viajam juntos quando alguém move o volume.
 */
function diretorioGravavel(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("file:")) return path.dirname(url.slice("file:".length));
  if (process.env.AUDIO_DIR) return path.dirname(process.env.AUDIO_DIR);
  return "data";
}

async function startServer({ prepararDados = true } = {}) {
  /*
   * DIÁRIO DE ERROS — achado F5-04, a parte que não depende de escolher fornecedor.
   *
   * Ligado ANTES de tudo, inclusive das migrations: se o boot falhar, é justamente o erro do boot
   * que precisa sobreviver. O stdout de um container é volátil — `docker logs` guarda o que a
   * política do daemon deixar e um restart leva o resto — então "ninguém lê o stdout" muitas vezes
   * é, mais precisamente, "já não há stdout para ler".
   *
   * `ERROS_DIR=off` desliga, para quem tiver um coletor de verdade e não quiser a cópia em disco.
   * O que isto NÃO faz continua valendo e está escrito em `diarioDeErros.ts`: não alerta ninguém.
   */
  const dirDeErros = process.env.ERROS_DIR ?? path.join(diretorioGravavel(), "erros");
  if (dirDeErros !== "off") {
    try {
      const { diarioEmArquivo } = await import("./server/lib/diarioDeErros");
      const { registrarSinkDeErro } = await import("./server/lib/logger");
      registrarSinkDeErro(diarioEmArquivo({ dir: dirDeErros }));
      console.log(`[erros] diário em ${dirDeErros}`);
    } catch (err) {
      /*
       * Degradação, não falha: o servidor serve sem o diário. Mas a mensagem precisa nomear o
       * caminho, e essa lição foi cara — a primeira versão usava `DATA_DIR || "data"`, um caminho
       * RELATIVO ao cwd, e dentro do container o `/app` pertence ao root enquanto o processo roda
       * como `node`. O diário morria com EACCES exatamente no ambiente para o qual foi escrito, e
       * a mensagem não dizia onde ele tinha tentado escrever. Uma observabilidade que se desliga
       * em produção e não conta onde falhou é pior do que não tê-la: dá a sensação de cobertura.
       */
      console.error(`[erros] diário em disco INDISPONÍVEL em ${dirDeErros}; seguindo só com stdout:`, err);
    }
  }

  /*
   * CONFERÊNCIA DA CONFIGURAÇÃO — achado F14-02.
   *
   * Roda ANTES do banco de propósito: é a checagem mais barata que existe e a que evita o pior
   * modo de falha do modo público — subir "saudável" sem `SUPABASE_SERVICE_ROLE_KEY` e só
   * descobrir no meio de uma exclusão de conta que o vínculo de login não pode ser desfeito.
   *
   * NÃO derruba o processo. Uma réplica que não sobe não diz nada a ninguém e o orquestrador só vê
   * reinício em laço; registrando, `/api/health` responde `degraded` com o NOME do passo, que é o
   * que uma probe enxerga. Mesma decisão do P2-5.
   */
  const configuracao = verificarConfiguracaoNoBoot();
  /*
   * DIZER qual mecanismo autentica — achado F15-01. A precedencia do `createVerifier` prefere o
   * segredo compartilhado ao JWKS assimetrico quando as duas variaveis existem, e ate aqui isso era
   * invisivel: o operador nao tinha como saber que o material assimetrico estava presente e inerte.
   */
  if (configuracao.modoPublico) {
    const mecanismo = mecanismoDe();
    console.log(`[auth] verificacao de token por: ${mecanismo}`);
    if (mecanismo === "hs256-compartilhado" && process.env.SUPABASE_URL) {
      console.warn("[auth] AVISO: SUPABASE_JWT_SECRET tem precedencia sobre o JWKS assimetrico — o JWKS esta configurado e NAO esta em uso (F15-01).");
    }
  }
  if (configuracao.ok) {
    const aviso = configuracao.faltando.length ? ` (${configuracao.faltando.length} de capacidade ausente(s): ${configuracao.faltando.join(", ")})` : "";
    console.log(`[config] ${configuracao.declaradas} variáveis declaradas; nenhuma CRÍTICA ausente (modo ${configuracao.modoPublico ? "público" : "self-host"})${aviso}.`);
  } else {
    console.error(`[config] CRÍTICAS ausentes no modo ${configuracao.modoPublico ? "público" : "self-host"}: ${configuracao.faltandoCriticas.join(", ")} — /api/health responderá degraded.`);
  }

  // P0-2: garante que WAL/busy_timeout já valem ANTES de qualquer escrita (inclusive o seed).
  await dbReady;

  // Migrations ANTES de tudo. Sem isto, um deploy limpo entra em crash-loop: o volume começa
  // vazio e o `seedIfEmpty()` abaixo estoura com "no such table: sessions". Idempotente —
  // num banco já migrado não faz nada.
  //
  // Falha aqui é FATAL de propósito: sem schema o app não serve nada, e um crash-loop com
  // mensagem clara é melhor sinal do que subir e devolver 500 em toda rota. O restart do
  // orquestrador também resolve sozinho a contenção transitória de lock entre réplicas.
  if (prepararDados) {
    try {
      const { aplicarMigrations } = await import("./server/db/manutencao");
      await aplicarMigrations();
    } catch (err) {
      console.error("[db] FALHA AO APLICAR MIGRATIONS — o app não pode servir sem schema:", err);
      process.exit(1);
    }

    await seedIfEmpty();
  }
  if (prepararDados) {
    // M-04: migra cartões Leitner → FSRS no boot (idempotente; nas próximas execuções migra 0).
    try {
      // P3-1: a migração vive em `db/manutencao` (atravessa tenants), não no barrel das rotas.
      const { migrarLeitnerParaFsrs } = await import("./server/db/manutencao");
      const migrados = await migrarLeitnerParaFsrs();
      if (migrados > 0) console.log(`[db] ${migrados} cartão(ões) Leitner migrado(s) para FSRS (M-04)`);
    } catch (err) {
      // P2-5: seguir subindo é a escolha certa (a migração é idempotente e roda de novo no
      // próximo boot), mas o /api/health precisa DENUNCIAR que os dados estão incompletos.
      console.warn("[db] migração Leitner→FSRS falhou (segue sem migrar):", (err as Error)?.message || err);
      registrarFalhaDeBoot("migracao-fsrs", err);
    }
    // Marco 1: carimba linhas legadas (user_id NULL) com o dono local, para o scoping por usuário
    // (Commits 3+) não esconder os dados atuais. Idempotente (nas próximas execuções carimba 0).
    try {
      const { backfillNullOwner } = await import("./server/db/repositories/tenancy");
      const { LOCAL_OWNER } = await import("./server/lib/authContext");
      const carimbados = await backfillNullOwner(LOCAL_OWNER);
      if (carimbados > 0) console.log(`[db] ${carimbados} linha(s) legada(s) atribuída(s) ao dono local (Marco 1)`);
    } catch (err) {
      // P2-5: linhas com user_id NULL continuam invisíveis ao dono — isso PRECISA aparecer.
      console.warn("[db] backfill de tenancy falhou (segue sem carimbar):", (err as Error)?.message || err);
      registrarFalhaDeBoot("backfill-tenancy", err);
    }
  }
  if (process.env.NODE_ENV !== "production") {
    // Import DINÂMICO, e não estático no topo: `vite` é devDependency, e o esbuild com
    // `--packages=external` transformava o import estático num `require("vite")` no TOPO do
    // bundle. Resultado: a imagem de produção (`npm ci --omit=dev`) quebrava no boot com
    // "Cannot find module 'vite'" — o servidor exigia em runtime algo que nunca usa em
    // produção. Aqui o require só acontece dentro deste ramo, que produção nunca executa.
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev server mounted as middleware.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving static assets from dist/ in production.");
  }

  /*
   * ERROR HANDLER GLOBAL — achado D7. Montado por ÚLTIMO, de propósito: o Express escolhe o
   * handler de erro pela POSIÇÃO, e qualquer coisa registrada depois dele nunca seria alcançada.
   *
   * Sem isto, uma rejeição de handler `async` no Express 4 não vira 500 — vira request
   * PENDURADO. E há rotas sem `try/catch` (`sessions.ts:151`, todo o `admin.ts`).
   */
  app.use(erroGlobal);

  // BIND SEGURO (achado da auditoria): por padrão só 127.0.0.1 — sem auth em nenhuma rota,
  // escutar em 0.0.0.0 entregava TODAS as rotas (inclusive o stream do áudio do sistema e as
  // credenciais) para qualquer dispositivo da rede local. Expor na LAN é decisão explícita:
  // HOST=0.0.0.0 no .env — e o log avisa o que isso significa.
  const HOST = process.env.HOST || "127.0.0.1";
  if (HOST !== "127.0.0.1" && HOST !== "localhost" && !authRequired()) {
    // O aviso só vale quando a auth está DESLIGADA. Antes ele era incondicional e dizia
    // "EXPOSTO ... SEM autenticação" mesmo com AUTH_REQUIRED=1 — ou seja, todo container
    // (que PRECISA de HOST=0.0.0.0 para receber tráfego) imprimia, a cada boot, uma
    // afirmação falsa sobre a própria postura de segurança.
    console.warn(`⚠  HOST=${HOST}: o app está EXPOSTO à rede local SEM autenticação —`);
    console.warn("   qualquer dispositivo da rede acessa suas sessões, credenciais e o áudio do sistema.");
  }
  // Marco 1: aviso do modo de auth. Desligada = todo request é o dono local (sem login),
  // correto para uso local/self-host. Para deploy PÚBLICO, defina AUTH_REQUIRED=1.
  if (!authRequired()) {
    console.warn("⚠  AUTH_REQUIRED desligada: sem login; todo request é tratado como o dono local.");
    console.warn("   Correto para local/self-host. Deploy público EXIGE AUTH_REQUIRED=1.");
  }
  const server = app.listen(PORT, HOST, () => {
    // Anuncia LOCALHOST, não 0.0.0.0. Só localhost/127.0.0.1/HTTPS são "contexto seguro", e o
    // Cache Storage — onde o Whisper/opus-mt guardam os pesos baixados — SÓ existe em contexto
    // seguro. Abrir por 0.0.0.0 ou por um IP de rede desliga o cache e o modelo re-baixa a cada
    // captura. Além disso, o cache é particionado por PORTA: mantenha a porta fixa (PORT no .env)
    // para não re-baixar o modelo a cada troca de porta.
    console.log(`Babel Play rodando em  ->  http://localhost:${PORT}`);
    console.log(`   (abra sempre por http://localhost:${PORT} — por 0.0.0.0/IP o modelo local re-baixa toda vez)`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\n⚠  A porta ${PORT} já está em uso — outro servidor está rodando.`);
      console.error(`   Defina uma porta FIXA no .env (ex.: PORT=3100) e use sempre a mesma:`);
      console.error(`   o cache do modelo local é POR PORTA — trocar de porta faz o navegador`);
      console.error(`   re-baixar o Whisper/opus-mt do zero.\n`);
    } else {
      console.error("Erro ao iniciar o servidor:", err);
    }
    process.exit(1);
  });
}

/**
 * MODO CLUSTER (F6-01) — opt-in por `CLUSTER_WORKERS`.
 *
 * A carga mediu vazão PLANA (~100 req/s) e latência crescendo linear com a concorrência a partir
 * de 2 VUs: saturação de processo único, não consulta lenta (sem concorrência, `/api/sessions`
 * responde em 7 ms). Índice não resolve fila; mais processo resolve.
 *
 * As três barreiras que impediam isso já caíram e estão medidas: WAL + `busy_timeout`
 * (0% de falha em 14.220 escritas com 3 processos), rate limit contado no banco
 * (`rateLimitStore.ts`, `localKeys: false`) e áudio fora do `cwd` (`AUDIO_DIR`).
 *
 * Só o primário migra: os workers são forkados DEPOIS de `startServer()` do primário terminar, o
 * que elimina a contenção de lock no boot que hoje depende de restart do orquestrador.
 */
async function iniciar() {
  const pedidos = Number(process.env.CLUSTER_WORKERS || 0);
  if (!Number.isFinite(pedidos) || pedidos <= 1) {
    await startServer();
    return;
  }

  const { default: cluster } = await import("node:cluster");
  const { availableParallelism } = await import("node:os");
  const workers = Math.min(pedidos, availableParallelism());

  if (cluster.isPrimary) {
    /*
     * WAL É PRÉ-REQUISITO, e a falha dele é silenciosa por natureza.
     *
     * `PRAGMA journal_mode = WAL` não lança quando não pega: sobre NFS/SMB ele devolve 'delete' e
     * segue. Medido sem WAL: 21,5% das escritas falhando com 2 processos, 28,9% com 3. Em modo
     * cluster isso significaria N processos subindo "saudáveis" e perdendo um quarto das escritas
     * com o aviso perdido no log — então aqui é falha dura, não aviso.
     */
    const { db } = await import("./server/db/db");
    const { sql } = await import("drizzle-orm");
    const modo = String(Object.values((await db.get(sql`PRAGMA journal_mode`)) ?? {})[0] ?? "").toLowerCase();
    if (modo !== "wal") {
      console.error(`[cluster] ABORTADO: journal_mode é '${modo}', não 'wal'.`);
      console.error("   Sem WAL, múltiplos processos perdem ~25% das escritas. WAL exige memória");
      console.error("   compartilhada e NÃO funciona sobre NFS/SMB — use volume local, ou rode com");
      console.error("   um processo só (sem CLUSTER_WORKERS).");
      process.exit(1);
    }

    /*
     * O primário sobe o servidor INTEIRO primeiro — é isso que garante migrations aplicadas
     * uma vez só, antes de qualquer worker existir. Ele também atende, então não há processo
     * ocioso.
     */
    await startServer();
    for (let i = 1; i < workers; i++) cluster.fork();
    cluster.on("exit", (worker, code, signal) => {
      console.error(`[cluster] worker ${worker.process.pid} saiu (${signal || code}); refazendo`);
      cluster.fork();
    });
    console.log(`[cluster] ${workers} processos (1 primário + ${workers - 1} workers)`);
    return;
  }

  /*
   * Worker: NÃO migra e NÃO faz seed — o primário já fez, e repetir seria contenção de lock
   * pelo caminho que o cluster existe para eliminar. `cluster` compartilha o listener, então
   * o `app.listen` na mesma porta é o comportamento correto, não um EADDRINUSE.
   */
  await startServer({ prepararDados: false });
}

iniciar();
