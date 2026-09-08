#!/usr/bin/env node
/**
 * COBERTURA POR MÓDULO — agrega `coverage/coverage-final.json` (v8, gerado por `npm run test:cov`)
 * por diretório, para que o número de cobertura diga ONDE falta teste e não só quanto.
 *
 *   node scripts/cobertura-por-modulo.mjs [--nivel=2] [--md]
 *
 * `--nivel` é a profundidade do agrupamento (`src/core`, `server/routes`...). Na Fase 3 da rodada
 * de saneamento a árvore vira por domínio e o mesmo script passa a responder "cobertura do
 * domínio economia". `--md` imprime tabela Markdown (é o que vai para o relatório).
 */
import { readFileSync, existsSync } from 'node:fs'
import { relative, sep } from 'node:path'

const arg = (nome, padrao) => {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}
const nivel = Number(arg('nivel', 2))
const md = process.argv.includes('--md')
const ARQ = 'coverage/coverage-final.json'
if (!existsSync(ARQ)) {
  console.error(`sem ${ARQ} — rode \`npm run test:cov\` antes`)
  process.exit(2)
}
const dados = JSON.parse(readFileSync(ARQ, 'utf8'))
const raiz = process.cwd()

/** Conta linhas/ramos/funções cobertos por arquivo a partir dos mapas do v8 (formato istanbul). */
function contar(f) {
  const linhas = new Map()
  for (const [id, n] of Object.entries(f.s)) {
    const l = f.statementMap[id].start.line
    linhas.set(l, (linhas.get(l) || 0) + n)
  }
  const ramos = Object.values(f.b).flat()
  const funcs = Object.values(f.f)
  return {
    linhasTotal: linhas.size,
    linhasCobertas: [...linhas.values()].filter((n) => n > 0).length,
    ramosTotal: ramos.length,
    ramosCobertos: ramos.filter((n) => n > 0).length,
    funcsTotal: funcs.length,
    funcsCobertas: funcs.filter((n) => n > 0).length,
  }
}

const grupos = new Map()
for (const [caminho, f] of Object.entries(dados)) {
  const rel = relative(raiz, caminho).split(sep)
  const chave = rel.length > nivel ? rel.slice(0, nivel).join('/') : rel.slice(0, -1).join('/') || rel[0]
  const c = contar(f)
  const g = grupos.get(chave) || { arquivos: 0, semTeste: 0, linhasTotal: 0, linhasCobertas: 0, ramosTotal: 0, ramosCobertos: 0, funcsTotal: 0, funcsCobertas: 0 }
  g.arquivos++
  if (c.linhasCobertas === 0) g.semTeste++
  for (const k of ['linhasTotal', 'linhasCobertas', 'ramosTotal', 'ramosCobertos', 'funcsTotal', 'funcsCobertas']) g[k] += c[k]
  grupos.set(chave, g)
}
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(1) : '—')
const linhas = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))
const total = linhas.reduce((t, [, g]) => { for (const k of Object.keys(g)) t[k] = (t[k] || 0) + g[k]; return t }, {})

if (md) {
  console.log('| módulo | arquivos | sem teste | linhas % | ramos % | funções % |')
  console.log('|---|---:|---:|---:|---:|---:|')
  for (const [k, g] of linhas) console.log(`| ${k} | ${g.arquivos} | ${g.semTeste} | ${pct(g.linhasCobertas, g.linhasTotal)} | ${pct(g.ramosCobertos, g.ramosTotal)} | ${pct(g.funcsCobertas, g.funcsTotal)} |`)
  console.log(`| **total** | ${total.arquivos} | ${total.semTeste} | ${pct(total.linhasCobertas, total.linhasTotal)} | ${pct(total.ramosCobertos, total.ramosTotal)} | ${pct(total.funcsCobertas, total.funcsTotal)} |`)
} else {
  for (const [k, g] of linhas) console.log(`${k.padEnd(40)} ${String(g.arquivos).padStart(4)} arq ${String(g.semTeste).padStart(4)} sem teste  linhas ${pct(g.linhasCobertas, g.linhasTotal).padStart(5)}%  ramos ${pct(g.ramosCobertos, g.ramosTotal).padStart(5)}%`)
  console.log(`${'TOTAL'.padEnd(40)} ${String(total.arquivos).padStart(4)} arq ${String(total.semTeste).padStart(4)} sem teste  linhas ${pct(total.linhasCobertas, total.linhasTotal).padStart(5)}%  ramos ${pct(total.ramosCobertos, total.ramosTotal).padStart(5)}%`)
}
