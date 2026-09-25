#!/usr/bin/env node
/* global AbortSignal */
/**
 * SERVIDOR REAL SOB CARGA — auditoria de prontidão, Fase 2, item 2.
 *
 *   node scripts/perf/escala/carga-servidor.mjs --bundle=<server.cjs> --db=<CÓPIA semeada> \
 *        [--modo=selfhost|publico] [--porta=3140] [--conexoes=10,50,100,200] [--duracao=15] \
 *        [--rotas=abertura,settings,vocab,profile,sessions,review,gastar,vocab-revalida,vocab-quente,
 *                 profile-quente,settings-put]
 *        [--mesmo-ip] [--saida=x.json]
 *
 * O bundle é o MESMO comando de build do package.json (`esbuild server.ts --bundle --platform=node
 * --format=cjs --packages=external`), gerado fora do repositório; roda com NODE_ENV=production, que
 * é como o Fly roda (sem o middleware do Vite, que inflaria RSS e CPU).
 *
 * MODOS
 *   selfhost  AUTH_REQUIRED=0 + SELF_HOST=1: todo request vira `local-owner` (o perfil "mega" do
 *             semeador). Sem JWT, sem limitadores, sem checagem de idade — é o piso do custo.
 *   publico   AUTH_REQUIRED=1 como em produção. Um JWKS LOCAL (ES256, igual ao projeto Supabase
 *             novo) é servido em porta+1 e SUPABASE_URL aponta para ele: o `authMiddleware` de
 *             produção verifica cada token de verdade. Cada requisição usa o token de um usuário do
 *             pool (u-p-* nas leituras, u-l-* nas escritas) e, salvo `--mesmo-ip`, um
 *             X-Forwarded-For próprio por conexão (TRUST_PROXY=1), como atrás do proxy do Fly.
 *
 * MEDIDAS por rota × conexões: req/s, p50/p95/p99 (de CADA resposta, não do histograma resumido do
 * autocannon, que não tem p95), erros de socket/timeout, distribuição de status, e — pela sonda
 * pré-carregada (`sonda-processo.cjs`) — RSS máximo, CPU média (% de um núcleo) e atraso máximo do
 * event loop do PROCESSO DO SERVIDOR. O servidor é encerrado pelo PID do filho ao final.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import autocannon from 'autocannon'
import { SignJWT, exportJWK, generateKeyPair, jwtVerify } from 'jose'

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`))
  return a ? a.slice(n.length + 3) : d
}
const flag = (n) => process.argv.includes(`--${n}`)
const bundle = arg('bundle', '')
const banco = arg('db', '')
if (!bundle || !banco) {
  console.error(
    'uso: node scripts/perf/escala/carga-servidor.mjs --bundle=<server.cjs> --db=<cópia.db> [--modo=publico]',
  )
  process.exit(2)
}
const modo = arg('modo', 'selfhost')
const porta = Number(arg('porta', 3140))
const niveis = arg('conexoes', '10,50,100,200').split(',').map(Number)
/* Rotas que custam centenas de ms por chamada saturam com poucas conexões: medir 200 nelas só
   produz timeout. Elas recebem a própria escada (a primeira rodada, com a escada única, mostrou
   p50 de 3,2 s já em 10 conexões no GET /api/vocab). */
const LENTAS = new Set(arg('lentas', 'vocab,profile,gastar').split(','))
const niveisLentos = arg('conexoes-lentas', '1,2,5,10,50').split(',').map(Number)
const duracao = Number(arg('duracao', 15))
const rotas = arg('rotas', 'abertura,settings,vocab,profile,sessions,review,gastar').split(',')
const mesmoIp = flag('mesmo-ip')
const saida = arg('saida', '')
const RAIZ = path.resolve(import.meta.dirname, '..', '..', '..')
const tmp = path.dirname(path.resolve(banco))
const sonda = path.join(tmp, `sonda-${modo}-${porta}.jsonl`)
if (existsSync(sonda)) rmSync(sonda)
const base = `http://127.0.0.1:${porta}`
const pad = (i) => String(i).padStart(4, '0')

