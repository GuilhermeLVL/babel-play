#!/usr/bin/env node
/**
 * FUMAÇA DO WORKER (Fase 2, Task 12): `npm run fumaca:worker` (ou `WRANGLER_FUMACA=1 npx vitest run
 * tests/worker/fumaca.test.ts`). O app inteiro no `wrangler dev` local, sem credencial da Cloudflare:
 *
 *   - Postgres 17 em Docker (container `pg-worker-fumaca`, porta 5434 — não briga com o `pg-worker` de
 *     desenvolvimento na 5433), migrado com `npm run db:migrate`, ligado ao binding HYPERDRIVE pela
 *     variável CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE;
 *   - R2 e assets simulados pelo Miniflare, com estado num diretório temporário (`--persist-to`);
 *   - um JWKS local (chave ES256 gerada agora) no papel do Supabase: SUPABASE_URL aponta para ele.
 *
 * `FUMACA_PG_URL=postgres://…` usa um Postgres existente no lugar do Docker (job `worker` do ci.yml).
 *
 * As nove verificações:
 *   1. GET /api/health → 200 com `banco: 'postgres'`;
 *   2. JWT ES256 → GET /api/me 200 (e a idade adulta declarada, para as rotas de nuvem);
 *   3. POST /api/sessions + POST /api/sessions/:id/audio (1 MB) → 2xx; GET …/audio com Range → 206, 100 bytes;
 *   4. GET /cdn-cgi/local/scheduled?cron=17 3 * * * → 200 e a linha `job_fim` da poda das janelas no log;
 *   5. ESTORNO DEPOIS DA RESPOSTA (C1): uploads de 64 KB e 2 MB que não são áudio são recusados e só depois, no
 *      `finally` da rota, devolvem a cota reservada — o contador de armazenamento tem de voltar ao valor
 *      de antes (o `Client` não pode fechar antes do estorno);
 *   6. CONCORRÊNCIA NO ISOLATE (I1): 10 GET /api/me em paralelo, cada um com um usuário, mais um upload
 *      cancelado no meio do corpo → todos 200, nenhum 500; cada requisição abriu a SUA conexão (o log do
 *      Postgres conta as conexões novas) e, no fim, nenhuma ficou aberta;
 *   7. GET /api (sem barra) → 404 JSON, não a SPA.
 *   8. SITE PÚBLICO pelo ASSETS de verdade (o `dist/` do build): `/` → 200 com a home estática, `/app` → 200
 *      com o app, `/nao-existe` → 404 com a `404.html` (nada de soft 404) e, num host que não é o de produção,
 *      `X-Robots-Tag: noindex` e `robots.txt` com `Disallow: /`.
 *   9. "COMO RESPONDO?" EM FLUXO pelo Worker: um provedor SIMULADO (https local, certificado gerado agora e aceito
 *      pelo workerd via NODE_EXTRA_CA_CERTS) manda o SSE aos pedaços, ~250 ms entre eles. O NDJSON tem de chegar
 *      ao cliente AOS PEDAÇOS pelo `httpServerHandler` e pelo `acompanharCorpo` — a primeira sugestão ANTES de o
 *      provedor terminar — e o cliente que aborta no meio tem de fechar a conexão do Worker com o provedor
 *      (o `close` da resposta → `sinalDoCliente` → o `fetch` ao provedor abortado).
 *
 * `--verboso` imprime a saída inteira do wrangler no fim. Sai com código ≠ 0 em qualquer falha. Encerra o wrangler (o grupo de processos inteiro) e o container
 * no fim, dando certo ou não.
 */
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createServer as criarServidorHttps } from 'node:https'
import { createServer as criarServidorTcp } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { exportJWK, generateKeyPair, SignJWT } from 'jose'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CONTAINER = 'pg-worker-fumaca'
const PORTA_PG = 5434
/* `FUMACA_PG_URL`: Postgres já de pé (o `services:` do CI). Sem Docker aqui: o script não sobe nem remove nada,
   e consulta com o `psql` do PATH (o runner do GitHub traz). Sem a variável, o container acima. */
const URL_EXTERNA = process.env.FUMACA_PG_URL || ''
const URL_PG = URL_EXTERNA || `postgres://postgres:teste@localhost:${PORTA_PG}/postgres`
const CRON = '17 3 * * *'
const JOB_DO_CRON = 'podaDasJanelasDiarias'
const MB = 1024 * 1024
const VERSAO = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))
const passo = (msg) => console.log(`· ${msg}`)

function rodar(cmd, args, opcoes = {}) {
  const r = spawnSync(cmd, args, { cwd: RAIZ, encoding: 'utf8', ...opcoes })
  if (r.status !== 0)
    throw new Error(`${cmd} ${args.join(' ')} falhou (${r.status}): ${(r.stderr || r.stdout).slice(-800)}`)
  return r.stdout
}

async function portaLivre() {
  return new Promise((ok, falha) => {
    const s = criarServidorTcp()
    s.once('error', falha)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })
}

