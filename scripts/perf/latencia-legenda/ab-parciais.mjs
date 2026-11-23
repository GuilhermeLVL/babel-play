#!/usr/bin/env node
/**
 * A/B DOS PARCIAIS (change `parciais-incrementais`, tarefas 2.6, 3.3 e 4.3): a diferença PAREADA B − A, fala a fala, de
 *   - `atrasoDePalavraMs` p50 e p90 (original e tradução),
 *   - `erasure` (original e tradução),
 *   - `fimDaFalaAteLegendaMs` p75,
 * mais as guardas dos critérios (texto final, SLO da bancada) e o veredito de cada variante. Protocolo e leitura de cada número:
 * `scripts/perf/latencia-legenda/resultados/2026-11-21/parciais-multibraco/protocolo.md`.
 *
 *   node scripts/perf/latencia-legenda/ab-parciais.mjs --rodadas DIR --a PREFIXO --b PREFIXO --variante v1|v1b|v1c|v3|v4 \
 *        --criterio criterio.md [--efeito-minimo-pct 20] [--teto-final-ms 30] [--semente N] [--iteracoes 10000] [--json saida.json] [--ensaio] [--informativo]
 *
 * O bootstrap sorteia as FALAS com reposição e, dentro de cada uma, as rodadas de cada lado com reposição; o estatístico é calculado
 * sobre as palavras (ou as somas de erasure) de tudo o que foi sorteado: o atraso por palavra é sempre das palavras somadas, nunca a
 * mediana de medianas. `--informativo` imprime os números sem veredito (a comparação auxiliar de V3 contra `atual`).
 * Recusas (código 1, nenhum número): as de `ab.mjs` (menos de 10 rodadas válidas por lado, critério ausente ou fora do git).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { tokenizar } from '../../../src/core/legendas/medidasDeParcial.ts'
import {
  avaliarGuardas,
  bootstrapPareado,
  estadoDoCriterio,
  ITERACOES_PADRAO,
  lerLado,
  parearPorFala,
  prng,
  recusas,
  SEMENTE_PADRAO,
  tabelaDeGuardas,
} from './ab.mjs'
import { mediana } from './metricas-captura.mjs'
import { percentilDe } from './palavras-da-fala.mjs'

const finito = (x) => typeof x === 'number' && Number.isFinite(x)

// ───────────────────────────── estatísticos sobre unidades (uma por fala e rodada) ─────────────────────────────

/** Percentil p das palavras de todas as unidades (cada unidade é a lista de atrasos de uma fala numa rodada). */
export const estatDeAtraso = (p) => (unidades) => percentilDe(unidades.flat(), p)

/** Σ apagadas ÷ Σ palavras finais (cada unidade é `{ apagadas, final }`). */
export function estatDeErasure(unidades) {
  const final = unidades.reduce((s, u) => s + u.final, 0)
  return final ? unidades.reduce((s, u) => s + u.apagadas, 0) / final : null
}

/**
 * Unidades por fala, nos dois lados. `extrai(rodada, k)` devolve a unidade ou `null`; só entram as falas com ao menos uma unidade
 * nos DOIS lados.
 * @returns {{ k: number, a: any[], b: any[] }[]}
 */
export function unidadesPorFala(ladoA, ladoB, extrai) {
  const n = Math.max(0, ...[...ladoA, ...ladoB].map((r) => r.palavras?.length ?? 0))
  const falas = []
  for (let k = 0; k < n; k++) {
    const a = ladoA.map((r) => extrai(r, k)).filter((u) => u !== null && u !== undefined)
    const b = ladoB.map((r) => extrai(r, k)).filter((u) => u !== null && u !== undefined)
    if (a.length && b.length) falas.push({ k, a, b })
  }
  return falas
}

/** Atrasos de uma fala numa rodada (`null` sem palavras medidas: fora do cálculo, sem roteiro ou sem casamento). */
export const atrasoDe = (campo) => (r, k) => {
  const p = r.palavras?.[k]
  if (!p || p.foraDoCalculo) return null
  const xs = p[campo]
  return xs?.length ? xs : null
}

