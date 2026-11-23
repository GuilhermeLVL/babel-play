#!/usr/bin/env node
/**
 * VALIDAÇÃO AUTOMÁTICA do tempo por palavra do roteiro (change `parciais-incrementais`, tarefa 1.6, parte automática).
 *
 *   node scripts/perf/latencia-legenda/validar-alinhamento.mjs <roteiro.json> [--json saida.json]
 *
 * Contra as fronteiras de voz da PRÓPRIA bancada, por fala (fora do cálculo fica de fora): a 1ª palavra deve começar perto
 * do início da voz e a última terminar perto do fim. Duas réguas, para não depender de uma só:
 *   - `roteiro`: `iniS`/`fimS` da fala no roteiro (de `montar-audio.mjs`);
 *   - `energia`: primeiro e último quadro de 20 ms do áudio (o `.wav` ao lado do roteiro) com RMS >= 0,03 (−30 dBFS) dentro
 *     da janela da fala. É a mesma régua do `fimS` do roteiro, medida de novo no áudio.
 * Desvio = (palavra) − (fronteira), em ms, COM sinal (negativo = palavra antes da fronteira). Mediana e p95 do valor ABSOLUTO.
 * A amostra manual de ouvido (~20 falas) NÃO é feita aqui: fica pendente com o dono (tarefa 1.6 [D]).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { lerWav } from './wav.mjs'

const SR = 16000
const LIMIAR_RMS = 0.03

const pct = (xs, p) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!s.length) return null
  const h = (s.length - 1) * (p / 100)
  const lo = Math.floor(h)
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (h - lo)
}

/** Primeiro e último instante (s) com RMS >= limiar em [de, ate] (quadros de 20 ms). `null` sem voz. */
export function fronteirasPorEnergia(x, de, ate, sr = SR) {
  const q = Math.round(sr * 0.02)
  let ini = null
  let fim = null
  for (let i = Math.max(0, Math.floor(de * sr)); i + q <= Math.min(x.length, Math.ceil(ate * sr)); i += q) {
    let s = 0
    for (let j = 0; j < q; j++) s += x[i + j] * x[i + j]
    if (Math.sqrt(s / q) >= LIMIAR_RMS) {
      if (ini === null) ini = i / sr
      fim = (i + q) / sr
    }
  }
  return ini === null ? null : { iniS: ini, fimS: fim }
}

/** Desvios (ms) por fala e o resumo. `x` = amostras do áudio do roteiro. */
export function validar(roteiro, x) {
  const falas = []
  for (const f of roteiro.falas) {
    if (!f.palavras?.length || f.alinhamento?.foraDoCalculo) continue
    const p0 = f.palavras[0]
    const pN = f.palavras[f.palavras.length - 1]
    const en = fronteirasPorEnergia(x, f.iniS - 0.3, f.fimS + 0.3)
    falas.push({
      k: f.k,
      id: f.id,
      inicioVsRoteiroMs: Math.round((p0.iniS - f.iniS) * 1000),
      fimVsRoteiroMs: Math.round((pN.fimS - f.fimS) * 1000),
      inicioVsEnergiaMs: en ? Math.round((p0.iniS - en.iniS) * 1000) : null,
      fimVsEnergiaMs: en ? Math.round((pN.fimS - en.fimS) * 1000) : null,
    })
  }
  const campo = (k) => falas.map((f) => f[k])
  const res = (xs) => ({
    n: xs.filter(Number.isFinite).length,
    medianaAbsMs: pct(xs.map(Math.abs), 50),
    p95AbsMs: pct(xs.map(Math.abs), 95),
    medianaComSinalMs: pct(xs, 50),
  })
  const todas = [
    ...campo('inicioVsRoteiroMs'),
    ...campo('fimVsRoteiroMs'),
    ...campo('inicioVsEnergiaMs'),
    ...campo('fimVsEnergiaMs'),
  ]
  return {
    falasValidadas: falas.length,
    inicioVsRoteiro: res(campo('inicioVsRoteiroMs')),
    fimVsRoteiro: res(campo('fimVsRoteiroMs')),
    inicioVsEnergia: res(campo('inicioVsEnergiaMs')),
    fimVsEnergia: res(campo('fimVsEnergiaMs')),
    todasAsFronteiras: res(todas),
    falas,
  }
}

if (process.argv[1] && process.argv[1].endsWith('validar-alinhamento.mjs')) {
  const arq = process.argv[2]
  if (!arq) throw new Error('uso: validar-alinhamento.mjs <roteiro.json> [--json saida.json]')
  const roteiro = JSON.parse(readFileSync(arq, 'utf8'))
  const x = lerWav(readFileSync(arq.replace(/\.json$/, '.wav')), { sr: SR }).amostras
  const r = validar(roteiro, x)
  const foraDoCalculo = roteiro.falas.filter((f) => f.alinhamento?.foraDoCalculo).length
  console.log(`falas validadas: ${r.falasValidadas} (fora do cálculo, <90% casadas: ${foraDoCalculo})`)
  for (const k of ['inicioVsRoteiro', 'fimVsRoteiro', 'inicioVsEnergia', 'fimVsEnergia', 'todasAsFronteiras'])
    console.log(
      `${k.padEnd(18)} n ${r[k].n} | mediana |desvio| ${r[k].medianaAbsMs} ms | p95 ${r[k].p95AbsMs} ms | mediana com sinal ${r[k].medianaComSinalMs} ms`,
    )
  for (const f of r.falas) console.log(' ', JSON.stringify(f))
  const j = process.argv.indexOf('--json')
  if (j > -1) writeFileSync(path.resolve(process.argv[j + 1]), JSON.stringify({ foraDoCalculo, ...r }, null, 1))
}
