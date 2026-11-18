#!/usr/bin/env node
/**
 * O /app SERVIDO COMO O WORKER, NA MÁQUINA (carga-rapida-no-celular, 1.1 e 2.5): para medir o LCP do celular contra o
 * build LOCAL de produção, sem depender do staging.
 *
 *   VITE_AUTH_REQUIRED=1 VITE_SUPABASE_URL=https://exemplo-local.supabase.co VITE_SUPABASE_ANON_KEY=anon npx vite build
 *   node scripts/perf/app-no-worker-local.mjs [--porta=8799] [--lighthouse] [--execucoes=3] [--rota=/app]
 *        [--throttling-method=devtools] [--saida=<pasta>] [--manter]
 *
 * Sobe:
 *   - Postgres 17 em Docker (container `pg-worker-lcp`, porta 5435), migrado: o `/api/flags` e o `/api/ready` do
 *     Worker respondem como em produção;
 *   - `wrangler dev -c wrangler.jsonc` servindo o `dist/` pelo binding ASSETS (o `siteNoWorker` decide `/app`);
 *   - na frente, um PROXY que comprime em brotli como a borda da Cloudflare (o `wrangler dev` responde sem
 *     compressão, e o JS transferido sairia três vezes maior que o de produção).
 *
 * `--lighthouse` roda o Lighthouse mobile (`--throttling-method=devtools` por padrão: o estrangulamento real da
 * auditoria) `--execucoes` vezes e imprime, por corrida e na mediana, o LCP e o JS até o LCP
 * (`chunks-antes-do-lcp.mjs`). `--manter` deixa tudo de pé até Ctrl-C (para outras medições na mesma URL).
 * Derruba o wrangler e o container no fim.
 */
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import http from 'node:http'
import http2 from 'node:http2'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants } from 'node:zlib'

import { analisar, avaliarAppMobile } from './chunks-antes-do-lcp.mjs'
import { carregarSlo } from './suite/slo.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const flag = (n) => process.argv.includes(`--${n}`)
const PORTA = Number(arg('porta', 8799))
const PORTA_WRANGLER = PORTA + 1
const CONTAINER = 'pg-worker-lcp'
const PORTA_PG = 5435
const URL_PG = `postgres://postgres:teste@localhost:${PORTA_PG}/postgres`
const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

function rodar(cmd, args, opcoes = {}) {
  const r = spawnSync(cmd, args, { cwd: RAIZ, encoding: 'utf8', ...opcoes })
  if (r.status !== 0)
    throw new Error(`${cmd} ${args.join(' ')} falhou (${r.status}): ${(r.stderr || r.stdout).slice(-800)}`)
  return r.stdout
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
  const pronto = () =>
    spawnSync('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres', '-h', '127.0.0.1'], { stdio: 'ignore' })
      .status === 0
  for (let i = 0; i < 60; i++) {
    if (pronto()) {
      await esperar(1000)
      if (pronto()) return
    }
    await esperar(1000)
  }
  throw new Error('Postgres do Docker não ficou pronto em 60 s')
}

let wrangler = null
function subirWrangler(persistir) {
  let saida = ''
  wrangler = spawn(
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
      String(PORTA_WRANGLER),
      '--persist-to',
      persistir,
      '--show-interactive-dev-session=false',
      '--var',
      'SUPABASE_URL:https://exemplo-local.supabase.co',
      '--var',
      `SECRET_KEY:${randomBytes(32).toString('hex')}`,
    ],
    {
      cwd: RAIZ,
      detached: true,
      env: {
        ...process.env,
        CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: URL_PG,
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
        WRANGLER_SEND_METRICS: 'false',
        NO_COLOR: '1',
      },
    },
  )
  wrangler.stdout.on('data', (d) => (saida += d))
  wrangler.stderr.on('data', (d) => (saida += d))
  return () => saida
}

