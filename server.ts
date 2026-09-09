/**
 * BOOTSTRAP DO PROCESSO — e só ele.
 *
 * Este arquivo tinha 703 linhas e era o arquivo-deus do servidor: montava o Express, servia a rota
 * de negócio `/api/gemini/chat` e subia o processo. A Fase 3 da rodada de saneamento separou as
 * três responsabilidades. A MONTAGEM vive em `server/http/app.ts` (`criarApp()`), a ROTA vive em
 * `server/routes/gemini.ts`, e o que sobra aqui é o que só um processo faz: carregar o `.env`,
 * conferir a configuração, aplicar migrations, escolher entre Vite e estático, escutar numa porta
 * e, quando pedido, forkar o cluster.
 *
 * O `erroGlobal` é montado AQUI, e não em `criarApp()`, porque o Express escolhe o handler de erro
 * pela POSIÇÃO: ele precisa vir depois do middleware do Vite / do estático, que só existem neste
 * arquivo. Montado antes deles, ele deixaria de ser alcançado.
 */
import express from "express";
import path from "path";
import dotenv from "dotenv";
import { criarApp } from "./server/http/app";
import { seedIfEmpty } from "./server/db/seed";
import { dbReady } from "./server/db/db";
import { erroGlobal } from "./server/lib/erroGlobal";
import { registrarFalhaDeBoot, registrarSucessoDeBoot } from "./server/lib/bootStatus";
/* `diretorioGravavel` morava aqui e o `crypto.ts` tinha a sua propria versao divergente — a chave
   de segredos ia parar no disco efemero do conteiner enquanto o diario ia para o volume. Uma
   resposta so, em `server/lib/diretorios.ts` (auditoria de 2026-09-07, achado A34). */
import { diretorioGravavel, erroDeMultiReplica } from "./server/lib/diretorios";
import { verificarConfiguracaoNoBoot } from "./server/lib/config";
import { mecanismoDe, authRequired } from "./server/lib/auth";

dotenv.config();

/* `criarApp()` DEPOIS do `dotenv.config()`, e não no import: metade da montagem depende de
   `authRequired()` e do resto do ambiente, e imports são hoisted acima de qualquer statement. */
const app = criarApp();

// A mensagem de erro de EADDRINUSE manda "definir PORT no .env" — então honre-a.
const PORT = Number(process.env.PORT) || 3000;

// Configure Vite middleware in development or serve static assets in production
/**
 * `prepararDados: false` é o modo WORKER do cluster: migrations, seed e backfill já foram feitos
 * pelo primário antes de forkar. Repetir não seria só desperdício — seria exatamente a contenção
 * de lock no boot que o modo cluster existe para eliminar.
 */

async function startServer({ prepararDados = true } = {}) {
  /*
   * MULTI-REPLICA PRECISA SER DECLARADA, E COERENTE (auditoria de 2026-09-07, achado A34).
   *
   * O servidor guarda arquivo de audio no disco local. Com duas instancias atras de um balanceador
   * e sem armazenamento compartilhado, o audio gravado por uma NAO existe na outra: o mesmo pedido
   * responde 200 ou 404 conforme quem atendeu — medido, com a mensagem "arquivo ausente". Isso nao
   * da para descobrir sozinho (o processo nao sabe quantas replicas existem), entao quem opera
   * declara `REPLICAS` e o boot verifica a coerencia. Falha DURA: subir assim e servir dados que
   * somem de forma intermitente, que e pior que nao subir.
   */
  const incoerencia = erroDeMultiReplica();
  if (incoerencia) {
    console.error(`[boot] ABORTADO: ${incoerencia}`);
    process.exit(1);
  }
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
      /* PODA SO NO PRIMARIO. `prepararDados` e o que ja distingue os dois papeis do cluster: o
         primario migra, faz seed e agora tambem cuida do volume. Antes, N workers varriam o mesmo
         diretorio uma vez por dia cada um (achado A61). Cada processo escreve no proprio arquivo,
         e a leitura junta todos. */
      registrarSinkDeErro(diarioEmArquivo({ dir: dirDeErros, podarAqui: prepararDados }));
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
   * DIZER qual mecanismo autentica — achado F15-01 (fechado em 2026-08-26: o JWKS assimetrico
   * tem precedencia; o segredo compartilhado so vale sem SUPABASE_URL). Se as duas variaveis
   * existem, o segredo esta presente e INERTE — e o operador precisa saber, porque segredo
   * inerte em .env e material de vazamento sem funcao.
   */
  if (configuracao.modoPublico) {
    const mecanismo = mecanismoDe();
    console.log(`[auth] verificacao de token por: ${mecanismo}`);
    if (mecanismo === "jwks-assimetrico" && process.env.SUPABASE_JWT_SECRET) {
      console.warn("[auth] AVISO: SUPABASE_JWT_SECRET esta definido mas NAO e usado — com SUPABASE_URL a verificacao e pelo JWKS assimetrico. Remova o segredo do ambiente.");
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

    /*
     * SEED DE DEMONSTRACAO SO EM SELF-HOST (achado A61).
     *
     * `seedIfEmpty` cria uma sessao e cartoes de exemplo para o LOCAL_OWNER em toda base vazia —
     * inclusive num deploy PUBLICO, onde nao existe "dono local": os dados de demonstracao ficavam
     * pendurados num usuario que ninguem usa, e apareceriam para quem quer que recebesse aquele id.
     * Em modo publico a base nova esta certa vazia.
     */
    if (!authRequired()) {
      await seedIfEmpty();
    }
  }
  if (prepararDados) {
    // M-04: migra cartões Leitner → FSRS no boot (idempotente; nas próximas execuções migra 0).
    try {
      // P3-1: a migração vive em `db/manutencao` (atravessa tenants), não no barrel das rotas.
      const { migrarLeitnerParaFsrs } = await import("./server/db/manutencao");
      const migrados = await migrarLeitnerParaFsrs();
      if (migrados > 0) console.log(`[db] ${migrados} cartão(ões) Leitner migrado(s) para FSRS (M-04)`);
      // Passo que deu certo APAGA a falha anterior: sem isto, uma falha transitória deixaria a
      // instância em 503 para sempre — e uma probe que mente para baixo é ignorada como a que
      // mente para cima.
      registrarSucessoDeBoot("migracao-fsrs");
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
      registrarSucessoDeBoot("backfill-tenancy");
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

  /*
   * CAPTURA DE LOOPBACK NAO SOBREVIVE AO CLUSTER (achado A61).
   *
   * O dispositivo WASAPI e um recurso unico do SISTEMA, e a exclusao que protege ele
   * (`LoopbackExclusion`, em `server/audio/loopback.ts`) e um contador em memoria de UM processo.
   * Com N processos, N exclusoes independentes acham que tem o dispositivo: duas capturas
   * simultaneas passam pelo mutex e brigam pelo hardware. Declarar a incompatibilidade e melhor
   * que descobri-la como audio cortado em producao.
   */
  if (process.platform === "win32") {
    console.warn("[cluster] captura de loopback do servidor desligada: o mutex do dispositivo");
    console.warn("   WASAPI e por processo, e /api/audio/loopback/* recusa neste modo.");
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