async function subirPostgres() {
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' })
  rodar('docker', [
    'run',
    '--rm',
    '-d',
    '--name',
    CONTAINER,
    '-e',
    'POSTGRES_PASSWORD=teste',
    '-p',
    `${PORTA_PG}:5432`,
    'postgres:17',
    /* Cada conexão nova aparece no log do container: é como a verificação 6 conta os `Client`s. */
    '-c',
    'log_connections=on',
  ])
  for (let i = 0; i < 60; i++) {
    /* `pg_isready` responde antes do fim do initdb (que reinicia o servidor): duas respostas seguidas. */
    const pronto = () =>
      spawnSync('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1'], { stdio: 'ignore' })
        .status === 0
    if (pronto()) {
      await esperar(1000)
      if (pronto()) return
    }
    await esperar(1000)
  }
  throw new Error('Postgres do Docker não ficou pronto em 60 s')
}

async function subirJwks() {
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'fumaca', alg: 'ES256', use: 'sig' }
  const servidor = createServer((req, res) => {
    if (req.url === '/auth/v1/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ keys: [jwk] }))
      return
    }
    res.writeHead(404).end()
  })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const url = `http://127.0.0.1:${servidor.address().port}`
  const token = (sub) =>
    new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'fumaca' })
      .setSubject(sub)
      .setAudience('authenticated')
      .setIssuer(`${url}/auth/v1`)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(privateKey)
  return { servidor, url, token }
}

/**
 * O PROVEDOR SIMULADO da verificação 9: `POST /v1/chat/completions` com `stream: true` responde o SSE do formato
 * OpenAI aos pedaços (um a cada `INTERVALO_DO_PROVEDOR_MS`), com o `usage` no fim. Em https (o registro de IA exige
 * https em produção, e o Worker é sempre produção), com um certificado de `localhost` assinado por uma CA gerada
 * agora — o workerd recusa um certificado autoassinado de folha (o handshake cai com "internal error"), e aceita a CA
 * pelo NODE_EXTRA_CA_CERTS (o Miniflare a passa ao `trustedCertificates`). Anota quando cada pedido terminou de
 * mandar o fluxo e se a conexão foi fechada antes do fim (o abort do Worker).
 */
const INTERVALO_DO_PROVEDOR_MS = 250
const SUGESTOES_DO_PROVEDOR = [
  { texto: 'Sure, Thursday works.', traducao: 'Claro, quinta funciona.', tom: 'neutro' },
  { texto: 'Yeah, no problem!', traducao: 'Sim, sem problema!', tom: 'informal' },
  { texto: 'Certainly, Thursday is fine.', traducao: 'Certamente, quinta está bem.', tom: 'formal' },
]

async function subirProvedorSimulado(dir) {
  const chave = join(dir, 'provedor.key')
  const cert = join(dir, 'provedor.crt')
  const ca = join(dir, 'provedor-ca.crt')
  const chaveDaCa = join(dir, 'provedor-ca.key')
  const pedido = join(dir, 'provedor.csr')
  const extensoes = join(dir, 'provedor.ext')
  const ec = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes']
  rodar('openssl', [
    'req',
    '-x509',
    ...ec,
    '-keyout',
    chaveDaCa,
    '-out',
    ca,
    '-days',
    '1',
    '-subj',
    '/CN=Fumaca CA',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
  ])
  rodar('openssl', ['req', ...ec, '-keyout', chave, '-out', pedido, '-subj', '/CN=localhost'])
  writeFileSync(
    extensoes,
    'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1\nbasicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\n',
  )
  rodar('openssl', [
    'x509',
    '-req',
    '-in',
    pedido,
    '-CA',
    ca,
    '-CAkey',
    chaveDaCa,
    '-CAcreateserial',
    '-out',
    cert,
    '-days',
    '1',
    '-extfile',
    extensoes,
  ])
  const pedidos = []
  const atender = (req, res) => {
    let corpo = ''
    req.on('data', (d) => (corpo += d))
    req.on('end', async () => {
      const p = { stream: false, fimMs: null, fechadoAntesDoFim: false, pedacos: 0 }
      pedidos.push(p)
      let j = {}
      try {
        j = JSON.parse(corpo)
      } catch {
        /* corpo ilegível: responde o fluxo de sempre */
      }
      p.stream = j.stream === true
      const texto = JSON.stringify({ sugestoes: SUGESTOES_DO_PROVEDOR })
      const uso = { prompt_tokens: 300, completion_tokens: 100 }
      if (!p.stream) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ choices: [{ message: { content: texto } }], usage: uso }))
        p.fimMs = performance.now()
        return
      }
      let fechado = false
      res.on('close', () => {
        fechado = true
        if (p.fimMs === null) p.fechadoAntesDoFim = true
      })
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      /* Um pedaço por sugestão (o objeto inteiro), mais o começo e o fim do JSON, devagar. */
      const pedacos = [
        '{"sugestoes":[',
        ...SUGESTOES_DO_PROVEDOR.map((s, i) => (i ? ',' : '') + JSON.stringify(s)),
        ']}',
      ]
      for (const pedaco of pedacos) {
        if (fechado) return
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: pedaco } }] })}\n\n`)
        p.pedacos++
        await esperar(INTERVALO_DO_PROVEDOR_MS)
      }
      if (fechado) return
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: uso })}\n\n`)
      res.end('data: [DONE]\n\n')
      p.fimMs = performance.now()
    })
  }
  /* Pelo NOME `localhost` (a verificação do certificado do workerd é por nome), nas duas pilhas: o `localhost` do
     workerd pode resolver para ::1 ou 127.0.0.1. A mesma porta nas duas. */
  const tls = { key: readFileSync(chave), cert: readFileSync(cert) }
  const servidor = criarServidorHttps(tls, atender)
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const porta = servidor.address().port
  const servidor6 = criarServidorHttps(tls, atender)
  await new Promise((ok) => {
    servidor6.once('error', () => ok()) // sem IPv6 na máquina: fica só o IPv4
    servidor6.listen(porta, '::1', ok)
  })
  servidor.on('close', () => servidor6.close())
  const base = `https://localhost:${porta}/v1`
  const registro = {
    provedores: [
      {
        id: 'simulado',
        formato: 'openai',
        base,
        chave: 'SIMULADO_API_KEY',
        retencao: 'zdr',
        modelos: [{ id: 'simulado/modelo', funcoes: ['traducao', 'tutor'], preco: { entrada: 0.1, saida: 0.3 } }],
      },
    ],
  }
  return { servidor, ca, pedidos, registro, base }
}