// ── JWKS local + tokens (modo público) ────────────────────────────────────────────────────────
let jwks = null
const tokens = new Map()
let custoJwt = null
if (modo === 'publico') {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const jwk = { ...(await exportJWK(publicKey)), kid: 'perf', alg: 'ES256', use: 'sig' }
  const portaJwks = porta + 1
  const iss = `http://127.0.0.1:${portaJwks}/auth/v1`
  jwks = createServer((req, res) => {
    if (req.url === '/auth/v1/.well-known/jwks.json') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ keys: [jwk] }))
    } else {
      res.statusCode = 404
      res.end()
    }
  }).listen(portaJwks, '127.0.0.1')
  const assinar = (sub) =>
    new SignJWT({ role: 'authenticated', aal: 'aal1' })
      .setProtectedHeader({ alg: 'ES256', kid: 'perf' })
      .setSubject(sub)
      .setAudience('authenticated')
      .setIssuer(iss)
      .setIssuedAt()
      .setExpirationTime('6h')
      .sign(privateKey)
  for (let i = 0; i < 200; i++) tokens.set(`u-p-${pad(i)}`, await assinar(`u-p-${pad(i)}`))
  for (let i = 0; i < 2000; i++) tokens.set(`u-l-${pad(i)}`, await assinar(`u-l-${pad(i)}`))
  // Custo puro da verificação ES256 (a mesma `jose` e as mesmas opções do createVerifier).
  const t = tokens.get('u-p-0000')
  for (let i = 0; i < 200; i++)
    await jwtVerify(t, publicKey, {
      audience: 'authenticated',
      issuer: iss,
      algorithms: ['ES256'],
      requiredClaims: ['exp'],
    })
  const N = 5000
  const a = performance.now()
  for (let i = 0; i < N; i++)
    await jwtVerify(t, publicKey, {
      audience: 'authenticated',
      issuer: iss,
      algorithms: ['ES256'],
      requiredClaims: ['exp'],
    })
  const ms = performance.now() - a
  custoJwt = {
    verificacoes: N,
    usPorVerificacao: Math.round((ms / N) * 1000),
    verificacoesPorSegundoUmNucleo: Math.round(N / (ms / 1000)),
  }
  console.log('# custo jwtVerify ES256:', JSON.stringify(custoJwt))
}

