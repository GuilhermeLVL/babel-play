#!/usr/bin/env node
/**
 * O MESMO USUÁRIO GASTANDO DE DOIS LUGARES AO MESMO TEMPO — pelo HTTP, contra o servidor de
 * verdade, e conferido no banco depois.
 *
 * POR QUE ISTO EXISTE, SE JÁ HÁ TESTE. `tests/integration/economia-atomica.test.ts` cobre o
 * MECANISMO: dez gastos simultâneos chamando o handler direto, com o teto dentro do INSERT. O que
 * ele não cobre é a pilha inteira — `express.json`, o limitador contando no banco, o pool do
 * libsql, e (quando `CLUSTER_WORKERS>1`) mais de um PROCESSO decidindo sobre a mesma conta. Foi
 * exatamente essa diferença que produziu o achado P1-3 da auditoria: um teto que valia no teste e
 * virava "teto × número de réplicas" em produção.
 *
 *   node scripts/perf/concorrencia.mjs --db=<copia.db> [--porta=3105] [--gastos=40] [--workers=1]
 *
 * Use SEMPRE uma cópia do banco: a rota grava de verdade em `seed_credits` e `seed_spends`.
 *
 * O QUE REPROVA:
 *   1. saldo final NEGATIVO — o teto falhou;
 *   2. soma dos gastos gravados != número de respostas 200 — alguém pagou sem receber, ou recebeu
 *      sem pagar;
 *   3. qualquer 5xx.
 * Um 402 `saldo_insuficiente` NÃO reprova: é o teto funcionando, e é o resultado esperado da
 * maioria das requisições quando o saldo paga só algumas.
 */
import { execFileSync, spawn } from 'node:child_process'

const arg = (nome, padrao) => {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}
const db = arg('db', '')
if (!db) {
  console.error('uso: node scripts/perf/concorrencia.mjs --db=<copia.db> [--porta=] [--gastos=] [--workers=]')
  process.exit(2)
}
const porta = arg('porta', '3105')
const gastos = Number(arg('gastos', 40))
const workers = arg('workers', '1')
const base = `http://127.0.0.1:${porta}`

const env = {
  ...process.env,
  DATABASE_URL: `file:${db}`,
  PORT: porta,
  HOST: '127.0.0.1',
  AUTH_REQUIRED: '0',
  CLUSTER_WORKERS: workers,
}

const sql = (q) => execFileSync('sqlite3', [db, q], { encoding: 'utf8' }).trim()
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const filho = spawn('node', ['dist-server/server.cjs'], { env, stdio: 'ignore' })

async function esperarHealth(teto = 60_000) {
  const t0 = performance.now()
  while (performance.now() - t0 < teto) {
    try {
      const r = await fetch(`${base}/api/health`)
      if (r.status === 200) return Math.round(performance.now() - t0)
    } catch {
      /* ainda não subiu */
    }
    await dormir(20)
  }
  return -1
}

/**
 * O ITEM E O PREÇO saem do catálogo do servidor, não de um número escrito aqui: a rota recusa com
 * `preco_divergente` se o valor não bater, e um preço chutado faria o teste medir a validação em
 * vez da concorrência.
 */
async function precoDeUmItem() {
  const r = await fetch(`${base}/api/metrics/profile`)
  if (!r.ok) throw new Error(`profile devolveu ${r.status}`)
  return await r.json()
}

try {
  const subiu = await esperarHealth()
  if (subiu < 0) throw new Error('o servidor não respondeu /api/health em 60 s')

  const perfilAntes = await precoDeUmItem()
  const saldoAntes = perfilAntes?.seeds?.saldo ?? perfilAntes?.saldo ?? null
  const gastosAntes = Number(sql('SELECT COUNT(*) FROM seed_spends;') || 0)

  const razao = process.env.RAZAO_DE_GASTO || 'tema'
  const preco = Number(process.env.PRECO_DO_ITEM || 40)

  console.log(`# concorrencia — ${base}, ${gastos} gastos simultaneos, CLUSTER_WORKERS=${workers}`)
  console.log(`# subiu em ${subiu} ms; saldo antes: ${saldoAntes}; linhas em seed_spends: ${gastosAntes}`)

  /* TODAS DE UMA VEZ, e não em série: o defeito que se procura só aparece quando duas conferências
     de saldo acontecem antes de qualquer uma das duas escritas. `Promise.all` de N `fetch` é o mais
     próximo disso que o cliente consegue produzir. */
  const respostas = await Promise.all(
    Array.from({ length: gastos }, (_, i) =>
      fetch(`${base}/api/metrics/seeds/gastar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ spendId: `conc-${Date.now()}-${i}`, amount: preco, reason: razao, ref: `k6-${i}` }),
      }).then(async (r) => ({ status: r.status, corpo: await r.text() })),
    ),
  )

  const porStatus = respostas.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {})
  const aceitos = respostas.filter((r) => r.status === 200).length
  const cincoxx = respostas.filter((r) => r.status >= 500)

  const perfilDepois = await precoDeUmItem()
  const saldoDepois = perfilDepois?.seeds?.saldo ?? perfilDepois?.saldo ?? null
  const gastosDepois = Number(sql('SELECT COUNT(*) FROM seed_spends;') || 0)
  const gravados = gastosDepois - gastosAntes

  console.log(`\n| medida | valor |`)
  console.log(`|---|---:|`)
  console.log(`| respostas por status | ${JSON.stringify(porStatus)} |`)
  console.log(`| 200 (gasto aceito) | ${aceitos} |`)
  console.log(`| linhas novas em seed_spends | ${gravados} |`)
  console.log(`| saldo antes | ${saldoAntes} |`)
  console.log(`| saldo depois | ${saldoDepois} |`)

  const falhas = []
  if (cincoxx.length) falhas.push(`${cincoxx.length} resposta(s) 5xx`)
  if (typeof saldoDepois === 'number' && saldoDepois < 0) falhas.push(`saldo final NEGATIVO (${saldoDepois})`)
  if (gravados !== aceitos) falhas.push(`gravados ${gravados} != aceitos ${aceitos}`)

  if (falhas.length) {
    console.error(`\nREPROVADO: ${falhas.join('; ')}`)
    process.exitCode = 1
  } else {
    console.log(`\nAPROVADO: teto respeitado sob ${gastos} gastos simultaneos, ledger consistente.`)
  }
} finally {
  filho.kill('SIGTERM')
  await dormir(500)
  filho.kill('SIGKILL')
}