/** Instâncias do wrangler vivas, para a limpeza (fim normal, falha ou Ctrl-C). */
const vivos = []

function subirWrangler(porta, supabaseUrl, persistir, varsExtras = [], envExtra = {}) {
  let saida = ''
  const filho = spawn(
    process.execPath,
    [
      join(RAIZ, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
      'dev',
      '-c',
      'wrangler.jsonc',
      '--env=',
      '--ip',
      '127.0.0.1',
      '--port',
      String(porta),
      '--persist-to',
      persistir,
      '--show-interactive-dev-session=false',
      '--var',
      `SUPABASE_URL:${supabaseUrl}`,
      '--var',
      `SECRET_KEY:${randomBytes(32).toString('hex')}`,
      ...varsExtras.flatMap((v) => ['--var', v]),
    ],
    {
      cwd: RAIZ,
      detached: true, // grupo próprio: o wrangler sobe o workerd como filho, e os dois saem juntos
      env: {
        ...process.env,
        CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: URL_PG,
        /* Sem isto o wrangler carrega o `.env` do repositório como vars: chaves reais dentro do isolate. */
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
        WRANGLER_SEND_METRICS: 'false',
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        ...envExtra,
      },
    },
  )
  filho.stdout.on('data', (d) => (saida += d))
  filho.stderr.on('data', (d) => (saida += d))
  const w = { filho, saida: () => saida }
  vivos.push(w)
  return w
}

async function derrubar(w) {
  if (w.filho.exitCode !== null) return
  try {
    process.kill(-w.filho.pid, 'SIGTERM')
  } catch {
    /* já saiu */
  }
  for (let i = 0; i < 20 && w.filho.exitCode === null; i++) await esperar(250)
  if (w.filho.exitCode === null) {
    try {
      process.kill(-w.filho.pid, 'SIGKILL')
    } catch {
      /* já saiu */
    }
  }
}

/** Quantos `psql` do próprio script já terminaram (cada um é uma sessão no contador do modo externo). */
let psqlConcluidos = 0

/** O Postgres de teste responde por `docker exec` (o mesmo container da fumaça) ou, no modo externo, por `psql`. */
function consultar(sql) {
  if (!URL_EXTERNA) return rodar('docker', ['exec', CONTAINER, 'psql', '-U', 'postgres', '-tAc', sql]).trim()
  const saida = rodar('psql', [URL_EXTERNA, '-tAc', sql]).trim()
  psqlConcluidos++
  return saida
}

/** Conexões já aceitas pelo Postgres: o log do container (Docker) ou, no modo externo, `pg_stat_database.sessions`
    menos as sessões do próprio `psql` do script. */
function conexoesAceitas() {
  if (URL_EXTERNA) {
    const proprias = psqlConcluidos
    return Number(consultar('select sessions from pg_stat_database where datname = current_database()')) - proprias
  }
  return (spawnSync('docker', ['logs', CONTAINER], { encoding: 'utf8' }).stderr.match(/connection authorized/g) ?? [])
    .length
}

async function esperarPronto(w) {
  for (let i = 0; i < 120; i++) {
    if (/Ready on http/.test(w.saida())) return
    if (w.filho.exitCode !== null) break
    await esperar(500)
  }
  throw new Error(`wrangler dev não ficou pronto:\n${w.saida().slice(-3000)}`)
}

function confere(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function verificacoes(base, w, token, provedor) {
  // 1. health
  const h = await fetch(`${base}/api/health`)
  const corpoH = await h.json()
  confere(h.status === 200 && corpoH.banco === 'postgres', `health: ${h.status} ${JSON.stringify(corpoH)}`)
  /* Modo produção no LITERAL (o `define` do wrangler.jsonc): a CSP bloqueia em vez de só relatar. */
  confere(
    h.headers.get('content-security-policy') && !h.headers.get('content-security-policy-report-only'),
    'a CSP do Worker deveria bloquear (NODE_ENV=production embutido), veio Report-Only',
  )
  /* A versão vem do `define` (não há disco no Worker). */
  confere(corpoH.versao === VERSAO, `versão no Worker: ${corpoH.versao}, package.json: ${VERSAO}`)
  const metricas = await fetch(`${base}/metrics`)
  confere(metricas.status === 404, `/metrics no Worker deveria ser 404, veio ${metricas.status}`)
  console.log(
    `✔ 1/9 GET /api/health → 200, banco=${corpoH.banco}, versão ${corpoH.versao}, CSP de produção; /metrics → 404`,
  )

  // 2. JWT ES256 → /api/me
  const sub = `fumaca-${randomBytes(4).toString('hex')}`
  const jwt = await token(sub)
  const auth = { authorization: `Bearer ${jwt}` }
  const semToken = await fetch(`${base}/api/me`)
  confere(semToken.status === 401, `/api/me sem token deveria ser 401, veio ${semToken.status}`)
  /* O IP do cliente é o `CF-Connecting-IP`; um `X-Forwarded-For` forjado não muda a chave do balde. O
     limitador de falhas soma o 401 depois da resposta (pelo `waitUntil`). */
  const sem = (h) => fetch(`${base}/api/me`, { headers: h }).then((r) => r.status)
  await sem({ 'cf-connecting-ip': '203.0.113.1' })
  await sem({ 'cf-connecting-ip': '203.0.113.2' })
  await sem({ 'cf-connecting-ip': '203.0.113.1', 'x-forwarded-for': '198.51.100.9' })
  const baldes = () =>
    consultar("select user_id || '=' || count from usage_counters where metric = 'ratelimit:auth' order by 1")
  let vistos = ''
  for (let i = 0; i < 20; i++) {
    vistos = baldes()
    if (vistos.includes('ip:203.0.113.1=2') && vistos.includes('ip:203.0.113.2=1')) break
    await esperar(250)
  }
  confere(
    vistos.includes('ip:203.0.113.1=2') && vistos.includes('ip:203.0.113.2=1') && !vistos.includes('198.51.100.9'),
    `baldes do limitador por IP: ${vistos.replace(/\n/g, ', ')}`,
  )
  const me = await fetch(`${base}/api/me`, { headers: auth })
  confere(me.status === 200, `/api/me: ${me.status} ${(await me.text()).slice(0, 300)}`)
  const idade = await fetch(`${base}/api/me/idade`, {
    method: 'PUT',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ nascimento: '1990-01-01' }),
  })
  confere(idade.status === 200, `PUT /api/me/idade: ${idade.status} ${(await idade.text()).slice(0, 300)}`)
  /* Importação de página no workerd (R8): linkedom + Readability + DoH, contra uma página pública real. Sem
     rede, avisa e segue (a fumaça não depende da internet). */
  let resumoWeb = 'import web: ignorado (sem rede)'
  const PAGINA = 'https://pt.wikipedia.org/wiki/L%C3%ADngua_portuguesa'
  /* A rede é conferida AQUI, pelo próprio script, antes de chamar o Worker: se este processo não alcança a
     Wikipédia, a verificação é ignorada com aviso. Depois disso, qualquer resposta diferente de 200 é FALHA
     — uma regex sobre a mensagem do 400 (a versão anterior) mascarava regressão real: "rede"/"DoH" são
     substrings das mensagens da própria guarda anti-SSRF e de um resolvedor quebrado no Worker. */
  let temRede = true
  try {
    await fetch(PAGINA, { method: 'HEAD', signal: globalThis.AbortSignal.timeout(10_000) })
  } catch (e) {
    temRede = false
    console.warn(`⚠ POST /api/import/web: sem rede para ${PAGINA} (${e?.message ?? e}); verificação ignorada`)
  }
  if (temRede) {
    const t0 = Date.now()
    const web = await fetch(`${base}/api/import/web`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ url: PAGINA }),
      signal: globalThis.AbortSignal.timeout(60_000),
    })
    const corpoWeb = await web.json().catch(() => ({}))
    confere(
      web.status === 200 && (corpoWeb.text?.length ?? 0) > 2_000 && /portuguesa/i.test(corpoWeb.title ?? ''),
      `POST /api/import/web no Worker: ${web.status} ${JSON.stringify(corpoWeb).slice(0, 300)}`,
    )
    resumoWeb = `import web: 200, ${corpoWeb.text.length} caracteres, "${corpoWeb.title}", ${Date.now() - t0} ms`
  }
  console.log(
    '✔ 2/9 JWT ES256 (JWKS local) → GET /api/me 200 (sem token: 401, balde por CF-Connecting-IP, X-Forwarded-For forjado ignorado; ' +
      resumoWeb +
      ')',
  )

  // 3. sessão + upload de 1 MB + Range
  const s = await fetch(`${base}/api/sessions`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'fumaça do Worker', kind: 'audio' }),
  })
  confere(s.ok, `POST /api/sessions: ${s.status} ${(await s.clone().text()).slice(0, 300)}`)
  const { id } = await s.json()
  const cabecaWebm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3])
  const audio = Buffer.concat([cabecaWebm, randomBytes(MB - cabecaWebm.length)])
  const up = await fetch(`${base}/api/sessions/${id}/audio`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'audio/webm' },
    body: audio,
  })
  confere(up.ok, `POST /api/sessions/:id/audio: ${up.status} ${(await up.text()).slice(0, 300)}`)
  const faixa = await fetch(`${base}/api/sessions/${id}/audio`, { headers: { ...auth, range: 'bytes=0-99' } })
  const pedaco = Buffer.from(await faixa.arrayBuffer())
  confere(faixa.status === 206, `GET …/audio com Range: ${faixa.status} ${pedaco.toString().slice(0, 200)}`)
  confere(
    pedaco.length === 100 && pedaco.equals(audio.subarray(0, 100)),
    `Range devolveu ${pedaco.length} bytes diferentes`,
  )
  console.log(
    `✔ 3/9 POST /api/sessions + upload de 1 MB → ${up.status}; GET …/audio Range bytes=0-99 → 206 (100 bytes iguais)`,
  )

  // 4. cron
  const antes = w.saida().length
  const c = await fetch(`${base}/cdn-cgi/local/scheduled?cron=${encodeURIComponent(CRON)}`)
  confere(c.status === 200, `scheduled: ${c.status}`)
  const linhaDoJob = () =>
    w
      .saida()
      .slice(antes)
      .split('\n')
      .find((l) => l.includes('"job_fim"') && l.includes(JOB_DO_CRON))
  for (let i = 0; i < 40 && !linhaDoJob(); i++) await esperar(250)
  const linha = linhaDoJob()
  confere(linha, `o log não trouxe job_fim de ${JOB_DO_CRON}:\n${w.saida().slice(antes).slice(-2000)}`)
  console.log(`✔ 4/9 cron "${CRON}" → 200; log: ${linha.trim().slice(0, 200)}`)

  // 5. estorno da cota depois da resposta (C1)
  const usoDeArmazenamento = () =>
    Number(
      consultar(
        `select coalesce(sum(count), 0) from usage_counters where user_id = '${sub}' and metric = 'storage_bytes'`,
      ),
    )
  const usoAntes = usoDeArmazenamento()
  confere(usoAntes >= MB, `o contador de armazenamento deveria ter o 1 MB da verificação 3, tem ${usoAntes}`)
  const s2 = await fetch(`${base}/api/sessions`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'fumaça: estorno', kind: 'audio' }),
  })
  confere(s2.ok, `POST /api/sessions (estorno): ${s2.status}`)
  const { id: id2 } = await s2.json()
  /* Duas vezes: 64 KB (a rota responde 400 e o corpo já chegou inteiro) e 2 MB (a rota responde sem ler o
     resto; o proxy local do wrangler troca a resposta por "Network connection lost", e o `finally` corre com o
     corpo ainda chegando — foi assim que o estorno se perdia antes do C1). Nos dois, a reserva volta. */
  const estornos = []
  for (const tamanho of [64 * 1024, 2 * MB]) {
    const tiposInvalidos = () => (w.saida().match(/audio_upload_tipo_invalido/g) ?? []).length
    const vistosAntes = tiposInvalidos()
    const naoAudio = await fetch(`${base}/api/sessions/${id2}/audio`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'audio/webm' },
      body: Buffer.alloc(tamanho, 0x41),
    })
    const corpoNaoAudio = await naoAudio.text()
    if (tamanho < MB) {
      confere(
        naoAudio.status === 400 && JSON.parse(corpoNaoAudio).code === 'audio_content_invalid',
        `upload que não é áudio: ${naoAudio.status} ${corpoNaoAudio.slice(0, 300)}`,
      )
    } else {
      confere(!naoAudio.ok, `upload de 2 MB que não é áudio deveria falhar, veio ${naoAudio.status}`)
      for (let i = 0; i < 20 && tiposInvalidos() === vistosAntes; i++) await esperar(250)
      confere(tiposInvalidos() > vistosAntes, 'a rota não recusou o upload de 2 MB (audio_upload_tipo_invalido)')
    }
    let usoDepois = usoDeArmazenamento()
    for (let i = 0; i < 20 && usoDepois !== usoAntes; i++) {
      await esperar(250)
      usoDepois = usoDeArmazenamento()
    }
    confere(
      usoDepois === usoAntes,
      `o estorno do finally não entrou: armazenamento ${usoAntes} antes, ${usoDepois} depois (reserva de ${tamanho} bytes presa)\n${w
        .saida()
        .split('\n')
        .filter((l) => /storage_release_failed|fechad|worker_fechar/.test(l))
        .join('\n')
        .slice(-1500)}`,
    )
    estornos.push(`${tamanho / 1024} KB → ${naoAudio.status}`)
  }
  /* O contador sozinho não basta: com o `end()` do `pg` no meio, o UPDATE às vezes chega ao servidor e o
     cliente registra a falha mesmo assim. O estorno tem de ter terminado DE VERDADE, sem erro. */
  const falhas = w
    .saida()
    .split('\n')
    .filter((l) => /storage_release_failed|storage_adjust_failed|executor_fechou_ocupado/.test(l))
  confere(falhas.length === 0, `o estorno falhou no Worker:\n${falhas.join('\n').slice(-1500)}`)
  console.log(
    `✔ 5/9 uploads que não são áudio (${estornos.join(', ')}); o estorno do finally (depois da resposta) devolveu a reserva: ${usoAntes} bytes, como antes`,
  )

  // 6. concorrência no isolate (I1)
  const conexoesNoLog = conexoesAceitas
  const abertasDoWorker = () =>
    Number(
      consultar(
        "select count(*) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid() and coalesce(application_name, '') <> 'psql'",
      ),
    )
  const conexoesAntes = conexoesNoLog()
  const N = 10
  /* Um upload em `chunked` que manda o começo do corpo e é cancelado no meio. */
  const cancelador = new globalThis.AbortController()
  const corpoQueTrava = new globalThis.ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...randomBytes(64 * 1024)]))
    },
  })
  const cancelado = fetch(`${base}/api/sessions/${id2}/audio`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'audio/webm' },
    body: corpoQueTrava,
    duplex: 'half',
    signal: cancelador.signal,
  }).then(
    (r) => `respondeu ${r.status}`,
    (err) => err.name,
  )
  const tokens = await Promise.all(Array.from({ length: N }, (_, i) => token(`${sub}-par-${i}`)))
  setTimeout(() => cancelador.abort(), 300)
  const paralelos = await Promise.all(
    tokens.map((t) => fetch(`${base}/api/me`, { headers: { authorization: `Bearer ${t}` } }).then((r) => r.status)),
  )
  const fimDoCancelado = await cancelado
  confere(
    paralelos.every((st) => st === 200),
    `GET /api/me em paralelo: ${paralelos.join(', ')}`,
  )
  confere(fimDoCancelado === 'AbortError', `o upload cancelado deveria abortar no cliente, veio: ${fimDoCancelado}`)
  const depoisDoCancelado = await fetch(`${base}/api/me`, { headers: auth })
  confere(depoisDoCancelado.status === 200, `GET /api/me depois do cancelado: ${depoisDoCancelado.status}`)
  let novas = conexoesNoLog() - conexoesAntes
  for (let i = 0; i < 20 && novas < (URL_EXTERNA ? N : N + 1); i++) {
    await esperar(250)
    novas = conexoesNoLog() - conexoesAntes
  }
  /* N paralelos + o cancelado + o de depois: uma conexão por requisição (sem pool no isolate). */
  /* No modo externo o contador é `pg_stat_database.sessions` (estatística atrasada, mais as sessões do `psql`
     do script): a margem é de ±1, então ali basta N. No Docker, o log do container é exato (N + 1). */
  const minimo = URL_EXTERNA ? N : N + 1
  confere(novas >= minimo, `conexões novas no Postgres: ${novas}, esperava ≥ ${minimo} (uma por requisição)`)
  let abertas = abertasDoWorker()
  for (let i = 0; i < 100 && abertas > 0; i++) {
    await esperar(250)
    abertas = abertasDoWorker()
  }
  confere(
    abertas === 0,
    `conexões do Worker ainda abertas 25 s depois: ${abertas}\n${consultar(
      "select pid, state, now() - backend_start, left(query, 120) from pg_stat_activity where backend_type = 'client backend' and pid <> pg_backend_pid()",
    )}`,
  )
  confere(!/"status":500|erro_interno|worker_requisicao_falhou/.test(w.saida()), 'algum 500 no log do Worker')
  console.log(
    `✔ 6/9 ${N} GET /api/me em paralelo (usuários distintos) → todos 200; upload cancelado → ${fimDoCancelado}; ${novas} conexões novas (uma por requisição), 0 abertas no fim; nenhum 500`,
  )

  // 7. /api sem barra
  const raiz = await fetch(`${base}/api`)
  const corpoRaiz = await raiz.text()
  confere(
    raiz.status === 404 && JSON.parse(corpoRaiz).code === 'rota_inexistente',
    `GET /api: ${raiz.status} ${corpoRaiz.slice(0, 200)}`,
  )
  console.log('✔ 7/9 GET /api → 404 JSON (rota_inexistente)')

  // 8. o site público e o 404 de verdade, pelo ASSETS real
  const home = await fetch(`${base}/`)
  const corpoHome = await home.text()
  confere(
    home.status === 200 && /<h1>[^<]+<\/h1>/.test(corpoHome) && !corpoHome.includes('id="root"'),
    `GET / deveria ser a home estática: ${home.status} ${corpoHome.slice(0, 200)}`,
  )
  const app = await fetch(`${base}/app`)
  confere(app.status === 200 && (await app.text()).includes('id="root"'), `GET /app deveria ser o app: ${app.status}`)
  const nada = await fetch(`${base}/nao-existe-fumaca`)
  const corpoNada = await nada.text()
  confere(
    nada.status === 404 && /não encontrada/i.test(corpoNada),
    `GET /nao-existe-fumaca deveria ser 404 com a 404.html: ${nada.status} ${corpoNada.slice(0, 200)}`,
  )
  confere(
    nada.headers.get('x-robots-tag') === 'noindex, nofollow',
    `host local sem X-Robots-Tag noindex: ${nada.headers.get('x-robots-tag')}`,
  )
  const robots = await (await fetch(`${base}/robots.txt`)).text()
  confere(/Disallow: \/\s*$/.test(robots), `robots.txt fora da produção deveria bloquear tudo: ${robots}`)
  console.log(
    '✔ 8/9 site público: / → home estática, /app → app, /nao-existe → 404 (404.html), noindex e robots bloqueado',
  )

  // 9. "Como respondo?" em fluxo pelo Worker
  await comoRespondoEmFluxo(base, token, provedor)
}