// ── servidor ──────────────────────────────────────────────────────────────────────────────────
const audioDir = path.join(tmp, `audio-${modo}`)
mkdirSync(audioDir, { recursive: true })
const env = {
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  NODE_PATH: path.join(RAIZ, 'node_modules'),
  NODE_ENV: 'production',
  PORT: String(porta),
  HOST: '127.0.0.1',
  DATABASE_URL: `file:${path.resolve(banco).replace(/\\/g, '/')}`,
  AUDIO_DIR: audioDir,
  BACKUP_DIARIO: '0',
  SECRET_KEY: randomBytes(32).toString('hex'), // exigido em produção (server/crypto.ts); descartável
  TRUST_PROXY: '1',
  LOG_LEVEL: 'error',
  SONDA_ARQUIVO: sonda,
  ...(modo === 'publico'
    ? { AUTH_REQUIRED: '1', SUPABASE_URL: `http://127.0.0.1:${porta + 1}` }
    : { AUTH_REQUIRED: '0', SELF_HOST: '1' }),
}
const logServidor = path.join(tmp, `servidor-${modo}-${porta}.log`)
const filho = spawn(
  process.execPath,
  ['-r', path.join(RAIZ, 'scripts/perf/escala/sonda-processo.cjs'), path.resolve(bundle)],
  {
    cwd: RAIZ,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
const logs = []
filho.stdout.on('data', (d) => logs.push(String(d)))
filho.stderr.on('data', (d) => logs.push(String(d)))
let morreu = null
filho.on('exit', (c, s) => (morreu = { c, s }))
console.log(`# servidor PID ${filho.pid} (${modo}) em ${base}`)

const encerrar = () => {
  try {
    writeFileSync(logServidor, logs.join(''))
  } catch {}
  if (!morreu) filho.kill() // SÓ o processo que este script iniciou, pelo PID do filho
  jwks?.close()
}
process.on('exit', encerrar)
process.on('SIGINT', () => process.exit(130))

const inicio = Date.now()
for (;;) {
  if (morreu) {
    console.error('servidor morreu no boot:', morreu, logs.join('').slice(-3000))
    process.exit(1)
  }
  try {
    const r = await fetch(`${base}/api/ready`)
    if (r.ok) break
  } catch {}
  if (Date.now() - inicio > 120_000) {
    console.error('servidor não ficou pronto em 120 s', logs.join('').slice(-3000))
    process.exit(1)
  }
  await new Promise((r) => setTimeout(r, 300))
}
console.log(`# pronto em ${Date.now() - inicio} ms`)

// ── cenários ──────────────────────────────────────────────────────────────────────────────────
let seq = 0
const json = { 'content-type': 'application/json' }
const auth = (u) => (modo === 'publico' ? { authorization: `Bearer ${tokens.get(u)}` } : {})
const pesado = (i) => (modo === 'publico' ? `u-p-${pad(i % 200)}` : 'local-owner')
const quente = (i) => (modo === 'publico' ? `u-p-${pad(i % 10)}` : 'local-owner')
const etags = new Map()
async function prepararRevalidacao() {
  const usuarios = modo === 'publico' ? Array.from({ length: 200 }, (_, i) => `u-p-${pad(i)}`) : ['local-owner']
  for (const u of usuarios) {
    const r = await fetch(`${base}/api/vocab`, { headers: auth(u) })
    await r.arrayBuffer()
    const etag = r.headers.get('etag')
    if (etag) etags.set(u, etag)
  }
  console.log(`# revalidação: ${etags.size} ETags colhidos`)
}
const CENARIOS = {
  abertura: () => ({ method: 'GET', path: '/api/abertura', headers: {} }),
  settings: (i) => ({ method: 'GET', path: '/api/settings', headers: auth(pesado(i)) }),
  vocab: (i) => ({ method: 'GET', path: '/api/vocab', headers: auth(pesado(i)) }),
  profile: (i) => ({ method: 'GET', path: '/api/metrics/profile', headers: auth(pesado(i)) }),
  sessions: (i) => ({ method: 'GET', path: '/api/sessions', headers: auth(pesado(i)) }),
  review: (i) => {
    if (modo === 'publico') {
      const u = `u-l-${pad(i % 2000)}`
      return {
        method: 'POST',
        path: `/api/vocab/c-${u}-${Math.floor(i / 2000) % 20}/review`,
        headers: { ...json, ...auth(u) },
        body: '{"grade":3}',
      }
    }
    return { method: 'POST', path: `/api/vocab/c-local-owner-${i % 3000}/review`, headers: json, body: '{"grade":3}' }
  },
  /* REVALIDAÇÃO (fix/rotas-caras): o navegador e o `fetchDeck` mandam o ETag que já têm. Os ETags são
     colhidos por `prepararRevalidacao()` antes da rodada, um por usuário do pool. */
  'vocab-revalida': (i) => {
    const u = pesado(i)
    const etag = etags.get(u)
    return { method: 'GET', path: '/api/vocab', headers: { ...auth(u), ...(etag ? { 'if-none-match': etag } : {}) } }
  },
  /* LEITURA REPETIDA (fix/rotas-caras): o mesmo punhado de dez usuários, sem ETag — o caso de quem
     navega entre telas sem escrever nada no meio. `vocab`/`profile` acima rodam 200 usuários em
     rodízio, e com ~70 requisições por rodada cada uma é a PRIMEIRA daquele usuário: medem o
     caminho frio (logo depois de uma escrita). Estes dois medem o caminho quente. */
  'vocab-quente': (i) => ({ method: 'GET', path: '/api/vocab', headers: auth(quente(i)) }),
  'profile-quente': (i) => ({ method: 'GET', path: '/api/metrics/profile', headers: auth(quente(i)) }),
  /* PUT /api/settings com SEIS campos de item do catálogo, todos grátis no nível 1: cada um passava
     pela conferência de posse (`recusaDePosse`), que recalculava a economia inteira por campo. */
  'settings-put': (i) => ({
    method: 'PUT',
    path: '/api/settings',
    headers: { ...json, ...auth(pesado(i)) },
    body: JSON.stringify({
      ui: { theme: 'babel', fonte: 'padrao', menuPosition: 'top', pack: 'classico', cursor: 'padrao', rastro: 'off' },
    }),
  }),
  gastar: (i) => ({
    method: 'POST',
    path: '/api/metrics/seeds/gastar',
    headers: { ...json, ...auth(pesado(i)) },
    body: JSON.stringify({ spendId: `perf-${process.pid}-${i}-${Date.now()}`, amount: 40, reason: 'pular-rodada' }),
  }),
}

function lerSonda(de, ate) {
  if (!existsSync(sonda)) return {}
  const ls = readFileSync(sonda, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
    .filter((l) => l.t >= de && l.t <= ate)
  if (!ls.length) return {}
  return {
    rssMaxMB: Math.round(Math.max(...ls.map((l) => l.rss)) / 1048576),
    cpuMediaPct: Math.round(ls.reduce((a, l) => a + l.cpu, 0) / ls.length),
    cpuMaxPct: Math.round(Math.max(...ls.map((l) => l.cpu))),
    loopP99MaxMs: Math.max(...ls.map((l) => l.loopP99)),
    loopMaxMs: Math.max(...ls.map((l) => l.loopMax), ...ls.map((l) => l.atraso ?? 0)),
    amostrasSonda: ls.length,
  }
}
const pct = (s, p) => (s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null)

async function rodar(nome, conexoes, segundos) {
  const fab = CENARIOS[nome]
  const lat = []
  const status = {}
  const de = Date.now()
  const inst = autocannon({
    url: base,
    connections: conexoes,
    duration: segundos,
    timeout: 30,
    requests: [
      {
        setupRequest: (req, ctx) => {
          const i = seq++
          const r = fab(i)
          const ip = mesmoIp
            ? {}
            : { 'x-forwarded-for': `10.${(ctx.__c ??= Math.floor(Math.random() * 65000)) >> 8}.${ctx.__c & 255}.7` }
          return { ...req, method: r.method, path: r.path, body: r.body, headers: { ...r.headers, ...ip } }
        },
      },
    ],
  })
  inst.on('response', (_c, code, _b, t) => {
    lat.push(t)
    status[code] = (status[code] ?? 0) + 1
  })
  const r = await inst
  const ate = Date.now()
  lat.sort((a, b) => a - b)
  const total = lat.length + r.errors + r.timeouts
  const ruins =
    r.errors +
    r.timeouts +
    Object.entries(status)
      .filter(([c]) => Number(c) >= 500)
      .reduce((a, [, n]) => a + n, 0)
  const nao2xx = Object.entries(status)
    .filter(([c]) => Number(c) >= 300)
    .reduce((a, [, n]) => a + n, 0)
  return {
    rota: nome,
    conexoes,
    reqPorSeg: Math.round(lat.length / segundos),
    p50: pct(lat, 50),
    p95: pct(lat, 95),
    p99: pct(lat, 99),
    max: lat.at(-1) ?? null,
    respostas: lat.length,
    errosSocket: r.errors,
    timeouts: r.timeouts,
    status,
    pctErro5xxOuSocket: total ? Math.round((ruins / total) * 10000) / 100 : 0,
    pctNao2xx: total ? Math.round(((nao2xx + r.errors + r.timeouts) / total) * 10000) / 100 : 0,
    kbPorResposta: lat.length ? Math.round(r.throughput.total / lat.length / 102.4) / 10 : 0,
    ...lerSonda(de, ate),
  }
}

/**
 * ESPERA O SERVIDOR ESVAZIAR entre cenários. O autocannon para de enviar no fim da janela, mas o
 * servidor continua processando o que já aceitou — na primeira rodada, o acúmulo do GET /api/vocab
 * com 200 conexões zerou as três rotas seguintes. Só segue quando /api/abertura (sem banco) volta
 * a responder em < 30 ms três vezes seguidas.
 */
async function esvaziar() {
  const t0 = Date.now()
  let ok = 0
  while (ok < 3 && Date.now() - t0 < 300_000) {
    const a = performance.now()
    try {
      await fetch(`${base}/api/abertura`, { signal: AbortSignal.timeout(60_000) })
      ok = performance.now() - a < 30 ? ok + 1 : 0
    } catch {
      ok = 0
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return Date.now() - t0
}

const resultados = []
console.log(`# modo=${modo} duracao=${duracao}s niveis=${niveis} mesmoIp=${mesmoIp} node=${process.version}`)
console.log(
  '| rota | conexões | req/s | p50 | p95 | p99 | erro% (5xx+socket) | não-2xx% | status | RSS máx MB | CPU média % | loop máx ms | ms p/ esvaziar |',
)
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|')
for (const nome of rotas) {
  if (nome === 'vocab-revalida') await prepararRevalidacao()
  await rodar(nome, LENTAS.has(nome) ? 1 : 10, 3) // aquecimento descartado
  await esvaziar()
  for (const c of LENTAS.has(nome) ? niveisLentos : niveis) {
    if (morreu) break
    const l = await rodar(nome, c, duracao)
    l.msParaEsvaziar = await esvaziar()
    resultados.push(l)
    console.log(
      `| ${l.rota} | ${l.conexoes} | ${l.reqPorSeg} | ${l.p50} | ${l.p95} | ${l.p99} | ${l.pctErro5xxOuSocket} | ${l.pctNao2xx} | ${JSON.stringify(l.status)} | ${l.rssMaxMB} | ${l.cpuMediaPct} | ${l.loopMaxMs} | ${l.msParaEsvaziar} |`,
    )
    await new Promise((r) => setTimeout(r, 1500))
  }
}
if (morreu) console.error('SERVIDOR MORREU DURANTE A CARGA:', morreu)
const quebra = {}
for (const nome of rotas) {
  const q = resultados.find((l) => l.rota === nome && (l.p95 === null || l.p95 > 1000 || l.pctErro5xxOuSocket > 1))
  quebra[nome] = q
    ? `${q.conexoes} conexões (p95 ${q.p95} ms, erro ${q.pctErro5xxOuSocket}%)`
    : `não quebrou até ${Math.max(...(LENTAS.has(nome) ? niveisLentos : niveis))}`
}
console.log('# ponto de quebra (p95 > 1 s ou erro > 1%):', JSON.stringify(quebra))
if (saida)
  writeFileSync(
    saida,
    JSON.stringify(
      { modo, mesmoIp, duracao, node: process.version, em: new Date().toISOString(), custoJwt, resultados, quebra },
      null,
      2,
    ),
  )
process.exit(0)
