#!/usr/bin/env node
/**
 * RESUME UM `.cpuprofile` (do `--cpu-prof` ou de `perfil-cpu.cjs`) em hotspots — auditoria de
 * performance do backend, 26/09/2026.
 *
 *   node scripts/perf/consultas/resumir-perfil.mjs <arquivo.cpuprofile> [--top=25] [--req=<requisições>]
 *
 * Imprime, em Markdown:
 *   1. TEMPO PRÓPRIO (self) por função — onde a CPU de fato ficou;
 *   2. TEMPO PRÓPRIO por PACOTE/ORIGEM (`libsql`, `drizzle-orm`, `express`, `jose`, código do servidor,
 *      `(garbage collector)`, `(program)` = nativo fora do JS, `(idle)` = event loop ocioso);
 *   3. TEMPO TOTAL (inclusivo) das funções do servidor (`server/…` no bundle), o que responde "qual
 *      caminho do NOSSO código custa mais", incluindo o que ele chama.
 * Com `--req`, acrescenta ms de CPU por requisição (sem o ocioso).
 */
import { readFileSync } from 'node:fs'

const arquivo = process.argv[2]
if (!arquivo) {
  console.error('uso: node scripts/perf/consultas/resumir-perfil.mjs <arquivo.cpuprofile> [--top=25] [--req=N]')
  process.exit(2)
}
const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const TOP = Number(arg('top', 25))
const REQ = Number(arg('req', 0))
const p = JSON.parse(readFileSync(arquivo, 'utf8'))

const porId = new Map(p.nodes.map((n) => [n.id, n]))
const pai = new Map()
for (const n of p.nodes) for (const c of n.children ?? []) pai.set(c, n.id)
// Tempo por amostra: deltas em µs.
const selfUs = new Map()
p.samples.forEach((id, i) => selfUs.set(id, (selfUs.get(id) ?? 0) + (p.timeDeltas[i] ?? 0)))
const totalUs = [...selfUs.values()].reduce((a, b) => a + b, 0)

const origem = (url) => {
  if (!url) return null
  const u = url.replace(/\\/g, '/')
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(u)
  if (m) return m[1]
  if (u.startsWith('node:')) return `node:${u.slice(5).split('/')[0]}`
  if (/\/server[^/]*\.cjs$/.test(u) || /\/server\//.test(u)) return 'servidor (bundle)'
  return u.split('/').slice(-2).join('/')
}
const nomeDe = (n) => {
  const f = n.callFrame
  const nome = f.functionName || '(anônima)'
  if (!f.url) return nome
  return `${nome} ${f.url.replace(/\\/g, '/').split('/').slice(-2).join('/')}:${f.lineNumber + 1}`
}
const ms = (us) => Math.round(us / 100) / 10
const pc = (us) => `${Math.round((us / totalUs) * 1000) / 10}%`

// 1. self por função
const porFuncao = new Map()
for (const [id, us] of selfUs) {
  const k = nomeDe(porId.get(id))
  porFuncao.set(k, (porFuncao.get(k) ?? 0) + us)
}
// 2. self por origem
const porOrigem = new Map()
for (const [id, us] of selfUs) {
  const n = porId.get(id)
  const k = n.callFrame.url ? origem(n.callFrame.url) : n.callFrame.functionName || '(nativo)'
  porOrigem.set(k, (porOrigem.get(k) ?? 0) + us)
}
// 3. inclusivo das funções do servidor: cada amostra sobe a pilha e credita cada função do servidor UMA vez
const inclusivo = new Map()
for (const [id, us] of selfUs) {
  const vistos = new Set()
  for (let cur = id; cur !== undefined; cur = pai.get(cur)) {
    const n = porId.get(cur)
    if (origem(n.callFrame.url) !== 'servidor (bundle)') continue
    const k = nomeDe(n)
    if (vistos.has(k)) continue
    vistos.add(k)
    inclusivo.set(k, (inclusivo.get(k) ?? 0) + us)
  }
}
const ocioso = porOrigem.get('(idle)') ?? 0
const ocupado = totalUs - ocioso
const linhas = []
linhas.push(
  `Perfil: ${arquivo.replace(/\\/g, '/').split('/').slice(-1)[0]} · ${ms(totalUs)} ms amostrados · ocupado ${ms(ocupado)} ms (${pc(ocupado)})${REQ ? ` · ${REQ} requisições → **${Math.round((ocupado / 1000 / REQ) * 100) / 100} ms de CPU/req**` : ''}`,
  '',
)
const tabela = (titulo, mapa, n) => {
  linhas.push(`**${titulo}**`, '', '| # | ms | % do total | função / origem |', '|---:|---:|---:|---|')
  ;[...mapa]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .forEach(([k, us], i) => linhas.push(`| ${i + 1} | ${ms(us)} | ${pc(us)} | \`${k.replace(/\|/g, '\\|')}\` |`))
  linhas.push('')
}
tabela('Tempo próprio por origem', porOrigem, 15)
tabela('Tempo próprio por função', porFuncao, TOP)
tabela('Tempo inclusivo das funções do servidor', inclusivo, TOP)
console.log(linhas.join('\n'))