async function comoRespondoEmFluxo(base, token, provedor) {
  const quem = `fumaca-fluxo-${randomBytes(4).toString('hex')}`
  const agora = Date.now()
  /* Plano pago ANTES do primeiro pedido da conta e a flag ligada (a semente da migração nasce desligada). */
  consultar(
    `insert into subscriptions (id, created_at, updated_at, user_id, plan, status) values ('${quem}', ${agora}, ${agora}, '${quem}', 'plus', 'active')`,
  )
  consultar("update flags set habilitada = true where chave = 'assistente_ao_vivo'")
  const auth = { authorization: `Bearer ${await token(quem)}` }
  const idade = await fetch(`${base}/api/me/idade`, {
    method: 'PUT',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ nascimento: '1990-01-01' }),
  })
  confere(idade.status === 200, `PUT /api/me/idade (fluxo): ${idade.status} ${(await idade.text()).slice(0, 300)}`)
  const corpo = JSON.stringify({ frase: 'Can we move our meeting to Thursday?', lang: 'en', langDaPessoa: 'pt-BR' })
  const pedir = (signal) =>
    fetch(`${base}/api/ai/assistente/como-respondo`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json', accept: 'application/x-ndjson, application/json' },
      body: corpo,
      signal,
    })
  const dec = new globalThis.TextDecoder()

  /* (a) Aos pedaços: cada linha com o instante em que chegou ao cliente. */
  const antes = provedor.pedidos.length
  const t0 = performance.now()
  const r = await pedir()
  const tipo = r.headers.get('content-type') ?? ''
  if (r.status !== 200)
    confere(false, `como-respondo em fluxo no Worker: ${r.status} ${(await r.text()).slice(0, 400)}`)
  confere(tipo.includes('application/x-ndjson'), `como-respondo em fluxo: content-type ${tipo}`)
  const eventos = []
  const leitor = r.body.getReader()
  let pendente = ''
  for (;;) {
    const { done, value } = await leitor.read()
    if (done) break
    pendente += dec.decode(value, { stream: true })
    let i
    while ((i = pendente.indexOf('\n')) >= 0) {
      const linha = pendente.slice(0, i)
      pendente = pendente.slice(i + 1)
      if (linha.trim()) eventos.push({ ...JSON.parse(linha), ms: performance.now() })
    }
  }
  const doProvedor = provedor.pedidos[antes]
  confere(
    doProvedor?.stream === true,
    `o Worker deveria chamar o provedor com stream: true (${JSON.stringify(doProvedor)})`,
  )
  confere(
    eventos.map((e) => e.tipo).join(',') === 'sugestao,sugestao,sugestao,fim',
    `eventos do fluxo: ${JSON.stringify(eventos).slice(0, 400)}`,
  )
  const primeira = eventos[0].ms
  confere(
    doProvedor.fimMs !== null && primeira < doProvedor.fimMs,
    `a primeira sugestão chegou em ${Math.round(primeira - t0)} ms, DEPOIS de o provedor terminar (${Math.round(
      (doProvedor.fimMs ?? NaN) - t0,
    )} ms): o Worker segurou o corpo`,
  )
  /* Espaçadas como o provedor manda (~250 ms): um buffer juntaria tudo no fim. */
  const espaco = eventos[2].ms - eventos[0].ms
  confere(
    espaco > INTERVALO_DO_PROVEDOR_MS,
    `as sugestões chegaram juntas (${Math.round(espaco)} ms entre a 1ª e a 3ª)`,
  )
  const resumo = `1ª sugestão em ${Math.round(primeira - t0)} ms, provedor terminou em ${Math.round(doProvedor.fimMs - t0)} ms, ${Math.round(espaco)} ms entre a 1ª e a 3ª`

  /* (b) O cliente aborta depois da primeira sugestão: a conexão do Worker com o provedor tem de fechar antes do fim. */
  const antesB = provedor.pedidos.length
  const controle = new globalThis.AbortController()
  const r2 = await pedir(controle.signal)
  confere(r2.status === 200, `como-respondo (abort): ${r2.status}`)
  const leitor2 = r2.body.getReader()
  let viu = ''
  while (!viu.includes('"sugestao"')) {
    const { done, value } = await leitor2.read()
    if (done) break
    viu += dec.decode(value, { stream: true })
  }
  confere(viu.includes('"sugestao"'), 'o fluxo do abort não trouxe a primeira sugestão')
  controle.abort()
  let p2 = provedor.pedidos[antesB]
  for (let i = 0; i < 40 && !(p2?.fechadoAntesDoFim || p2?.fimMs); i++) {
    await esperar(100)
    p2 = provedor.pedidos[antesB]
  }
  confere(
    p2?.fechadoAntesDoFim === true,
    `o abort do cliente não fechou a chamada do Worker ao provedor (${JSON.stringify(p2)}): o close não chegou ao sinalDoCliente`,
  )
  console.log(
    `✔ 9/9 "Como respondo?" em fluxo pelo Worker: ${resumo}; abort do cliente → o provedor viu a conexão fechar depois de ${p2.pedacos} de 5 pedaços`,
  )
}

