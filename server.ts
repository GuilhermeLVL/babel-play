/**
 * BOOTSTRAP DO PROCESSO NODE — só orquestração.
 *
 * A Fase 3 da rodada de saneamento tirou daqui a MONTAGEM (`server/http/app.ts`, `criarApp()`) e a
 * rota do tutor (`server/routes/tutor.ts`). A Fase 2 da migração para o Cloudflare tirou o resto
 * para `server/boot/`: as travas de boot (`validar.ts`, que devolve achados — quem encerra o processo
 * é este arquivo), o diário de erros, as migrations e os backfills (`preparar.ts`), os agendamentos
 * diários (`jobs.ts`) e o modo cluster (`cluster.ts`). Sobra o que só um processo faz: carregar o
 * `.env`, chamar cada passo na ordem, escolher entre Vite e estático, escutar numa porta e desligar.
 *
 * O `erroGlobal` é montado AQUI, e não em `criarApp()`, porque o Express escolhe o handler de erro
 * pela POSIÇÃO: ele precisa vir depois do middleware do Vite / do estático, que só existem neste
 * arquivo. Montado antes deles, ele deixaria de ser alcançado.
 */
import dotenv from 'dotenv'
import path from 'path'

import { iniciar, repassarSinalAosWorkers } from './server/boot/cluster'
import { agendarJobsNoNode } from './server/boot/jobs'
import { ligarRegistroDeErros, prepararDados as prepararOsDados } from './server/boot/preparar'
import { relatarConfiguracao, validarBoot } from './server/boot/validar'
import { dbReady } from './server/db/db'
import { criarApp } from './server/http/app'
import { montarSpa } from './server/http/estaticos'
import { aplicarTemposLimite } from './server/http/temposLimite'
import { authRequired } from './server/lib/auth'
import { metricasHabilitadas, portaInternaDeMetricas } from './server/lib/config'
import { registrarDesligamento } from './server/lib/desligamento'
import { erroGlobal } from './server/lib/erroGlobal'
import { log } from './server/lib/logger'

dotenv.config()

/* `criarApp()` DEPOIS do `dotenv.config()`, e não no import: metade da montagem depende de
   `authRequired()` e do resto do ambiente, e imports são hoisted acima de qualquer statement. */
const app = criarApp()

// A mensagem de erro de EADDRINUSE manda "definir PORT no .env" — então honre-a.
const PORT = Number(process.env.PORT) || 3000

/**
 * `prepararDados: false` é o modo WORKER do cluster: migrations, seed e backfill já foram feitos
 * pelo primário antes de forkar. Repetir não seria só desperdício — seria exatamente a contenção
 * de lock no boot que o modo cluster existe para eliminar.
 */
