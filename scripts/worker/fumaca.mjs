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
 * As quatro verificações:
 *   1. GET /api/health → 200 com `banco: 'postgres'`;
 *   2. JWT ES256 → GET /api/me 200 (e a idade adulta declarada, para as rotas de nuvem);
 *   3. POST /api/sessions + POST /api/sessions/:id/audio (1 MB) → 2xx; GET …/audio com Range → 206, 100 bytes;
 *   4. GET /cdn-cgi/local/scheduled?cron=17 3 * * * → 200 e a linha `job_fim` da poda das janelas no log.
 *
 * `--verboso` imprime a saída inteira do wrangler no fim. Sai com código ≠ 0 em qualquer falha. Encerra o wrangler (o grupo de processos inteiro) e o container
 * no fim, dando certo ou não.
 */
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { createServer as criarServidorTcp } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { exportJWK, generateKeyPair, SignJWT } from 'jose'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const CONTAINER = 'pg-worker-fumaca'
const PORTA_PG = 5434
const URL_PG = `postgres://postgres:teste@localhost:${PORTA_PG}/postgres`
const CRON = '17 3 * * *'
const JOB_DO_CRON = 'podaDasJanelasDiarias'
const MB = 1024 * 1024

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

function subirWrangler(porta, supabaseUrl, persistir) {
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
    ],
    {
      cwd: RAIZ,
      detached: true, // grupo próprio: o wrangler sobe o workerd como filho, e os dois saem juntos
      env: {
        ...process.env,
        CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: URL_PG,
        WRANGLER_SEND_METRICS: 'false',
        NO_COLOR: '1',
        FORCE_COLOR: '0',
      },
    },
  )
  filho.stdout.on('data', (d) => (saida += d))
  filho.stderr.on('data', (d) => (saida += d))
  return { filho, saida: () => saida }
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

async function verificacoes(base, w, token) {
  // 1. health
  const h = await fetch(`${base}/api/health`)
  const corpoH = await h.json()
  confere(h.status === 200 && corpoH.banco === 'postgres', `health: ${h.status} ${JSON.stringify(corpoH)}`)
  console.log(`✔ 1/4 GET /api/health → 200, banco=${corpoH.banco}`)

  // 2. JWT ES256 → /api/me
  const sub = `fumaca-${randomBytes(4).toString('hex')}`
  const jwt = await token(sub)
  const auth = { authorization: `Bearer ${jwt}` }
  const semToken = await fetch(`${base}/api/me`)
  confere(semToken.status === 401, `/api/me sem token deveria ser 401, veio ${semToken.status}`)
  const me = await fetch(`${base}/api/me`, { headers: auth })
  confere(me.status === 200, `/api/me: ${me.status} ${(await me.text()).slice(0, 300)}`)
  const idade = await fetch(`${base}/api/me/idade`, {
    method: 'PUT',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ nascimento: '1990-01-01' }),
  })
  confere(idade.status === 200, `PUT /api/me/idade: ${idade.status} ${(await idade.text()).slice(0, 300)}`)
  /* `ehWorker()` de verdade no workerd: a importação pesada responde 503 só lá (no Node seria 400/200). */
  const web = await fetch(`${base}/api/import/web`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/' }),
  })
  const corpoWeb = await web.json()
  confere(
    web.status === 503 && corpoWeb.code === 'indisponivel_neste_runtime',
    `POST /api/import/web no Worker: ${web.status} ${JSON.stringify(corpoWeb)}`,
  )
  console.log('✔ 2/4 JWT ES256 (JWKS local) → GET /api/me 200 (sem token: 401; import web: 503 no runtime)')

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
    `✔ 3/4 POST /api/sessions + upload de 1 MB → ${up.status}; GET …/audio Range bytes=0-99 → 206 (100 bytes iguais)`,
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
  console.log(`✔ 4/4 cron "${CRON}" → 200; log: ${linha.trim().slice(0, 200)}`)
}

async function principal() {
  const persistir = mkdtempSync(join(tmpdir(), 'babel-fumaca-worker-'))
  let jwks
  let w
  try {
    passo(`Postgres 17 em Docker (${CONTAINER}, porta ${PORTA_PG})`)
    await subirPostgres()
    passo('migrações (npm run db:migrate)')
    rodar('npx', ['tsx', 'server/db/migrate.ts'], { env: { ...process.env, DATABASE_URL: URL_PG } })
    jwks = await subirJwks()
    const porta = await portaLivre()
    passo(`wrangler dev na porta ${porta} (JWKS em ${jwks.url})`)
    w = subirWrangler(porta, jwks.url, persistir)
    await esperarPronto(w)
    await verificacoes(`http://127.0.0.1:${porta}`, w, jwks.token)
    console.log('fumaça do Worker: 4/4')
    if (process.argv.includes('--verboso')) console.log(`--- saída do wrangler ---\n${w.saida()}`)
  } catch (err) {
    console.error(`✘ ${err.message}`)
    if (w) console.error(`--- saída do wrangler (fim) ---\n${w.saida().slice(-4000)}`)
    process.exitCode = 1
  } finally {
    if (w && w.filho.exitCode === null) {
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
    jwks?.servidor.close()
    spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' })
    rmSync(persistir, { recursive: true, force: true })
  }
}

await principal()