/**
 * As travas de produção leem o NODE_ENV do RUNTIME (`env.NODE_ENV` com `env = process.env`), não o literal.
 * Um segundo `wrangler dev` com `METRICS_ENABLED=1` e sem `METRICS_TOKEN` tem de recusar servir (503
 * `boot_falhou`): prova o `fixarModo()` e o portão de boot de uma vez.
 */
async function travasDeProducao(supabaseUrl, persistir) {
  const porta = await portaLivre()
  const w = subirWrangler(porta, supabaseUrl, persistir, ['METRICS_ENABLED:1'])
  await esperarPronto(w)
  const r = await fetch(`http://127.0.0.1:${porta}/api/health`)
  const corpo = await r.json()
  confere(
    r.status === 503 && corpo.code === 'boot_falhou',
    `boot sem METRICS_TOKEN: ${r.status} ${JSON.stringify(corpo)}`,
  )
  for (let i = 0; i < 20 && !/boot_falhou.*METRICS_TOKEN/.test(w.saida()); i++) await esperar(250)
  confere(/boot_falhou.*METRICS_TOKEN/.test(w.saida()), `o log não trouxe boot_falhou:\n${w.saida().slice(-2000)}`)
  await derrubar(w)
  console.log('✔ travas de produção no runtime: METRICS_ENABLED=1 sem token → 503 boot_falhou')
}

