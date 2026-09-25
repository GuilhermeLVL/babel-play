#!/usr/bin/env node
/* global AbortSignal */
/**
 * CARGA LEVE NO CI — um piso de latência que não deixa regressão grosseira passar calada (Fase 6).
 *
 *   npm run build && node scripts/perf/ci-carga.mjs [--bundle=dist-server/server.cjs] \
 *        [--duracao=10] [--conexoes=10] [--p95=500] [--porta=3150] [--rotas=health,abertura,settings,sessions]
 *
 * Sobe o SERVIDOR BUILDADO (o mesmo `dist-server/server.cjs` que vai na imagem) com NODE_ENV=production
 * e um banco VAZIO num diretório temporário (as migrations rodam no boot, como no Fly), no modo
 * self-host (AUTH_REQUIRED=0 + SELF_HOST=1: sem JWT e sem limitadores, então o número é o custo da
 * rota, não o da borda). Para cada rota, `--duracao` segundos de autocannon com `--conexoes`
 * conexões, e cobra:
 *   - p95 < `--p95` ms, calculado de CADA resposta (o autocannon só resume p90/p97,5/p99);
 *   - zero erro: nenhum erro de socket, nenhum timeout, nenhuma resposta fora de 2xx.
 *
 * Os limiares são INICIAIS e generosos de propósito (o runner do GitHub é compartilhado e ruidoso):
 * o objetivo é pegar a regressão de ordem de grandeza — uma query sem índice, um `await` num laço —
 * não medir capacidade. A medida de capacidade é `scripts/perf/escala/carga-servidor.mjs` (Fase 2) e
 * os SLOs vêm da Fase 4; quando eles mudarem, mude os padrões daqui.
 *
 * Sai 0 quando todas as rotas passam; 1 com a lista do que reprovou; 2 em uso errado. Com
 * `GITHUB_STEP_SUMMARY` no ambiente, escreve a tabela no resumo da execução.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import autocannon from 'autocannon'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d

/** As rotas baratas que o CI mede. Todas GET, todas sem estado a preparar num banco vazio. */
export const ROTAS = {
  health: '/api/health',
  ready: '/api/ready',
  abertura: '/api/abertura',
  settings: '/api/settings',
  sessions: '/api/sessions',
}

/** Percentil `p` de uma lista JÁ ORDENADA (nearest-rank). */
export function percentil(ordenada, p) {
  if (!ordenada.length) return null
  return ordenada[Math.min(ordenada.length - 1, Math.ceil((p / 100) * ordenada.length) - 1)]
}

/** O veredito de uma rota. Pura, para o teste. */
export function avaliar({ rota, latencias, erros, timeouts, fora2xx }, { p95Max }) {
  const ordenada = [...latencias].sort((a, b) => a - b)
  const p95 = percentil(ordenada, 95)
  const falhas = []
  if (!ordenada.length) falhas.push('nenhuma resposta medida')
  else if (p95 >= p95Max) falhas.push(`p95 ${p95.toFixed(1)} ms >= ${p95Max} ms`)
  if (erros) falhas.push(`${erros} erro(s) de conexão`)
  if (timeouts) falhas.push(`${timeouts} timeout(s)`)
  const naoOk = Object.entries(fora2xx).filter(([, n]) => n > 0)
  if (naoOk.length) falhas.push(`respostas fora de 2xx: ${naoOk.map(([s, n]) => `${s}×${n}`).join(', ')}`)
  return {
    rota,
    respostas: ordenada.length,
    p50: percentil(ordenada, 50),
    p95,
    p99: percentil(ordenada, 99),
    falhas,
  }
}

