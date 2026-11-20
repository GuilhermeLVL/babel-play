#!/usr/bin/env node
/**
 * INVENTÁRIO DE CONSULTAS — agrega o que `coletor.cjs` gravou e roda `EXPLAIN (FORMAT JSON)` em cada
 * consulta sobre um banco semeado realista (auditoria de performance do backend, 26/09/2026).
 *
 *   node scripts/perf/consultas/analisar.mjs --dir=<pasta do coletor>[,<outra>] --db=<diretório do pglite | postgres://…>
 *        [--saida=inventario.json] [--md=inventario.md] [--grande=10000] [--linhas=100]
 *
 * O banco só recebe `EXPLAIN (GENERIC_PLAN, FORMAT JSON)`, que não executa a consulta: os parâmetros
 * (`?` do coletor, reescritos para `$n`) ficam sem valor e o plano é o genérico. Com PGlite, o servidor
 * precisa estar parado (um processo por diretório). O plano vira linhas `SCAN t` / `SEARCH t USING i` / `SORT`.
 *
 * SINAIS por consulta:
 *   SCAN        varredura sequencial (`Seq Scan`) numa tabela com mais de `--grande` linhas
 *   SORT        nó `Sort` no plano (ordenação sem índice que a entregue já ordenada)
 *   SEM_LIMIT   SELECT sem LIMIT que devolveu mais de `--linhas` linhas numa execução observada — cresce
 *               com o acervo do usuário
 *   N+1         a mesma consulta executada 3+ vezes numa mesma requisição (coluna "repetições máx.")
 *
 * POR ROTA: requisições, instruções por requisição (média/máx), ms de banco por requisição (média/máx),
 * p50/p95 da requisição inteira como o coletor a viu.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

import { abrirAlvo } from '../contar-linhas.mjs'

const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const dirs = arg('dir', '').split(',').filter(Boolean)
const banco = arg('db', '')
const GRANDE = Number(arg('grande', 10000))
const LINHAS = Number(arg('linhas', 100))
if (!dirs.length) {
  console.error(
    'uso: node scripts/perf/consultas/analisar.mjs --dir=<pasta> --db=<diretório do pglite | postgres://…> [--md=x.md]',
  )
  process.exit(2)
}

// ── agregação ─────────────────────────────────────────────────────────────────────────────────
const porSql = new Map()
const porRota = new Map()
for (const d of dirs)
  for (const f of readdirSync(d).filter((x) => x.startsWith('consultas-') && x.endsWith('.json'))) {
    let j
    try {
      j = JSON.parse(readFileSync(path.join(d, f), 'utf8'))
    } catch {
      continue // arquivo cortado no meio de uma gravação
    }
    for (const s of j.sql) {
      const e = porSql.get(s.sql) ?? {
        sql: s.sql,
        n: 0,
        ms: 0,
        amostras: [],
        linhasMax: 0,
        linhas: 0,
        rotas: new Set(),
      }
      e.n += s.n
      e.ms += s.ms
      e.linhas += s.linhas ?? 0
      e.linhasMax = Math.max(e.linhasMax, s.linhasMax)
      e.amostras.push(...s.amostras)
      e.exemplo ??= s.exemplo
      for (const r of s.rotas) e.rotas.add(r)
      porSql.set(s.sql, e)
    }
    for (const r of j.rotas) {
      const e = porRota.get(r.rota) ?? {
        rota: r.rota,
        req: 0,
        instrucoes: 0,
        instrucoesMax: 0,
        msBanco: 0,
        msBancoMax: 0,
        msTotal: 0,
        repetidas: new Map(),
        amostrasMs: [],
      }
      e.req += r.req
      e.instrucoes += r.instrucoes
      e.instrucoesMax = Math.max(e.instrucoesMax, r.instrucoesMax)
      e.msBanco += r.msBanco
      e.msBancoMax = Math.max(e.msBancoMax, r.msBancoMax)
      e.msTotal += r.msTotal
      e.amostrasMs.push(...r.amostrasMs)
      for (const [s, n] of r.repetidas) e.repetidas.set(s, Math.max(e.repetidas.get(s) ?? 0, n))
      porRota.set(r.rota, e)
    }
  }
const pct = (xs, p) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const r2 = (x) => (x === null ? null : Math.round(x * 100) / 100)

// ── EXPLAIN ───────────────────────────────────────────────────────────────────────────────────
const EXPLICAVEL = /^\s*(select|with|update|delete|insert)\b/i
const tamanhos = new Map()
let db = null
if (banco && (/^postgres(ql)?:\/\//i.test(banco) || existsSync(banco))) {
  db = await abrirAlvo(banco)
  for (const { tabela } of await db.consultar(
    `select table_name as tabela from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
  ))
    tamanhos.set(tabela, (await db.consultar(`select count(*)::int as n from "${tabela}"`))[0].n)
}
/** `?` fora de literais → `$1, $2…` (o coletor guarda o SQL com `?`; o Postgres só fala `$n`). */
const comParametrosNumerados = (sql) => {
  let n = 0
  let aspas = false
  let saida = ''
  for (const c of sql) {
    if (c === "'") aspas = !aspas
    saida += c === '?' && !aspas ? `$${++n}` : c
  }
  return saida
}
/** Árvore do `EXPLAIN (FORMAT JSON)` → linhas no estilo `SCAN t` / `SEARCH t USING i` / `SORT`. */
function planoEmLinhas(no, saida = []) {
  const tipo = no['Node Type']
  if (tipo === 'Seq Scan') saida.push(`SCAN ${no['Relation Name']}`)
  else if (/Index (Only )?Scan|Bitmap Heap Scan/.test(tipo))
    saida.push(`SEARCH ${no['Relation Name']}${no['Index Name'] ? ` USING ${no['Index Name']}` : ''}`)
  else if (tipo === 'Sort' || tipo === 'Incremental Sort') saida.push(`SORT (${(no['Sort Key'] ?? []).join(', ')})`)
  for (const filho of no.Plans ?? []) planoEmLinhas(filho, saida)
  return saida
}
async function explicar(e) {
  if (!db) return null
  const sql = (e.exemplo ?? e.sql.replace(/in \(\?…\)/g, 'in (?)')).trim()
  if (!EXPLICAVEL.test(sql) || /values \(…\)/.test(sql)) return null
  try {
    const [linha] = await db.consultar(`EXPLAIN (GENERIC_PLAN, FORMAT JSON) ${comParametrosNumerados(sql)}`)
    const plano = linha['QUERY PLAN']
    return planoEmLinhas((typeof plano === 'string' ? JSON.parse(plano) : plano)[0].Plan)
  } catch (err) {
    return [`(EXPLAIN falhou: ${String(err.message ?? err).slice(0, 120)})`]
  }
}
const tabelaDoScan = (d) => /^SCAN (\S+)/.exec(d)?.[1]
const sinais = (e, plano) => {
  const s = []
  if (plano)
    for (const d of plano) {
      const t = tabelaDoScan(d)
      if (t && (tamanhos.get(t) ?? 0) > GRANDE) s.push(`SCAN ${t} (${tamanhos.get(t)} linhas)`)
      if (/^SORT/.test(d)) s.push(d)
    }
  if (/^\s*select\b/i.test(e.sql) && !/\blimit\b/i.test(e.sql) && e.linhasMax > LINHAS)
    s.push(`SEM_LIMIT (até ${e.linhasMax} linhas)`)
  return s
}

