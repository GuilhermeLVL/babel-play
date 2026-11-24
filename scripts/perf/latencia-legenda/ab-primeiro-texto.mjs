#!/usr/bin/env node
/**
 * A/B DO PRIMEIRO TEXTO NA TELA (`primeiroTextoNaTelaMs`): a diferença das MEDIANAS das rodadas, `B − A`, com IC 95% por bootstrap
 * das RODADAS de cada lado (nenhuma fala é pareada: a métrica é uma por rodada). Critério: `resultados/2026-11-23/primeiro-texto/criterio.md`.
 *
 *   node scripts/perf/latencia-legenda/ab-primeiro-texto.mjs --rodadas DIR --a antes.desktop --b depois.desktop
 *        [--efeito-minimo-pct 20] [--semente 20261123] [--iteracoes 10000] [--nao-regressao-ms 100] [--json saida.json]
 *
 * Sem `--nao-regressao-ms`: decisão `depois melhor | depois pior | sem diferença provada` (IC inteiro abaixo/acima de 0 e efeito mínimo).
 * Com `--nao-regressao-ms N` (perfil só de não-regressão): `passa` se o limite superior do IC <= N ms, senão `falha`.
 * Recusa (código 1): menos de 10 rodadas válidas em um lado (a regra de `ab.mjs`).
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { ITERACOES_PADRAO, lerLado, MIN_RODADAS_VALIDAS, prng } from './ab.mjs'
import { mediana } from './metricas-captura.mjs'

const finito = (x) => typeof x === 'number' && Number.isFinite(x)

/** Mediana de uma reamostragem das rodadas (com reposição). */
const medianaSorteada = (v, rnd) => mediana(v.map(() => v[Math.floor(rnd() * v.length)]))

/**
 * IC 95% de `mediana(b) − mediana(a)` sobre os valores por rodada.
 * @returns {{ a: number, b: number, dif: number, ic: [number, number] }}
 */
export function compararMedianas(a, b, { iteracoes = ITERACOES_PADRAO, semente = 20261123 } = {}) {
  const rnd = prng(semente)
  const difs = []
  for (let i = 0; i < iteracoes; i++) difs.push(medianaSorteada(b, rnd) - medianaSorteada(a, rnd))
  difs.sort((x, y) => x - y)
  const q = (p) => difs[Math.min(difs.length - 1, Math.max(0, Math.floor(p * difs.length)))]
  const ma = mediana(a)
  const mb = mediana(b)
  return { a: ma, b: mb, dif: mb - ma, ic: [q(0.025), q(0.975)] }
}

export function decidir(c, { efeitoMinimoPct = 20, naoRegressaoMs = null } = {}) {
  if (naoRegressaoMs !== null) return c.ic[1] <= naoRegressaoMs ? 'passa' : 'falha'
  if (c.ic[1] < 0 && c.dif <= -(efeitoMinimoPct / 100) * c.a) return 'depois melhor'
  if (c.ic[0] > 0) return 'depois pior'
  return 'sem diferença provada'
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const opt = (n, d) => {
    const i = args.indexOf(`--${n}`)
    return i > -1 && args[i + 1] !== undefined ? args[i + 1] : d
  }
  const dir = opt('rodadas')
  const ladoA = lerLado(dir, opt('a'))
  const ladoB = lerLado(dir, opt('b'))
  const valores = (L) => L.validas.map((r) => r.metricas.primeiroTextoNaTelaMs).filter(finito)
  const va = valores(ladoA)
  const vb = valores(ladoB)
  if (va.length < MIN_RODADAS_VALIDAS || vb.length < MIN_RODADAS_VALIDAS) {
    console.error(`recusado: rodadas válidas com 1º texto (A ${va.length}, B ${vb.length}) < ${MIN_RODADAS_VALIDAS}`)
    process.exit(1)
  }
  const nr = opt('nao-regressao-ms')
  const c = compararMedianas(va, vb, {
    iteracoes: Number(opt('iteracoes', ITERACOES_PADRAO)),
    semente: Number(opt('semente', 20261123)),
  })
  const veredito = decidir(c, {
    efeitoMinimoPct: Number(opt('efeito-minimo-pct', 20)),
    naoRegressaoMs: nr === undefined ? null : Number(nr),
  })
  const lentas = (v) => v.filter((x) => x >= 2500).length / v.length
  const saida = {
    n: { a: va.length, b: vb.length },
    medianaA: c.a,
    medianaB: c.b,
    difMs: c.dif,
    ic95: c.ic,
    fracaoLentaA: lentas(va),
    fracaoLentaB: lentas(vb),
    valoresA: va,
    valoresB: vb,
    veredito,
  }
  console.log(JSON.stringify(saida, null, 1))
  const j = opt('json')
  if (j) writeFileSync(j, JSON.stringify(saida, null, 1))
}