/** Erasure de uma fala numa rodada (`null` sem balão ou sem palavras finais). */
export const erasureDe = (campo) => (r, k) => {
  const e = r.palavras?.[k]?.[campo]
  return e && e.final > 0 ? e : null
}

/**
 * Diferença pareada B − A de um estatístico sobre as unidades, IC 95% por bootstrap (semente fixa).
 * @returns {{ a: number|null, b: number|null, dif: number|null, ic95: [number, number]|null, falas: number }}
 */
export function bootstrapDeUnidades(falas, estat, { iteracoes = ITERACOES_PADRAO, semente = SEMENTE_PADRAO } = {}) {
  if (!falas.length) return { a: null, b: null, dif: null, ic95: null, icB: null, falas: 0 }
  const rnd = prng(semente)
  const sorteia = (xs) => xs[Math.floor(rnd() * xs.length)]
  const juntar = (lista) => lista.map(() => sorteia(lista))
  const difs = []
  const bs = []
  for (let i = 0; i < iteracoes; i++) {
    const a = []
    const b = []
    for (let j = 0; j < falas.length; j++) {
      const f = sorteia(falas)
      a.push(...juntar(f.a))
      b.push(...juntar(f.b))
    }
    const ea = estat(a)
    const eb = estat(b)
    if (finito(ea) && finito(eb)) difs.push(eb - ea)
    if (finito(eb)) bs.push(eb)
  }
  const a = estat(falas.flatMap((f) => f.a))
  const b = estat(falas.flatMap((f) => f.b))
  return {
    a,
    b,
    dif: finito(a) && finito(b) ? b - a : null,
    ic95: difs.length ? [percentilDe(difs, 2.5), percentilDe(difs, 97.5)] : null,
    /** IC 95% do estatístico de B sozinho (o orçamento absoluto de V4). */
    icB: bs.length ? [percentilDe(bs, 2.5), percentilDe(bs, 97.5)] : null,
    falas: falas.length,
  }
}

// ───────────────────────────── texto final ─────────────────────────────

/** Distância de edição por palavra (Levenshtein). */
export function distanciaDePalavras(ref, hip) {
  const d = Array.from({ length: ref.length + 1 }, (_, i) => [i, ...new Array(hip.length).fill(0)])
  for (let j = 0; j <= hip.length; j++) d[0][j] = j
  for (let i = 1; i <= ref.length; i++)
    for (let j = 1; j <= hip.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] === hip[j - 1] ? 0 : 1))
  return d[ref.length][hip.length]
}

const wer = (rodadas, campo, referencias) => {
  let erros = 0
  let total = 0
  for (const r of rodadas)
    (r[campo] ?? []).forEach((texto, k) => {
      const ref = referencias?.[k]
      if (!ref || texto === null || texto === undefined) return
      const rt = tokenizar(ref)
      erros += distanciaDePalavras(rt, tokenizar(texto))
      total += rt.length
    })
  return total ? erros / total : null
}

/** Unidade do WER pareado: erros e palavras de referência de uma fala numa rodada (`null` sem texto ou sem referência). */
export const werDe = (referencias) => (r, k) => {
  const ref = referencias?.[k]
  const texto = r.textos?.[k]
  if (!ref || typeof texto !== 'string') return null
  const rt = tokenizar(ref)
  return rt.length ? { erros: distanciaDePalavras(rt, tokenizar(texto)), total: rt.length } : null
}

/** Σ erros ÷ Σ palavras de referência (cada unidade é `{ erros, total }`). */
export function estatDeWer(unidades) {
  const total = unidades.reduce((s, u) => s + u.total, 0)
  return total ? unidades.reduce((s, u) => s + u.erros, 0) / total : null
}

/**
 * O texto final é intocado? Por fala, o texto de cada rodada de B tem de estar entre os que A produziu naquela fala (o conjunto de A é a
 * régua: o Moonshine varia de uma rodada para outra pela janela do VAD). `campo` é `textos` (original) ou `traducoes`.
 */
