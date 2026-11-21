#!/usr/bin/env node
/**
 * TEMPO DE CARGA POR MODELO E FASE (`lab-medicao-legenda-traduzida`, tarefa 4.4): download, compilação e aquecimento de
 * cada modelo de STT e de MT, lidos das marcas `frasy:modelo:<fase>:inicio|fim` que a sonda guarda em `lat.marcas`.
 *
 *   node scripts/perf/latencia-legenda/carga-de-modelos.mjs <rodada.json>... [--json saida.json]
 *
 * Cada rodada de `medir.mjs` vira linhas `{ rodada, modelo, fase, ms }`. Rotule as rodadas `<config>.frio` (perfil de navegador
 * novo, nada em cache) e `<config>.quente` (o mesmo perfil, 2ª rodada): o relatório mostra os dois lado a lado.
 * Só números e o id do modelo da lista fechada; nenhum texto.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const FASES = ['download', 'compilacao', 'aquecimento']

/**
 * Pares início/fim por (modelo, fase), na ordem das marcas. A 1ª carga de cada modelo vale; recargas (o regulador desce
 * o modelo no meio da sessão) ficam de fora. Fase sem fim (a sessão acabou antes) não aparece.
 *
 * @param {{ t: number, n: string, d?: { modelo?: string } | null }[]} marcas
 * @returns {{ modelo: string, fase: string, ms: number }[]}
 */
export function temposDeCarga(marcas) {
  const abertas = new Map()
  const feitas = new Map()
  for (const m of marcas ?? []) {
    const r = /^modelo:(download|compilacao|aquecimento):(inicio|fim)$/.exec(m.n)
    if (!r || !m.d?.modelo) continue
    const chave = `${m.d.modelo}|${r[1]}`
    if (r[2] === 'inicio') {
      if (!feitas.has(chave)) abertas.set(chave, m.t)
    } else if (abertas.has(chave)) {
      feitas.set(chave, { modelo: m.d.modelo, fase: r[1], ms: Math.round((m.t - abertas.get(chave)) * 10) / 10 })
      abertas.delete(chave)
    }
  }
  return [...feitas.values()]
}

/** Linhas (uma por modelo) com as três fases e o total, de uma lista de `temposDeCarga`. */
export function linhasPorModelo(tempos) {
  const porModelo = new Map()
  for (const t of tempos) {
    if (!porModelo.has(t.modelo)) porModelo.set(t.modelo, {})
    porModelo.get(t.modelo)[t.fase] = t.ms
  }
  return [...porModelo.entries()].map(([modelo, f]) => ({
    modelo,
    ...Object.fromEntries(FASES.map((x) => [x, f[x] ?? null])),
    totalMs: Math.round(FASES.reduce((s, x) => s + (f[x] ?? 0), 0) * 10) / 10,
  }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const iJson = args.indexOf('--json')
  const arquivos = args.filter((a, i) => a.endsWith('.json') && args[i - 1] !== '--json')
  const saida = []
  console.log(
    '| rodada | modelo | download (ms) | compilação (ms) | aquecimento (ms) | total (ms) | pedidos ao Hub (nº) |',
  )
  console.log('|---|---|---|---|---|---|---|')
  for (const a of arquivos) {
    const d = JSON.parse(readFileSync(a, 'utf8'))
    for (const l of linhasPorModelo(temposDeCarga(d.lat?.marcas))) {
      saida.push({ rodada: d.rotulo, ...l, pedidosAoHub: d.pedidosAoHub ?? null })
      const n = (x) => (x === null ? '—' : Math.round(x))
      console.log(
        `| ${d.rotulo} | ${l.modelo} | ${n(l.download)} | ${n(l.compilacao)} | ${n(l.aquecimento)} | ${n(l.totalMs)} | ${d.pedidosAoHub ?? '—'} |`,
      )
    }
  }
  if (iJson > -1) writeFileSync(args[iJson + 1], JSON.stringify(saida, null, 1))
}
