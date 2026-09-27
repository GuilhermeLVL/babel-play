#!/usr/bin/env node
/* global AbortSignal, window, PerformanceObserver */
/**
 * FRONTEND EM PRODUÇÃO — Lighthouse e Core Web Vitals das rotas principais (Fase 4).
 *
 *   npm run build
 *   node scripts/perf/frontend.mjs [--rotas=/,/capturar,/jogar,/planos] [--execucoes=3]
 *        [--sem-lighthouse] [--sem-cwv] [--porta=3180] [--saida=<pasta>] [--raiz=<pasta com dist/>]
 *
 * Sobe o SERVIDOR DE PRODUÇÃO (`dist-server/server.cjs`, NODE_ENV=production, que serve o `dist`
 * com `server/http/estaticos.ts` e o `compression`) em modo self-host, com um banco preparado pela
 * suíte de carga (`suite/preparar.mjs`: o usuário `local-owner` com 3.000 cartões e 5 sessões) e o
 * onboarding marcado como feito — a tela medida é a que um usuário com dados vê, não o onboarding.
 *
 * 1. LIGHTHOUSE 13 (CLI do node_modules, Chrome instalado), presets mobile (padrão: Moto G
 *    simulado, 4× CPU, 4G lento) e desktop, `--execucoes` vezes cada; grava `<preset>-<rota>-<n>.json`
 *    em `--saida` — o formato de `scripts/perf/resumir-lighthouse.mjs`, que dá a mediana.
 * 2. CORE WEB VITALS no Playwright (Chromium), por PerformanceObserver (o pacote `web-vitals` não
 *    é dependência): LCP e CLS da carga, e um INP APROXIMADO — a maior `duration` de evento
 *    (`event`, limiar 16 ms) ao clicar no primeiro botão visível da tela. Mais: bytes de JS
 *    transferidos na carga (Resource Timing) e os cabeçalhos de um chunk de `/assets/`.
 *
 * O servidor é derrubado pelo PID do filho que este script iniciou.
 */
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, devices } from 'playwright'

import { preparar } from './suite/preparar.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const flag = (n) => process.argv.includes(`--${n}`)
const rotas = arg('rotas', '/,/capturar,/jogar,/planos').split(',')
const execucoes = Number(arg('execucoes', 3))
const porta = Number(arg('porta', 3180))
// `--raiz`: pasta com `dist/` e `dist-server/` a servir (padrão: o repositório) — p.ex. uma cópia do build de antes.
const SERVIDA = path.resolve(arg('raiz', RAIZ))
const saida = path.resolve(arg('saida', path.join(os.tmpdir(), `frontend-${Date.now()}`)))
const base = `http://127.0.0.1:${porta}`
mkdirSync(saida, { recursive: true })

const banco = path.join(saida, 'frontend.db')
if (!existsSync(banco)) console.log(`# banco: ${JSON.stringify(await preparar({ db: banco, pesados: 0, medios: 0 }))}`)

const filho = spawn(process.execPath, [path.join(SERVIDA, 'dist-server/server.cjs')], {
  cwd: SERVIDA,
  env: {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    NODE_ENV: 'production',
    PORT: String(porta),
    HOST: '127.0.0.1',
    DATABASE_URL: `file:${banco.replace(/\\/g, '/')}`,
    MIGRATIONS_DIR: path.join(RAIZ, 'server/db/migrations'),
    AUDIO_DIR: path.join(saida, 'audio'),
    BACKUP_DIARIO: '0',
    SECRET_KEY: randomBytes(32).toString('hex'),
    AUTH_REQUIRED: '0',
    SELF_HOST: '1',
    TRUST_PROXY: 'false',
    LOG_LEVEL: 'error',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let morreu = null
filho.on('exit', (c, s) => (morreu = { c, s }))
process.on('exit', () => !morreu && filho.kill()) // só o processo que este script iniciou
for (let t0 = Date.now(); ; ) {
  if (morreu) throw new Error(`servidor morreu no boot: ${JSON.stringify(morreu)}`)
  try {
    if ((await fetch(`${base}/api/ready`, { signal: AbortSignal.timeout(2000) })).ok) break
  } catch {}
  if (Date.now() - t0 > 90_000) throw new Error('servidor não ficou pronto em 90 s')
  await new Promise((r) => setTimeout(r, 300))
}
const r = await fetch(`${base}/api/settings`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ ui: { onboarded: true, providerMode: 'local', credentialId: null } }),
})
if (!r.ok) throw new Error(`PUT /api/settings ${r.status}`)
console.log(`# servidor de produção PID ${filho.pid} em ${base}; saída em ${saida}`)

