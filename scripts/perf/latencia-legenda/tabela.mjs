#!/usr/bin/env node
/**
 * TABELA do relatório: uma linha por configuração (rodadas `id.rN` somadas), em Markdown.
 *
 *   node scripts/perf/latencia-legenda/tabela.mjs <dir-das-rodadas> [--pular 1] [--json saida.json]
 *
 * `--pular 1` descarta a 1ª fala de cada rodada (aquecimento do laço de decode).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { analisarRodada, resumir } from './analisar.mjs'

const args = process.argv.slice(2)
const dir = args[0]
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i > -1 && args[i + 1] ? args[i + 1] : d
}
const PULAR = Number(opt('pular', 1))
const grupos = new Map()
for (const f of readdirSync(dir).filter(
  (f) => f.endsWith('.json') && !f.startsWith('smoke') && !f.startsWith('frio'),
)) {
  const d = JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
  const id = d.rotulo.replace(/\.r\d+$/, '')
  const r = analisarRodada(d, PULAR)
  if (!grupos.has(id)) grupos.set(id, [])
  grupos.get(id).push({ r, d })
}
const fmt = (m) => (m ? `${m.p50} / ${m.p95}` : '—')
const linhas = []
const json = {}
for (const [id, rs] of [...grupos.entries()].sort()) {
  const s = resumir(rs.map((x) => x.r))
  const r0 = rs[0].r
  const lag = rs.flatMap((x) =>
    (x.d.lat.lag || []).filter((l) => l[0] > (x.d.tIniciarPerf || 0) + 30_000).map((l) => l[1]),
  )
  const lagOrd = [...lag].sort((a, b) => a - b)
  const lagMax = lagOrd.length ? lagOrd[lagOrd.length - 1] : 0
  json[id] = {
    resumo: s,
    modelo: r0.modeloStt,
    dispositivos: r0.dispositivos,
    carga: rs.map((x) => x.r.carga),
    lagMax,
    lagN: lag.length,
  }
  linhas.push(
    `| ${id} | ${(r0.modeloStt || '?').split('/').pop()} · ${r0.dispositivos.filter((x) => x).join('+') || '?'}${rs[0].d.config.headless ? ' · headless' : ''} | ${s.n} | ${rs.map((x) => x.r.carga.sttProntoMs).join(', ')} | ${fmt(s.inicioAoPrimeiroTexto)} | ${fmt(s.vad)} | ${fmt(s.sttEspera)} | ${fmt(s.stt)} | ${fmt(s.mt)} | ${fmt(s.fimAoOriginal)} | ${fmt(s.fimATraducao)} | ${s.motoresMt.join(', ')} |`,
  )
}
console.log(
  '| config | STT · backend | falas | STT pronto (ms) | início→1º texto | VAD fecha | espera parcial | STT final | MT | FIM→original | FIM→tradução | MT usada |\n|---|---|---|---|---|---|---|---|---|---|---|---|',
)
console.log(linhas.join('\n'))
const j = opt('json', '')
if (j) writeFileSync(j, JSON.stringify(json, null, 1))