const consultas = []
for (const e of porSql.values()) {
  const plano = await explicar(e)
  consultas.push({
    sql: e.sql,
    n: e.n,
    msTotal: r2(e.ms),
    msMedia: r2(e.ms / e.n),
    p50: r2(pct(e.amostras, 50)),
    p95: r2(pct(e.amostras, 95)),
    max: r2(Math.max(...e.amostras)),
    linhasMax: e.linhasMax,
    linhasMedia: r2(e.linhas / e.n),
    rotas: [...e.rotas].sort(),
    plano,
    sinais: sinais(e, plano),
  })
}
consultas.sort((a, b) => b.msTotal - a.msTotal)
const rotas = [...porRota.values()]
  .map((r) => ({
    rota: r.rota,
    req: r.req,
    instrPorReq: r2(r.instrucoes / r.req),
    instrMax: r.instrucoesMax,
    msBancoPorReq: r2(r.msBanco / r.req),
    msBancoMax: r2(r.msBancoMax),
    p50: r2(pct(r.amostrasMs, 50)),
    p95: r2(pct(r.amostrasMs, 95)),
    nMais1: [...r.repetidas].filter(([, n]) => n >= 3).map(([sql, n]) => ({ sql, n })),
  }))
  .sort((a, b) => b.msBancoPorReq * b.req - a.msBancoPorReq * a.req)

