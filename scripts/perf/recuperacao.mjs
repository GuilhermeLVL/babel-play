#!/usr/bin/env node
/**
 * RECUPERAÇÃO APÓS MORTE DO PROCESSO SOB CARGA — e o que se perde no caminho.
 *
 * Duas perguntas: (1) quanto tempo entre o `kill -9` e o `/api/health` voltar a 200, com um
 * supervisor que reinicia o processo (o papel do `restart: unless-stopped` do compose);
 * (2) alguma escrita que o cliente viu como 2xx deixou de existir no banco? Um 2xx sem linha
 * é perda de dado; uma linha sem 2xx é a requisição cortada no meio — aceitável, o cliente
 * repete.
 *
 *   node scripts/perf/recuperacao.mjs --db=<caminho do .db> [--porta=3104] [--carga=30] [--matar=10]
 *
 * O servidor sobe a partir de `dist-server/server.cjs` (rode `npm run build` antes) com o
 * ambiente herdado mais `DATABASE_URL=file:<db>`. Use SEMPRE uma cópia do banco.
 */
import { spawn, execFileSync } from 'node:child_process'
import autocannon from 'autocannon'

const arg = (nome, padrao) => {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}
const db = arg('db', '')
if (!db) { console.error('uso: --db=<copia.db>'); process.exit(2) }
const porta = arg('porta', '3104')
const carga = Number(arg('carga', 30))
const matarEm = Number(arg('matar', 10))
const base = `http://127.0.0.1:${porta}`
const env = { ...process.env, DATABASE_URL: `file:${db}`, PORT: porta, HOST: '127.0.0.1', AUTH_REQUIRED: '0' }

const sql = (q) => execFileSync('sqlite3', [db, q], { encoding: 'utf8' }).trim()
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/** Supervisor: sobe de novo sempre que o filho morre, até `parar()` ser chamado. */
let filho = null
let ativo = true
let reinicios = 0
function supervisionar() {
  filho = spawn('node', ['dist-server/server.cjs'], { env, stdio: 'ignore' })
  filho.on('exit', () => { if (ativo) { reinicios++; supervisionar() } })
}
const parar = async () => { ativo = false; filho?.kill('SIGTERM'); await dormir(500); filho?.kill('SIGKILL') }

async function esperarHealth(teto = 60_000) {
  const t0 = performance.now()
  while (performance.now() - t0 < teto) {
    try { const r = await fetch(`${base}/api/health`); if (r.status === 200) return Math.round(performance.now() - t0) } catch { /* fora */ }
    await dormir(20)
  }
  return -1
}

const antes = Number(sql('select count(*) from exercise_results'))
supervisionar()
const boot = await esperarHealth()
console.log(`# recuperacao — ${new Date().toISOString()} — ${process.version}`)
console.log(`boot inicial: ${boot} ms; exercise_results antes: ${antes}`)

let i = 0
const rodada = () => JSON.stringify({
  roundId: `rec-${process.pid}-${i++}-${Date.now()}`,
  exerciseKind: 'memory', origem: 'recuperacao', sessionId: 'rec', score: 100,
  itens: [{ cardId: 'rec', itemRef: 'rec', correct: 1, attempts: 1, ms: 1000, kind: 'memory' }],
})
const canhao = autocannon({
  url: `${base}/api/exercises/rodada`, method: 'POST',
  headers: { 'content-type': 'application/json' },
  setupClient: (c) => { c.setBody(rodada()); c.on('response', () => c.setBody(rodada())) },
  connections: 10, duration: carga,
})

let tempoAteVoltar = -1
setTimeout(async () => {
  const pid = filho.pid
  const t0 = performance.now()
  process.kill(pid, 'SIGKILL')
  // o supervisor sobe outro; medir até o health responder 200 de novo
  await dormir(50)
  tempoAteVoltar = await esperarHealth()
  console.log(`kill -9 no pid ${pid} aos ${matarEm}s; health 200 de novo em ${tempoAteVoltar} ms (reinícios: ${reinicios})`)
}, matarEm * 1000)

const r = await new Promise((resolve) => canhao.on('done', resolve))
await dormir(500)
const depois = Number(sql('select count(*) from exercise_results'))
const integridade = sql('pragma integrity_check')
const gravadas = depois - antes
const dois = r['2xx']
console.log(`\n| métrica | valor |\n|---|---:|`)
console.log(`| requisições 2xx (cliente viu sucesso) | ${dois} |`)
console.log(`| não-2xx | ${r.non2xx} |`)
console.log(`| erros de conexão (cortadas no kill) | ${r.errors} |`)
console.log(`| linhas novas em exercise_results | ${gravadas} |`)
console.log(`| 2xx sem linha (PERDA) | ${Math.max(0, dois - gravadas)} |`)
console.log(`| linhas sem 2xx (cortadas, aceitável) | ${Math.max(0, gravadas - dois)} |`)
console.log(`| tempo até health 200 após kill | ${tempoAteVoltar} ms |`)
console.log(`| integrity_check | ${integridade} |`)
await parar()
process.exit(0)