/** A borda: brotli nos textos (q5, perto do que a Cloudflare usa no dinâmico; os assets estáticos ela serve em br). */
function subirProxy() {
  const comprimivel = /^(text\/|application\/(javascript|json|manifest\+json|xml)|image\/svg)/
  const cache = new Map()
  /* HTTP/2 com TLS, como a borda: em HTTP/1.1 o Chrome abre 6 conexões por host e, com a latência de 562 ms do
     estrangulamento por pedido, os ~100 pedaços pequenos fazem fila (o LCP local saía o dobro do de produção).
     Certificado autoassinado gerado agora; o Chrome do Lighthouse roda com `--ignore-certificate-errors`. */
  const dir = mkdtempSync(join(tmpdir(), 'babel-lcp-cert-'))
  rodar('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '2',
    '-subj',
    '/CN=127.0.0.1',
    '-keyout',
    join(dir, 'k.pem'),
    '-out',
    join(dir, 'c.pem'),
  ])
  const servidor = http2.createSecureServer(
    { key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')), allowHTTP1: true },
    (req, res) => {
      const pedido = http.request(
        {
          host: '127.0.0.1',
          port: PORTA_WRANGLER,
          path: req.url,
          method: req.method,
          headers: { ...semPseudo(req.headers), host: `127.0.0.1:${PORTA}`, 'accept-encoding': 'identity' },
        },
        (resp) => {
          const partes = []
          resp.on('data', (d) => partes.push(d))
          resp.on('end', () => {
            let corpo = Buffer.concat(partes)
            const cabecalhos = { ...resp.headers }
            delete cabecalhos['content-length']
            for (const k of ['transfer-encoding', 'connection', 'keep-alive']) delete cabecalhos[k]
            const tipo = String(cabecalhos['content-type'] ?? '')
            if (
              /\bbr\b/.test(String(req.headers['accept-encoding'] ?? '')) &&
              comprimivel.test(tipo) &&
              corpo.length > 512
            ) {
              const chave = `${req.url}:${corpo.length}`
              let br = cache.get(chave)
              if (!br) {
                br = brotliCompressSync(corpo, {
                  params: { [constants.BROTLI_PARAM_QUALITY]: req.url.startsWith('/assets/') ? 11 : 5 },
                })
                cache.set(chave, br)
              }
              corpo = br
              cabecalhos['content-encoding'] = 'br'
              cabecalhos.vary = 'accept-encoding'
            }
            cabecalhos['content-length'] = String(corpo.length)
            res.writeHead(resp.statusCode ?? 502, cabecalhos)
            res.end(corpo)
          })
        },
      )
      pedido.on('error', () => {
        res.writeHead(502)
        res.end()
      })
      req.pipe(pedido)
    },
  )
  return new Promise((ok) => servidor.listen(PORTA, '127.0.0.1', () => ok(servidor)))
}

/** Os cabeçalhos do HTTP/2 que começam com `:` não passam para um pedido HTTP/1.1. */
function semPseudo(h) {
  return Object.fromEntries(Object.entries(h).filter(([k]) => !k.startsWith(':')))
}

/** O Lighthouse num processo à parte, sem travar o laço de eventos (o proxy mora neste processo). */
function rodarLighthouse(args) {
  return new Promise((ok) => {
    const filho = spawn(process.execPath, args, { cwd: RAIZ, stdio: ['ignore', 'ignore', 'pipe'] })
    let erro = ''
    filho.stderr.on('data', (d) => (erro += d))
    const prazo = setTimeout(() => filho.kill('SIGKILL'), 240_000)
    filho.on('exit', (status) => {
      clearTimeout(prazo)
      ok({ status, stderr: erro })
    })
  })
}

function derrubar() {
  if (wrangler && wrangler.exitCode === null) {
    try {
      process.kill(-wrangler.pid, 'SIGTERM')
    } catch {
      /* já saiu */
    }
  }
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' })
}

