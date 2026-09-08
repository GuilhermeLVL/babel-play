#!/usr/bin/env node
/**
 * LATÊNCIA POR ROTA, EM PERCENTIS — p50 / p95 / p99 sob carga leve, com autocannon.
 *
 * `medir-rotas.mjs` responde "quanto pesa cada tela" com 15 requisições em série; isto responde
 * "como a rota se comporta com 10 conexões ao mesmo tempo", que é o cenário de um usuário com
 * duas abas ou de meia dúzia de usuários. É o número de partida da rodada de saneamento
 * (2026-09-08) e o mesmo comando roda no fim, contra a mesma cópia do banco.
 *
 *   node scripts/perf/latencia.mjs --api=http://127.0.0.1:3101 [--duracao=20] [--conexoes=10]
 *                                  [--card=<id de vocab_cards>] [--saida=arquivo.json]
 *
 * O servidor precisa estar de pé em modo self-host (`AUTH_REQUIRED=0`) e apontando para uma
 * CÓPIA do banco: as rotas de escrita gravam de verdade (`review_logs`, `exercise_results`).
 * `127.0.0.1`, nunca `localhost` (ver medir-rotas.mjs: ~200 ms fantasma de IPv6 no Windows).
 *
 * Cada rota tem um aquecimento de 3 s descartado antes da medição.
 */
import autocannon from 'autocannon'
import { writeFileSync } from 'node:fs'

const arg = (nome, padrao) => {
  const a = process.argv.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}
const base = arg('api', '').replace(/\/+$/, '')
if (!base) {
  console.error('uso: node scripts/perf/latencia.mjs --api=http://127.0.0.1:3101')
  process.exit(2)
}
const duracao = Number(arg('duracao', 20))
const conexoes = Number(arg('conexoes', 10))
const card = arg('card', '')
const saida = arg('saida', '')

const json = { 'content-type': 'application/json', accept: 'application/json' }
const rodada = (i) => ({
  roundId: `perf-${process.pid}-${i}-${Date.now()}`,
  exerciseKind: 'memory',
  origem: 'perf',
  sessionId: 'perf',
  score: 100,
  itens: [{ cardId: card || 'perf', itemRef: 'perf', correct: 1, attempts: 1, ms: 1200, kind: 'memory' }],
})

/** Rotas críticas: as que o lobby, a rodada, a revisão FSRS e as estatísticas chamam. */
const ROTAS = [
  { nome: 'GET /api/health', path: '/api/health' },
  { nome: 'GET /api/me', path: '/api/me' },
  { nome: 'GET /api/metrics/profile', path: '/api/metrics/profile' },
  { nome: 'GET /api/metrics/xp', path: '/api/metrics/xp' },
  { nome: 'GET /api/exercises/recordes', path: '/api/exercises/recordes' },
  { nome: 'GET /api/vocab/para-jogo', path: '/api/vocab/para-jogo?fonte=baralho&limite=40&estrategia=equilibrado' },
  { nome: 'GET /api/vocab (deck inteiro)', path: '/api/vocab' },
  { nome: 'GET /api/sessions', path: '/api/sessions' },
  { nome: 'GET /api/exercises/results', path: '/api/exercises/results?limite=20' },
  { nome: 'GET /api/rank/termo', path: '/api/rank/termo' },
  { nome: 'POST /api/exercises/rodada', path: '/api/exercises/rodada', method: 'POST', headers: json, setupClient: (c) => { let i = 0; c.setBody(JSON.stringify(rodada(i))); c.on('response', () => c.setBody(JSON.stringify(rodada(++i)))) } },
  ...(card ? [{ nome: 'POST /api/vocab/:id/review (FSRS)', path: `/api/vocab/${card}/review`, method: 'POST', headers: json, body: JSON.stringify({ grade: 3 }) }] : []),
]

async function correr(rota, segundos) {
  return await autocannon({
    url: base + rota.path,
    method: rota.method || 'GET',
    headers: rota.headers,
    body: rota.body,
    setupClient: rota.setupClient,
    connections: conexoes,
    duration: segundos,
  })
}

const resultados = []
console.log(`# latencia — ${base} — ${conexoes} conexoes, ${duracao}s por rota, ${new Date().toISOString()}, ${process.version}\n`)
console.log('| rota | p50 ms | p95 ms | p99 ms | req/s | não-2xx | erros |')
console.log('|---|---:|---:|---:|---:|---:|---:|')
for (const rota of ROTAS) {
  await correr(rota, 3) // aquecimento, descartado
  const r = await correr(rota, duracao)
  const linha = {
    rota: rota.nome,
    p50: r.latency.p50,
    p95: r.latency.p97_5 !== undefined && r.latency.p95 === undefined ? r.latency.p97_5 : r.latency.p95,
    p99: r.latency.p99,
    reqPorSegundo: Math.round(r.requests.average),
    nao2xx: r.non2xx,
    erros: r.errors,
  }
  resultados.push(linha)
  console.log(`| ${linha.rota} | ${linha.p50} | ${linha.p95} | ${linha.p99} | ${linha.reqPorSegundo} | ${linha.nao2xx} | ${linha.erros} |`)
}
if (saida) writeFileSync(saida, JSON.stringify({ base, conexoes, duracao, node: process.version, em: new Date().toISOString(), resultados }, null, 2))
