#!/usr/bin/env node
/**
 * ANTES × DEPOIS de duas medições de `medir-telas.mjs` (auditoria de performance do frontend,
 * 26/09/2026).
 *
 *   node scripts/perf/telas/comparar.mjs <antes.json> <depois.json> [--campos=lcp,inp,tbtCarga,fps]
 *
 * Casa as telas pelo `id` e imprime, em Markdown, a mediana de cada campo nos dois lados e a
 * variação. As medianas são as que o próprio `medir-telas.mjs` gravou (`medianas`).
 */
import { readFileSync } from 'node:fs'

import { celula } from './_medidas.mjs'

const [a, b] = process.argv.slice(2).filter((x) => !x.startsWith('--'))
if (!a || !b) {
  console.error('uso: comparar.mjs <antes.json> <depois.json> [--campos=lcp,inp,...]')
  process.exit(2)
}
const campos = (process.argv.find((x) => x.startsWith('--campos='))?.slice(9) ?? 'lcp,tbtCarga,jsKB,inp,tbtInteracoes,fps,jank,heapMB').split(',')

const A = JSON.parse(readFileSync(a, 'utf8'))
const B = JSON.parse(readFileSync(b, 'utf8'))
console.log(`antes: ${a} (CPU ${A.cpu}×, ${A.execucoes}×) · depois: ${b} (CPU ${B.cpu}×, ${B.execucoes}×)\n`)
console.log(`| tela | ${campos.join(' | ')} |`)
console.log(`|---|${campos.map(() => '---').join('|')}|`)
for (const m of A.medianas) {
  const n = B.medianas.find((x) => x.id === m.id)
  if (!n) continue
  console.log(`| ${m.id} | ${campos.map((c) => celula(m[c], n[c])).join(' | ')} |`)
}