export function conferirFinais(ladoA, ladoB, campo, referencias = null) {
  const n = Math.max(0, ...[...ladoA, ...ladoB].map((r) => r[campo]?.length ?? 0))
  const norm = (t) => tokenizar(t).join(' ')
  const fora = []
  let comparadas = 0
  let divergentesEmA = 0
  let foraNormalizado = 0
  for (let k = 0; k < n; k++) {
    const doA = ladoA.map((r) => r[campo]?.[k]).filter((t) => typeof t === 'string')
    const doB = ladoB.map((r) => r[campo]?.[k]).filter((t) => typeof t === 'string')
    if (!doA.length || !doB.length) continue
    const conjuntoA = new Set(doA.map((t) => t.trim()))
    const conjuntoANorm = new Set(doA.map(norm))
    if (conjuntoA.size > 1) divergentesEmA++
    for (const t of doB) {
      comparadas++
      if (!conjuntoA.has(t.trim())) fora.push({ k, texto: t })
      if (!conjuntoANorm.has(norm(t))) foraNormalizado++
    }
  }
  return {
    comparadas,
    foraDoConjuntoDeA: fora.length,
    foraNormalizado,
    divergentesEmA,
    exemplos: fora.slice(0, 5),
    werA: referencias ? wer(ladoA, campo, referencias) : null,
    werB: referencias ? wer(ladoB, campo, referencias) : null,
  }
}

// ───────────────────────────── veredito ─────────────────────────────

/** Uma guarda de IC: `ok` quando o limite superior do IC da diferença fica em `teto` ou abaixo dele. */
const guardaPorTeto = (nome, r, teto, fmt = (x) => x.toFixed(3)) =>
  !r.ic95
    ? { nome, status: 'sem-medida', detalhe: 'sem dados nos dois lados' }
    : {
        nome,
        status: r.ic95[1] <= teto ? 'ok' : 'piorou',
        detalhe: `dif ${fmt(r.dif)}, IC 95% [${fmt(r.ic95[0])}, ${fmt(r.ic95[1])}], limite superior ≤ ${fmt(teto)}`,
      }

/** Guarda "piorou" só com piora PROVADA: o IC 95% inteiro acima de 0. */
const guardaSemPioraProvada = (nome, r, fmt = (x) => x.toFixed(0)) =>
  !r.ic95
    ? { nome, status: 'sem-medida', detalhe: 'sem dados nos dois lados' }
    : {
        nome,
        status: r.ic95[0] > 0 ? 'piorou' : 'ok',
        detalhe: `dif ${fmt(r.dif)}, IC 95% [${fmt(r.ic95[0])}, ${fmt(r.ic95[1])}], reprova só com o IC inteiro acima de 0`,
      }

/**
 * O veredito do critério. APROVADO = primária (IC inteiro abaixo de 0 e efeito >= `efeitoMinimoPct`) E nenhuma guarda reprovada;
 * REPROVADO = guarda reprovada ou primária pior (IC inteiro acima de 0); senão SEM DIFERENÇA PROVADA.
 */
export function vereditoDoCriterio(primaria, guardas, efeitoMinimoPct = 20) {
  const reprovadas = guardas.filter((g) => g.status === 'piorou')
  const efeito = primaria.a ? (-primaria.dif / primaria.a) * 100 : 0
  const ganha = !!primaria.ic95 && primaria.ic95[1] < 0 && efeito >= efeitoMinimoPct
  const pior = !!primaria.ic95 && primaria.ic95[0] > 0
  const veredito = reprovadas.length || pior ? 'REPROVADO' : ganha ? 'APROVADO' : 'SEM DIFERENÇA PROVADA'
  return {
    veredito,
    efeitoPct: efeito,
    primariaGanha: ganha,
    primariaPior: pior,
    reprovadas: reprovadas.map((g) => g.nome),
  }
}

/** Todas as medidas de uma comparação A × B. */
/** `fimDaFalaAteOriginalMs` pareado por fala (a regra de `fimDaFalaAteLegendaMs`): `null` sem falas pareadas ou sem o campo nas rodadas. */
export function finalDoOriginal(A, B, opcoes) {
  const falas = parearPorFala(
    A.validas.map((r) => ({ porFala: r.porFalaOriginal ?? [] })),
    B.validas.map((r) => ({ porFala: r.porFalaOriginal ?? [] })),
  )
  return falas.length ? bootstrapPareado(falas, opcoes) : null
}