const nomeDaRota = (r) => (r === '/' ? 'inicio' : r.replace(/^\//, '').replace(/\//g, '-'))

// ── 1. Lighthouse ─────────────────────────────────────────────────────────────────────────────
if (!flag('sem-lighthouse')) {
  const cli = path.join(RAIZ, 'node_modules/lighthouse/cli/index.js')
  const cliPai = path.resolve(RAIZ, '../../../node_modules/lighthouse/cli/index.js')
  const lh = existsSync(cli) ? cli : cliPai
  for (const preset of ['mobile', 'desktop'])
    for (const rota of rotas)
      for (let n = 1; n <= execucoes; n++) {
        const arquivo = path.join(saida, `${preset}-${nomeDaRota(rota)}-${n}.json`)
        const p = spawnSync(
          process.execPath,
          [
            lh,
            base + rota,
            '--output=json',
            `--output-path=${arquivo}`,
            '--only-categories=performance,accessibility,best-practices',
            '--chrome-flags=--headless=new --no-first-run',
            '--quiet',
            ...(preset === 'desktop' ? ['--preset=desktop'] : []),
          ],
          { cwd: RAIZ, encoding: 'utf8', timeout: 180_000 },
        )
        console.log(
          `lighthouse ${preset} ${rota} #${n}: ${p.status === 0 ? 'ok' : `falhou (${p.status}) ${p.stderr?.slice(-300)}`}`,
        )
      }
}

// ── 2. Core Web Vitals no Playwright ──────────────────────────────────────────────────────────
const cwv = []
if (!flag('sem-cwv')) {
  const navegador = await chromium.launch()
  for (const [perfil, contexto] of [
    ['mobile', { ...devices['Pixel 7'] }],
    ['desktop', { viewport: { width: 1366, height: 800 } }],
  ])
    for (const rota of rotas)
      for (let n = 1; n <= execucoes; n++) {
        const ctx = await navegador.newContext(contexto)
        await ctx.addInitScript(() => {
          window.__cwv = { lcp: 0, cls: 0, inp: 0 }
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) window.__cwv.lcp = Math.max(window.__cwv.lcp, e.startTime)
          }).observe({ type: 'largest-contentful-paint', buffered: true })
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cwv.cls += e.value
          }).observe({ type: 'layout-shift', buffered: true })
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) window.__cwv.inp = Math.max(window.__cwv.inp, e.duration)
          }).observe({ type: 'event', buffered: true, durationThreshold: 16 })
        })
        const pagina = await ctx.newPage()
        const t0 = Date.now()
        await pagina.goto(base + rota, { waitUntil: 'networkidle', timeout: 60_000 })
        const carga = Date.now() - t0
        // Interação: o primeiro botão visível e habilitado da tela (abrir menu, trocar aba...).
        let interagiu = false
        try {
          const botao = pagina.locator('button:visible:not([disabled])').first()
          if (await botao.count()) {
            await botao.click({ timeout: 3000 })
            interagiu = true
          }
        } catch {}
        await pagina.waitForTimeout(1500)
        const m = await pagina.evaluate(() => {
          const recursos = performance.getEntriesByType('resource')
          const js = recursos.filter((x) => /\.m?js(\?|$)/.test(x.name))
          const nav = performance.getEntriesByType('navigation')[0]
          return {
            ...window.__cwv,
            fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
            ttfb: nav ? nav.responseStart : null,
            jsArquivos: js.length,
            jsTransferidoKB: Math.round(js.reduce((a, x) => a + (x.transferSize || 0), 0) / 102.4) / 10,
            jsDecodificadoKB: Math.round(js.reduce((a, x) => a + (x.decodedBodySize || 0), 0) / 102.4) / 10,
            totalTransferidoKB: Math.round(recursos.reduce((a, x) => a + (x.transferSize || 0), 0) / 102.4) / 10,
          }
        })
        cwv.push({
          perfil,
          rota,
          n,
          cargaMs: carga,
          interagiu,
          lcp: Math.round(m.lcp),
          cls: Math.round(m.cls * 1000) / 1000,
          inpAprox: Math.round(m.inp),
          fcp: m.fcp && Math.round(m.fcp),
          ttfb: m.ttfb && Math.round(m.ttfb),
          jsArquivos: m.jsArquivos,
          jsTransferidoKB: m.jsTransferidoKB,
          jsDecodificadoKB: m.jsDecodificadoKB,
          totalTransferidoKB: m.totalTransferidoKB,
        })
        await ctx.close()
      }
  await navegador.close()
  writeFileSync(path.join(saida, 'cwv.json'), JSON.stringify(cwv, null, 2))
  const med = (xs) => {
    const o = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b)
    return o.length ? o[Math.floor(o.length / 2)] : null
  }
  console.log(
    '\n| perfil | rota | LCP ms | CLS | INP aprox. ms | FCP ms | TTFB ms | JS arquivos | JS transferido KB | JS decodificado KB |',
  )
  console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const perfil of ['mobile', 'desktop'])
    for (const rota of rotas) {
      const xs = cwv.filter((c) => c.perfil === perfil && c.rota === rota)
      const k = (c) => med(xs.map((x) => x[c]))
      console.log(
        `| ${perfil} | ${rota} | ${k('lcp')} | ${k('cls')} | ${k('inpAprox')} | ${k('fcp')} | ${k('ttfb')} | ${k('jsArquivos')} | ${k('jsTransferidoKB')} | ${k('jsDecodificadoKB')} |`,
      )
    }
}

// ── 3. Cabeçalhos de um chunk e do index ──────────────────────────────────────────────────────
const html = await (await fetch(base + '/')).text()
const chunk = /src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1]
const cabecalhos = {}
for (const [nome, url, ae] of [
  ['chunk-br', chunk, 'br, gzip'],
  ['chunk-gzip', chunk, 'gzip'],
  ['index', '/', 'br, gzip'],
  ['api-settings', '/api/settings', 'br, gzip'],
]) {
  const res = await fetch(base + url, { headers: { 'accept-encoding': ae } })
  await res.arrayBuffer()
  cabecalhos[nome] = {
    url,
    status: res.status,
    'content-encoding': res.headers.get('content-encoding'),
    'cache-control': res.headers.get('cache-control'),
    vary: res.headers.get('vary'),
  }
}
console.log(`\n# cabeçalhos: ${JSON.stringify(cabecalhos, null, 2)}`)
writeFileSync(path.join(saida, 'cabecalhos.json'), JSON.stringify(cabecalhos, null, 2))
process.exit(0)