const resultado = {
  em: new Date().toISOString(),
  dirs,
  banco: banco || null,
  tamanhos: Object.fromEntries(tamanhos),
  totalExecucoes: consultas.reduce((a, c) => a + c.n, 0),
  distintas: consultas.length,
  consultas,
  rotas,
}
const saida = arg('saida', '')
if (saida) writeFileSync(saida, JSON.stringify(resultado, null, 2))

// ── relatório ─────────────────────────────────────────────────────────────────────────────────
const corta = (s, n = 140) => (s.length > n ? s.slice(0, n) + '…' : s).replace(/\|/g, '\\|')
const md = []
md.push(`# Inventário de consultas (${resultado.em})`, '')
md.push(`Fontes: ${dirs.join(', ')} · banco do EXPLAIN: ${banco || '—'}`, '')
md.push(`${resultado.totalExecucoes} execuções, ${resultado.distintas} consultas distintas.`, '')
md.push('## Consultas com sinal (SCAN grande, SORT, sem LIMIT)', '')
md.push('| # | n | ms total | p95 ms | linhas máx | sinais | rotas | SQL |', '|---:|---:|---:|---:|---:|---|---|---|')
consultas
  .filter((c) => c.sinais.length)
  .forEach((c, i) =>
    md.push(
      `| ${i + 1} | ${c.n} | ${c.msTotal} | ${c.p95} | ${c.linhasMax} | ${c.sinais.join('; ')} | ${corta(c.rotas.slice(0, 4).join(', '), 90)} | \`${corta(c.sql)}\` |`,
    ),
  )
md.push('', '## Top 30 por tempo total', '')
md.push('| # | n | ms total | média | p95 | linhas máx | plano | SQL |', '|---:|---:|---:|---:|---:|---:|---|---|')
consultas
  .slice(0, 30)
  .forEach((c, i) =>
    md.push(
      `| ${i + 1} | ${c.n} | ${c.msTotal} | ${c.msMedia} | ${c.p95} | ${c.linhasMax} | ${corta((c.plano ?? []).join(' / '), 120)} | \`${corta(c.sql)}\` |`,
    ),
  )
md.push('', '## Rotas', '')
md.push(
  '| rota | req | instr./req | instr. máx | ms banco/req | ms banco máx | p50 | p95 | N+1 (consulta × repetições) |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---|',
)
for (const r of rotas)
  md.push(
    `| ${r.rota} | ${r.req} | ${r.instrPorReq} | ${r.instrMax} | ${r.msBancoPorReq} | ${r.msBancoMax} | ${r.p50} | ${r.p95} | ${r.nMais1.map((x) => `\`${corta(x.sql, 70)}\` ×${x.n}`).join('<br>')} |`,
  )
const mdSaida = arg('md', '')
if (mdSaida) writeFileSync(mdSaida, md.join('\n') + '\n')
else console.log(md.join('\n'))
await db?.fechar()