export function compararParciais(A, B, { iteracoes = ITERACOES_PADRAO, semente = SEMENTE_PADRAO } = {}) {
  const bs = (extrai, estat) =>
    bootstrapDeUnidades(unidadesPorFala(A.validas, B.validas, extrai), estat, { iteracoes, semente })
  const falasLegenda = parearPorFala(A.validas, B.validas)
  const medianaDosPrimeiros = (L) => mediana(L.validas.map((r) => r.metricas.primeiroTextoNaTelaMs).filter(finito))
  const pa = medianaDosPrimeiros(A)
  const pb = medianaDosPrimeiros(B)
  return {
    atrasoOriginal: {
      p50: bs(atrasoDe('atrasoOriginalMs'), estatDeAtraso(50)),
      p90: bs(atrasoDe('atrasoOriginalMs'), estatDeAtraso(90)),
    },
    atrasoTraducao: {
      p50: bs(atrasoDe('atrasoTraducaoMs'), estatDeAtraso(50)),
      p90: bs(atrasoDe('atrasoTraducaoMs'), estatDeAtraso(90)),
    },
    erasureOriginal: bs(erasureDe('erasureOriginal'), estatDeErasure),
    erasureTraducao: bs(erasureDe('erasureTraducao'), estatDeErasure),
    fimDaFala: falasLegenda.length ? bootstrapPareado(falasLegenda, { iteracoes, semente }) : null,
    // Guarda 1 SEM tradução (pt para pt): o mesmo bootstrap, sobre o quadro do texto final do ORIGINAL.
    fimDoOriginal: finalDoOriginal(A, B, { iteracoes, semente }),
    primeiroTextoNaTelaMs: { a: pa, b: pb, dif: finito(pa) && finito(pb) ? pb - pa : null },
    werFinal: bs(werDe(A.referencias ?? B.referencias), estatDeWer),
    textos: conferirFinais(A.validas, B.validas, 'textos', A.referencias ?? B.referencias),
    traducoes: conferirFinais(A.validas, B.validas, 'traducoes'),
  }
}

/** Teto do limite superior do IC do p75 do final em V1b (ms; a resolução da bancada é ~100 ms, ver o critério). */
export const TETO_P75_V1B_MS = 30
/** Teto do limite superior do IC do WER pareado do final em V1b (+2 pontos percentuais). */
export const TETO_WER_V1B = 0.02

/** Orçamento de pisca de V4 (decisão do dono): erasure do original de B, média e limite superior do IC 95% de B. */
export const ORCAMENTO_ERASURE_V4_MEDIA = 0.5
export const ORCAMENTO_ERASURE_V4_LIMITE = 0.6

/** Guarda ABSOLUTA da erasure de B (V4): média <= 0,5 E limite superior do IC 95% de B <= 0,6. A de A e a diferença só informam. */
export function guardaOrcamentoDeErasure(r, media = ORCAMENTO_ERASURE_V4_MEDIA, limite = ORCAMENTO_ERASURE_V4_LIMITE) {
  const nome = `erasureOriginal de B (V4: orçamento absoluto, média ≤ ${media} e limite superior do IC ≤ ${limite})`
  if (!finito(r.b) || !r.icB) return { nome, status: 'sem-medida', detalhe: 'sem dados em B' }
  const ok = r.b <= media && r.icB[1] <= limite
  const dif =
    finito(r.dif) && r.ic95
      ? `; A ${r.a.toFixed(3)}, B − A ${r.dif.toFixed(3)} (IC [${r.ic95[0].toFixed(3)}, ${r.ic95[1].toFixed(3)}], só informativo)`
      : ''
  return {
    nome,
    status: ok ? 'ok' : 'piorou',
    detalhe: `B média ${r.b.toFixed(3)}, IC 95% de B [${r.icB[0].toFixed(3)}, ${r.icB[1].toFixed(3)}]${dif}`,
  }
}