let jwks
let persistir
let provedor

async function limpar() {
  for (const w of vivos) await derrubar(w)
  jwks?.servidor.close()
  provedor?.servidor.close()
  if (!URL_EXTERNA) spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' })
  if (persistir) rmSync(persistir, { recursive: true, force: true })
}

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.once(sinal, () => {
    console.error(`✘ interrompido (${sinal}): derrubando o wrangler e o container`)
    limpar().finally(() => process.exit(130))
  })
}

async function principal() {
  persistir = mkdtempSync(join(tmpdir(), 'babel-fumaca-worker-'))
  let w
  try {
    if (URL_EXTERNA) passo('Postgres externo (FUMACA_PG_URL)')
    else {
      passo(`Postgres 17 em Docker (${CONTAINER}, porta ${PORTA_PG})`)
      await subirPostgres()
    }
    passo('migrações (npm run db:migrate)')
    rodar('npx', ['tsx', 'server/db/migrate.ts'], { env: { ...process.env, DATABASE_URL: URL_PG } })
    jwks = await subirJwks()
    provedor = await subirProvedorSimulado(persistir)
    const porta = await portaLivre()
    passo(`wrangler dev na porta ${porta} (JWKS em ${jwks.url}, provedor simulado em ${provedor.base})`)
    w = subirWrangler(
      porta,
      jwks.url,
      persistir,
      [`IA_PROVEDORES:${JSON.stringify(provedor.registro)}`, 'SIMULADO_API_KEY:chave-falsa-da-fumaca'],
      /* O workerd aceita o certificado do provedor simulado (só este processo, só nesta fumaça). */
      { NODE_EXTRA_CA_CERTS: provedor.ca },
    )
    await esperarPronto(w)
    await verificacoes(`http://127.0.0.1:${porta}`, w, jwks.token, provedor)
    if (process.argv.includes('--verboso')) console.log(`--- saída do wrangler ---\n${w.saida()}`)
    await derrubar(w)
    await travasDeProducao(jwks.url, persistir)
    console.log('fumaça do Worker: 9/9')
  } catch (err) {
    console.error(`✘ ${err.message}`)
    if (w) console.error(`--- saída do wrangler (fim) ---\n${w.saida().slice(-4000)}`)
    process.exitCode = 1
  } finally {
    await limpar()
  }
}

await principal()