async function principal() {
  if (!existsSync(join(RAIZ, 'dist', 'index.html'))) throw new Error('sem dist/: rode o build (ver o cabeçalho)')
  const persistir = mkdtempSync(join(tmpdir(), 'babel-lcp-worker-'))
  console.log(`· Postgres 17 em Docker (${CONTAINER}, porta ${PORTA_PG})`)
  await subirPostgres()
  console.log('· migrações')
  rodar('npx', ['tsx', 'server/db/migrate.ts'], { env: { ...process.env, DATABASE_URL: URL_PG } })
  console.log(`· wrangler dev na porta ${PORTA_WRANGLER}`)
  const saida = subirWrangler(persistir)
  for (let t0 = Date.now(); ; ) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORTA_WRANGLER}/api/ready`)).ok) break
    } catch {
      /* ainda subindo */
    }
    if (Date.now() - t0 > 120_000) throw new Error(`wrangler não ficou pronto:\n${saida().slice(-3000)}`)
    await esperar(500)
  }
  const proxy = await subirProxy()
  const base = `https://127.0.0.1:${PORTA}`
  console.log(`· app como o Worker em ${base}/app (brotli na frente)`)

  if (flag('lighthouse')) {
    const rota = arg('rota', '/app')
    const execucoes = Number(arg('execucoes', 3))
    const metodo = arg('throttling-method', 'devtools')
    const saidaDir = arg('saida', join(tmpdir(), `lcp-worker-${Date.now()}`))
    mkdirSync(saidaDir, { recursive: true })
    const lh = join(RAIZ, 'node_modules/lighthouse/cli/index.js')
    const resultados = []
    for (let n = 1; n <= execucoes + 1; n++) {
      const arquivo = join(saidaDir, `mobile-${rota.replace(/\W+/g, '') || 'raiz'}-${n}.json`)
      const p = await rodarLighthouse([
        lh,
        base + rota,
        '--output=json',
        `--output-path=${arquivo}`,
        '--only-categories=performance',
        `--throttling-method=${metodo}`,
        '--chrome-flags=--headless=new --no-first-run --ignore-certificate-errors',
        '--quiet',
      ])
      if (p.status !== 0) {
        console.log(`#${n} falhou: ${p.stderr?.slice(-400)}`)
        continue
      }
      const r = analisar(JSON.parse(readFileSync(arquivo, 'utf8')))
      /* A 1ª corrida aquece o proxy (brotli q11 de cada asset): fica fora da mediana. */
      if (n === 1) {
        console.log(`aquecimento: LCP ${r.lcp} ms`)
        continue
      }
      resultados.push(r)
      console.log(
        `#${n - 1}: LCP ${r.lcp} ms · FCP ${r.fcp} ms · ${r.scriptsAteLcp} scripts, ${r.jsAteLcpKB} KB de JS até o LCP · antes do LCP: ${r.vigiadosAntes.join(', ') || 'nenhum vigiado'} (${arquivo})`,
      )
    }
    const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    const metas = carregarSlo().frontend.appMobile
    console.log(
      `MEDIANA (${resultados.length}): LCP ${med(resultados.map((r) => r.lcp))} ms · JS até o LCP ${med(resultados.map((r) => r.jsAteLcpKB))} KB`,
    )
    if (rota === metas.rota && metodo === 'devtools') {
      const falhas = avaliarAppMobile(
        { lcp: med(resultados.map((r) => r.lcp)), jsAteLcpKB: med(resultados.map((r) => r.jsAteLcpKB)) },
        metas,
      )
      console.log(
        falhas.length
          ? `FORA DA META: ${falhas.join('; ')}`
          : `dentro da meta (LCP ≤ ${metas.lcpMaxMs} ms, JS até o LCP ≤ ${metas.jsAteLcpMaxKB} KB)`,
      )
      if (falhas.length) process.exitCode = 1
    }
  }

  if (flag('manter')) {
    console.log('· de pé; Ctrl-C para derrubar')
    await new Promise((ok) => process.once('SIGINT', ok))
  }
  proxy.close()
}

process.on('SIGTERM', () => {
  derrubar()
  process.exit(143)
})
try {
  await principal()
} catch (e) {
  console.error(e)
  process.exitCode = 1
} finally {
  derrubar()
}