/** Guardas e veredito de uma variante (`v1`, `v1b`, `v1c`, `v3` ou `v4`) sobre a saída de `compararParciais`. */
export function julgarVariante(variante, c, guardasDoSlo, efeitoMinimoPct = 20, tetoFinalMs) {
  const v1b = variante === 'v1b' || variante === 'v1c' || variante === 'v4' // V1c e V4 usam as mesmas guardas da V1b (V4 troca a da erasure)
  // `tetoFinalMs` (V7: decisão do dono, +100 ms = a resolução da bancada) vale só quando passado; sem ele, os vereditos antigos não mudam.
  const tetoP75 = Number.isFinite(tetoFinalMs) ? tetoFinalMs : v1b ? TETO_P75_V1B_MS : 0
  const primaria = variante === 'v3' ? c.atrasoTraducao.p50 : c.atrasoOriginal.p50
  const guardas = []
  if (c.fimDaFala) {
    const p75 = c.fimDaFala.p75
    guardas.push({
      nome: 'fimDaFalaAteLegendaMs p75',
      status: p75.ic95[1] <= tetoP75 ? 'ok' : 'piorou',
      detalhe: `dif ${Math.round(p75.dif)} ms, IC 95% [${Math.round(p75.ic95[0])}, ${Math.round(p75.ic95[1])}], limite superior ≤ ${tetoP75} ms`,
    })
  } else if (c.fimDoOriginal) {
    // Sem tradução (pt para pt) a guarda 1 vale sobre o final do ORIGINAL: o mesmo limite (+30 ms), o mesmo IC, só muda o quadro medido.
    const p75 = c.fimDoOriginal.p75
    guardas.push({
      nome: 'fimDaFalaAteOriginalMs p75 (guarda 1 sem tradução)',
      status: p75.ic95[1] <= tetoP75 ? 'ok' : 'piorou',
      detalhe: `dif ${Math.round(p75.dif)} ms, IC 95% [${Math.round(p75.ic95[0])}, ${Math.round(p75.ic95[1])}], limite superior ≤ ${tetoP75} ms`,
    })
  } else guardas.push({ nome: 'fimDaFalaAteLegendaMs p75', status: 'sem-medida', detalhe: 'sem falas pareadas' })
  guardas.push(
    variante === 'v4'
      ? guardaOrcamentoDeErasure(c.erasureOriginal)
      : guardaPorTeto('erasureOriginal (Emenda 1: não piorar contra A)', c.erasureOriginal, 0.05),
  )
  if (variante === 'v3') {
    guardas.push(guardaPorTeto('erasureTraducao (Emenda 1: não piorar contra A)', c.erasureTraducao, 0.05))
    guardas.push(guardaSemPioraProvada('atrasoDePalavraMs p50 do original (não pode piorar)', c.atrasoOriginal.p50))
  }
  const doConjunto = `${c.textos.foraDoConjuntoDeA} de ${c.textos.comparadas} textos de B fora do conjunto de A (normalizado: ${c.textos.foraNormalizado}); WER A ${fmtPct(c.textos.werA)}, B ${fmtPct(c.textos.werB)}; falas em que A varia entre rodadas: ${c.textos.divergentesEmA}`
  if (v1b)
    guardas.push(
      guardaPorTeto(
        'WER pareado do texto final (limite superior ≤ +2 pp)',
        c.werFinal,
        TETO_WER_V1B,
        (x) => `${x < 0 ? '−' : '+'}${Math.abs(x * 100).toFixed(1)} pp`,
      ),
      { nome: 'texto final fora do conjunto de A (informativo)', status: 'ok', detalhe: doConjunto },
    )
  else
    guardas.push({
      nome: 'texto final do original',
      status: c.textos.foraDoConjuntoDeA ? 'piorou' : 'ok',
      detalhe: doConjunto,
    })
  if (variante === 'v3')
    guardas.push({
      nome: 'tradução final',
      status: c.traducoes.foraDoConjuntoDeA ? 'piorou' : 'ok',
      detalhe: `${c.traducoes.foraDoConjuntoDeA} de ${c.traducoes.comparadas} traduções de B fora do conjunto de A (normalizado: ${c.traducoes.foraNormalizado}); falas em que A varia entre rodadas: ${c.traducoes.divergentesEmA}`,
    })
  for (const g of guardasDoSlo)
    guardas.push({
      nome: `SLO ${g.nome}`,
      status: g.status === 'piorou' ? 'piorou' : g.status === 'ok' ? 'ok' : 'sem-medida',
      detalhe: `A ${fmtNum(g.a)}, B ${fmtNum(g.b)}, limite ${fmtNum(g.limite)}`,
    })
  return { primaria, guardas, ...vereditoDoCriterio(primaria, guardas, efeitoMinimoPct) }
}

