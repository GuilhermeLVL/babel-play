#!/usr/bin/env node
/**
 * RESUMO DOS JSON DO LIGHTHOUSE — mediana por (preset, rota) quando há mais de uma execução.
 *
 *   node scripts/perf/resumir-lighthouse.mjs <pasta com *.json> [--md]
 *
 * Os arquivos seguem `<preset>-<rota>-<n>.json` (`mobile-jogar-2.json`). A mediana é sobre a nota
 * de performance; LCP/TBT/CLS são os da execução mediana, para que a linha seja coerente.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const pasta = process.argv[2]
const md = process.argv.includes('--md')
if (!pasta) { console.error('uso: resumir-lighthouse.mjs <pasta>'); process.exit(2) }

const grupos = new Map()
for (const f of readdirSync(pasta).filter((x) => x.endsWith('.json'))) {
  const m = /^(\w+)-(.+)-(\d+)\.json$/.exec(f)
  if (!m) continue
  const j = JSON.parse(readFileSync(join(pasta, f), 'utf8'))
  const a = j.audits
  const linha = {
    perf: Math.round((j.categories.performance?.score ?? 0) * 100),
    a11y: Math.round((j.categories.accessibility?.score ?? 0) * 100),
    bp: Math.round((j.categories['best-practices']?.score ?? 0) * 100),
    lcp: Math.round(a['largest-contentful-paint']?.numericValue ?? 0),
    fcp: Math.round(a['first-contentful-paint']?.numericValue ?? 0),
    tbt: Math.round(a['total-blocking-time']?.numericValue ?? 0),
    cls: Number((a['cumulative-layout-shift']?.numericValue ?? 0).toFixed(3)),
    si: Math.round(a['speed-index']?.numericValue ?? 0),
    n: Number(m[3]),
  }
  const k = `${m[1]}|${m[2]}`
  grupos.set(k, [...(grupos.get(k) || []), linha])
}
const linhas = []
for (const [k, execs] of [...grupos.entries()].sort()) {
  execs.sort((x, y) => x.perf - y.perf)
  const med = execs[Math.floor(execs.length / 2)]
  const [preset, rota] = k.split('|')
  linhas.push({ preset, rota, execs: execs.length, ...med })
}
if (md) {
  console.log('| preset | rota | exec. | perf | a11y | boas práticas | FCP ms | LCP ms | TBT ms | CLS | Speed Index |')
  console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const l of linhas) console.log(`| ${l.preset} | /${l.rota === 'inicio' ? '' : l.rota} | ${l.execs} | ${l.perf} | ${l.a11y} | ${l.bp} | ${l.fcp} | ${l.lcp} | ${l.tbt} | ${l.cls} | ${l.si} |`)
} else {
  console.log(JSON.stringify(linhas, null, 2))
}