async function principal() {
  const bundle = path.resolve(RAIZ, arg('bundle', 'dist-server/server.cjs'))
  const duracao = Number(arg('duracao', 10))
  const conexoes = Number(arg('conexoes', 10))
  const p95Max = Number(arg('p95', 500))
  const porta = Number(arg('porta', 3150))
  const nomes = arg('rotas', 'health,abertura,settings,sessions').split(',')
  if (!existsSync(bundle) || nomes.some((n) => !ROTAS[n]) || !(duracao > 0) || !(conexoes > 0)) {
    console.error(
      `uso: node scripts/perf/ci-carga.mjs [--bundle=dist-server/server.cjs] [--duracao=10] [--conexoes=10] [--p95=500] [--rotas=${Object.keys(ROTAS).join(',')}]`,
    )
    if (!existsSync(bundle)) console.error(`bundle não encontrado: ${bundle} (rode npm run build)`)
    return 2
  }

  const tmp = mkdtempSync(path.join(tmpdir(), 'ci-carga-'))
  const base = `http://127.0.0.1:${porta}`
  const filho = spawn(process.execPath, [bundle], {
    cwd: RAIZ,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      NODE_ENV: 'production',
      PORT: String(porta),
      HOST: '127.0.0.1',
      DATABASE_URL: `file:${path.join(tmp, 'babel.db').replace(/\\/g, '/')}`,
      AUDIO_DIR: path.join(tmp, 'audio'),
      BACKUP_DIARIO: '0',
      SECRET_KEY: randomBytes(32).toString('hex'),
      AUTH_REQUIRED: '0',
      SELF_HOST: '1',
      TRUST_PROXY: 'false', // exigida em produção; aqui a conexão chega direto
      LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const logs = []
  filho.stdout.on('data', (d) => logs.push(String(d)))
  filho.stderr.on('data', (d) => logs.push(String(d)))
  let morreu = null
  filho.on('exit', (c, s) => (morreu = { c, s }))
  const encerrar = () => {
    if (!morreu) filho.kill() // só o processo que este script iniciou
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {}
  }
  process.on('exit', encerrar)

  const inicio = Date.now()
  for (;;) {
    if (morreu) {
      console.error(`servidor morreu no boot (${JSON.stringify(morreu)}):\n${logs.join('').slice(-3000)}`)
      return 1
    }
    try {
      if ((await fetch(`${base}/api/ready`, { signal: AbortSignal.timeout(2000) })).ok) break
    } catch {}
    if (Date.now() - inicio > 90_000) {
      console.error(`servidor não ficou pronto em 90 s:\n${logs.join('').slice(-3000)}`)
      return 1
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  console.log(
    `# servidor pronto em ${Date.now() - inicio} ms · ${conexoes} conexões × ${duracao} s por rota · p95 < ${p95Max} ms`,
  )

  const resultados = []
  for (const nome of nomes) {
    const latencias = []
    const fora2xx = {}
    const inst = autocannon({ url: base + ROTAS[nome], connections: conexoes, duration: duracao, timeout: 10 })
    inst.on('response', (_c, status, _b, ms) => {
      latencias.push(ms)
      if (status < 200 || status >= 300) fora2xx[status] = (fora2xx[status] ?? 0) + 1
    })
    const r = await inst
    const v = avaliar({ rota: ROTAS[nome], latencias, erros: r.errors, timeouts: r.timeouts, fora2xx }, { p95Max })
    resultados.push({ ...v, reqPorSeg: Math.round(r.requests.average) })
    console.log(
      `${v.falhas.length ? 'REPROVOU' : 'ok      '} ${v.rota.padEnd(16)} ${String(v.respostas).padStart(7)} resp · ` +
        `${String(Math.round(r.requests.average)).padStart(5)} req/s · p50 ${v.p50?.toFixed(1)} · p95 ${v.p95?.toFixed(1)} · p99 ${v.p99?.toFixed(1)} ms` +
        (v.falhas.length ? `  ← ${v.falhas.join('; ')}` : ''),
    )
  }

  const reprovadas = resultados.filter((r) => r.falhas.length)
  if (process.env.GITHUB_STEP_SUMMARY) {
    const linhas = [
      `### Carga leve (${conexoes} conexões × ${duracao} s, p95 < ${p95Max} ms, zero erro)`,
      '',
      '| rota | respostas | req/s | p50 ms | p95 ms | p99 ms | veredito |',
      '|---|---|---|---|---|---|---|',
      ...resultados.map(
        (r) =>
          `| \`${r.rota}\` | ${r.respostas} | ${r.reqPorSeg} | ${r.p50?.toFixed(1)} | ${r.p95?.toFixed(1)} | ${r.p99?.toFixed(1)} | ${r.falhas.length ? `**reprovou**: ${r.falhas.join('; ')}` : 'ok'} |`,
      ),
      '',
    ]
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, linhas.join('\n'))
  }
  if (reprovadas.length) {
    console.error(`\nCARGA REPROVADA em ${reprovadas.length} rota(s):`)
    for (const r of reprovadas) console.error(`  ${r.rota}: ${r.falhas.join('; ')}`)
    console.error(
      'Rode local para reproduzir: npm run build && node scripts/perf/ci-carga.mjs. Se o limiar mudou de propósito, mude o padrão no script com a justificativa.',
    )
    return 1
  }
  console.log(`\ncarga ok: ${resultados.length} rotas dentro do limiar`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().then(
    (c) => process.exit(c),
    (e) => {
      console.error(`ci-carga FALHOU: ${e?.stack ?? e}`)
      process.exit(1)
    },
  )
}