const fmtNum = (x) => (finito(x) ? String(Number(x.toFixed(3))) : '—')
const fmtPct = (x) => (finito(x) ? `${(x * 100).toFixed(1)}%` : '—')
const n0 = (x) => (finito(x) ? String(Math.round(x)) : '—')
const sinal = (x, casas = 0) => (finito(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(casas)}` : '—')

const linhaDeIc = (nome, r, casas = 0) =>
  `| ${nome} | ${casas ? r.a?.toFixed(casas) : n0(r.a)} | ${casas ? r.b?.toFixed(casas) : n0(r.b)} | ${sinal(r.dif, casas)} | ${r.ic95 ? `[${sinal(r.ic95[0], casas)}, ${sinal(r.ic95[1], casas)}]` : '—'} | ${r.falas ?? ''} |`

export function tabelaDeParciais(c) {
  return [
    '| métrica | A | B | B − A | IC 95% da diferença | falas |',
    '|---|---|---|---|---|---|',
    linhaDeIc('atraso por palavra, original, p50 (ms)', c.atrasoOriginal.p50),
    linhaDeIc('atraso por palavra, original, p90 (ms)', c.atrasoOriginal.p90),
    linhaDeIc('atraso por palavra, tradução (proxy), p50 (ms)', c.atrasoTraducao.p50),
    linhaDeIc('atraso por palavra, tradução (proxy), p90 (ms)', c.atrasoTraducao.p90),
    linhaDeIc('erasure do original', c.erasureOriginal, 3),
    linhaDeIc('erasure da tradução (proxy)', c.erasureTraducao, 3),
    c.fimDaFala
      ? `| fimDaFalaAteLegendaMs p75 (ms) | ${n0(c.fimDaFala.p75.a)} | ${n0(c.fimDaFala.p75.b)} | ${sinal(c.fimDaFala.p75.dif)} | [${sinal(c.fimDaFala.p75.ic95[0])}, ${sinal(c.fimDaFala.p75.ic95[1])}] | |`
      : '| fimDaFalaAteLegendaMs p75 | — | — | — | — | |',
    ...(c.fimDoOriginal
      ? [
          `| fimDaFalaAteOriginalMs p75 (ms) | ${n0(c.fimDoOriginal.p75.a)} | ${n0(c.fimDoOriginal.p75.b)} | ${sinal(c.fimDoOriginal.p75.dif)} | [${sinal(c.fimDoOriginal.p75.ic95[0])}, ${sinal(c.fimDoOriginal.p75.ic95[1])}] | |`,
        ]
      : []),
    `| 1º texto na tela (mediana das rodadas, ms) | ${n0(c.primeiroTextoNaTelaMs.a)} | ${n0(c.primeiroTextoNaTelaMs.b)} | ${sinal(c.primeiroTextoNaTelaMs.dif)} | (sem IC: medida de rodada) | |`,
  ].join('\n')
}

export function tabelaDeJuizo(j) {
  return [
    '| guarda | situação | detalhe |',
    '|---|---|---|',
    ...j.guardas.map((g) => `| ${g.nome} | ${g.status === 'piorou' ? '**reprovou**' : g.status} | ${g.detalhe} |`),
  ].join('\n')
}

// ───────────────────────────── CLI ─────────────────────────────

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const opt = (n, d) => {
    const i = args.indexOf(`--${n}`)
    return i > -1 && args[i + 1] !== undefined ? args[i + 1] : d
  }
  const dir = opt('rodadas')
  const pa = opt('a')
  const pb = opt('b')
  const variante = opt('variante', 'v1')
  if (!dir || !pa || !pb)
    throw new Error(
      'uso: ab-parciais.mjs --rodadas DIR --a PREFIXO --b PREFIXO --variante v1|v1b|v1c|v3|v4 --criterio criterio.md',
    )
  const ensaio = args.includes('--ensaio')
  const informativo = args.includes('--informativo')
  const A = lerLado(dir, pa)
  const B = lerLado(dir, pb)
  const criterio = estadoDoCriterio(opt('criterio', 'criterio.md'))
  const primeira = Math.min(A.primeiraRodadaEm ?? Infinity, B.primeiraRodadaEm ?? Infinity)
  const motivos = recusas({
    validasA: A.validas.length,
    validasB: B.validas.length,
    criterio,
    primeiraRodadaEm: Number.isFinite(primeira) ? primeira : null,
    ensaio,
  })
  for (const i of [...A.invalidas, ...B.invalidas]) console.error(`rodada inválida ${i.rotulo}: ${i.motivo}`)
  if (motivos.length) {
    console.error(`A/B recusado, nenhum número foi calculado:\n- ${motivos.join('\n- ')}`)
    process.exit(1)
  }
  const iteracoes = Number(opt('iteracoes', ITERACOES_PADRAO))
  const semente = Number(opt('semente', SEMENTE_PADRAO))
  const efeitoMinimoPct = Number(opt('efeito-minimo-pct', 20))
  const c = compararParciais(A, B, { iteracoes, semente })
  const arqSlo = opt('slo', path.join(path.dirname(fileURLToPath(import.meta.url)), 'slo-captura.json'))
  const guardasDoSlo = avaliarGuardas(A.validas, B.validas, JSON.parse(readFileSync(arqSlo, 'utf8')))
  const tetoArg = opt('teto-final-ms', undefined)
  const j = julgarVariante(
    variante,
    c,
    guardasDoSlo,
    efeitoMinimoPct,
    tetoArg === undefined ? undefined : Number(tetoArg),
  )
  const saida = [
    `### A/B dos parciais (${variante}) — A=${pa} (${A.validas.length} rodadas) × B=${pb} (${B.validas.length} rodadas)`,
    '',
    `Bootstrap pareado por fala de ${iteracoes} reamostragens, semente ${semente}, IC 95%.`,
    '',
    tabelaDeParciais(c),
    '',
    'Guardas do SLO (mediana das rodadas válidas):',
    '',
    tabelaDeGuardas(guardasDoSlo),
    '',
    ...(informativo
      ? ['Comparação informativa: sem veredito.']
      : [
          `Primária (${variante === 'v3' ? 'atraso da tradução' : 'atraso do original'} p50): efeito ${sinal(-j.efeitoPct, 1)}% sobre A; ${j.primariaGanha ? 'IC inteiro abaixo de 0 e efeito >= 20%' : j.primariaPior ? 'IC inteiro ACIMA de 0 (pior)' : 'IC cruza 0 ou efeito < 20%'}.`,
          '',
          tabelaDeJuizo(j),
          '',
          `**Veredito: ${j.veredito}**${j.reprovadas.length ? ` (guardas reprovadas: ${j.reprovadas.join('; ')})` : ''}`,
        ]),
    ...(ensaio && !criterio.commitado
      ? ['', 'ENSAIO: o critério não estava commitado; este resultado NÃO vale como decisão.']
      : []),
  ]
  console.log(saida.join('\n'))
  const out = opt('json', '')
  if (out)
    writeFileSync(
      out,
      JSON.stringify(
        {
          a: pa,
          b: pb,
          variante,
          rodadas: [A.validas.length, B.validas.length],
          c,
          juizo: informativo ? null : j,
          slo: guardasDoSlo,
        },
        null,
        1,
      ),
    )
}