async function startServer({ prepararDados = true } = {}) {
  /* As travas de boot (multi-réplica, auth, proxy, métricas, sandbox do Asaas, registro de IA): um
     achado `aborta` encerra o processo aqui; um `avisa` só vai para o stderr. Ver `server/boot/validar.ts`. */
  for (const achado of validarBoot()) {
    if (achado.nivel === 'avisa') {
      console.error(achado.texto)
      continue
    }
    if (achado.evento) log('error', { event: achado.evento, error: achado.texto })
    console.error(`[boot] ABORTADO: ${achado.texto}`)
    process.exit(1)
  }
  /* Diário de erros e Sentry ANTES de tudo, inclusive das migrations: o erro do boot é o que mais
     precisa sobreviver. A poda do diário só no primário. */
  await ligarRegistroDeErros(prepararDados)
  relatarConfiguracao()

  // P0-2: o banco responde ANTES de qualquer escrita (inclusive o seed).
  await dbReady()

  /* Migrations (falha FATAL: sem schema o app não serve nada), seed do self-host e backfills
     idempotentes. Ver `server/boot/preparar.ts`. */
  if (prepararDados) {
    try {
      await prepararOsDados()
    } catch {
      process.exit(1)
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    // Import DINÂMICO, e não estático no topo: `vite` é devDependency, e o esbuild com
    // `--packages=external` transformava o import estático num `require("vite")` no TOPO do
    // bundle. Resultado: a imagem de produção (`npm ci --omit=dev`) quebrava no boot com
    // "Cannot find module 'vite'" — o servidor exigia em runtime algo que nunca usa em
    // produção. Aqui o require só acontece dentro deste ramo, que produção nunca executa.
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    })
    app.use(vite.middlewares)
    console.log('Vite dev server mounted as middleware.')
  } else {
    /* Fase 5: chunk com hash fica 1 ano no navegador; o `index.html` sempre revalida. Ver
       `server/http/estaticos.ts`. */
    montarSpa(app, path.join(process.cwd(), 'dist'))
    console.log('Serving static assets from dist/ in production.')
  }

  /* ERROR HANDLER GLOBAL — achado D7. Montado por ÚLTIMO, de propósito: o Express escolhe o handler
     de erro pela POSIÇÃO, e qualquer coisa registrada depois dele nunca seria alcançada. Sem isto,
     uma rejeição de handler `async` no Express 4 vira request PENDURADO, não 500. */
  app.use(erroGlobal)

  // BIND SEGURO (achado da auditoria): por padrão só 127.0.0.1. Expor na LAN é decisão explícita
  // (HOST=0.0.0.0 no .env) — e, com a auth desligada, o log avisa o que isso significa.
  const HOST = process.env.HOST || '127.0.0.1'
  if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !authRequired()) {
    console.warn(`⚠  HOST=${HOST}: o app está EXPOSTO à rede local SEM autenticação —`)
    console.warn('   qualquer dispositivo da rede acessa suas sessões, credenciais e o áudio do sistema.')
  }
  // Marco 1: auth desligada = todo request é o dono local (sem login), correto para local/self-host.
  if (!authRequired()) {
    console.warn('⚠  AUTH_REQUIRED desligada: sem login; todo request é tratado como o dono local.')
    console.warn('   Correto para local/self-host. Deploy público EXIGE AUTH_REQUIRED=1.')
  }
  const server = app.listen(PORT, HOST, () => {
    // Anuncia LOCALHOST, não 0.0.0.0: só localhost/HTTPS é "contexto seguro", e o Cache Storage onde
    // o Whisper/opus-mt guardam os pesos SÓ existe nele (e é particionado por PORTA).
    console.log(`Babel Play rodando em  ->  http://localhost:${PORT}`)
    console.log(`   (abra sempre por http://localhost:${PORT} — por 0.0.0.0/IP o modelo local re-baixa toda vez)`)
  })
  /* DESLIGAMENTO GRACIOSO (Fase 5) — registrado LOGO APÓS o `listen`: antes dele não há o que drenar.
     `repassarSinalAosWorkers` é o gancho do primário do cluster; fora do cluster não faz nada. */
  registrarDesligamento({ servidor: server, antes: () => repassarSinalAosWorkers() })

  /* TEMPOS LIMITE (auditoria de 10/10/2026, A6): o socket ocioso vive mais que os 60 s do proxy do
     Fly. O porquê de cada número está em `server/http/temposLimite.ts`. */
  aplicarTemposLimite(server)

  /* MÉTRICAS NA PORTA INTERNA (Fase 5 de prontidão) — sem token, numa porta que o proxy do Fly não
     publica. Só no processo que prepara os dados: o scrape precisa de UM endereço. */
  const portaDeMetricas = prepararDados && metricasHabilitadas() ? portaInternaDeMetricas() : undefined
  if (portaDeMetricas !== undefined) {
    const { iniciarServidorDeMetricas } = await import('./server/http/metricas')
    try {
      await iniciarServidorDeMetricas(portaDeMetricas)
      console.log(`[metrics] /metrics na porta interna ${portaDeMetricas} (sem token; não publicada)`)
    } catch (err) {
      /* Métrica quebrada não derruba o serviço que ela observa: o alerta `absent(up)` é quem avisa. */
      console.error(`[metrics] porta interna ${portaDeMetricas} indisponível: ${String(err).slice(0, 160)}`)
    }
  }

  /* Os agendamentos diários (backup, retenções, podas, limpeza): só no processo que prepara os dados
     — uma varredura por deploy, não uma por worker. Ver `server/boot/jobs.ts`. */
  if (prepararDados) await agendarJobsNoNode()

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n⚠  A porta ${PORT} já está em uso — outro servidor está rodando.`)
      console.error(`   Defina uma porta FIXA no .env (ex.: PORT=3100) e use sempre a mesma:`)
      console.error(`   o cache do modelo local é POR PORTA — trocar de porta faz o navegador`)
      console.error(`   re-baixar o Whisper/opus-mt do zero.\n`)
    } else {
      console.error('Erro ao iniciar o servidor:', err)
    }
    process.exit(1)
  })
}

iniciar(startServer)
