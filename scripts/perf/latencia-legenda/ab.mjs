#!/usr/bin/env node
/**
 * A/B DA LEGENDA: a diferença PAREADA, fala a fala, de `fimDaFalaAteLegendaMs` entre duas variantes medidas na mesma
 * máquina, com IC 95% por bootstrap (10 000 reamostragens, semente fixa). Protocolo: `docs/auditoria/protocolo-do-laboratorio-de-latencia.md`.
 *
 *   node scripts/perf/latencia-legenda/ab.mjs --rodadas DIR --a PREFIXO --b PREFIXO --criterio criterio.md
 *        [--efeito-minimo-pct 20] [--nao-inferioridade-ms 5] [--semente N] [--iteracoes 10000] [--json saida.json] [--ensaio]
 *
 * `--rodadas` é a pasta `rodadas/` da `bancada-captura.mjs --alvos antes=...,depois=...`; `--a antes.desktop` lê
 * `antes.desktop.r1.json`, `.r2.json`... (o `.aquecimento` fica de fora).
 *
 * O PAR é a MESMA fala (índice no roteiro) em A e em B. Por fala, cada lado tem uma lista de valores (um por rodada válida);
 * cada reamostragem sorteia as falas com reposição e, dentro de cada fala sorteada, as rodadas de cada lado com reposição
 * (a mediana dos valores sorteados é o valor da fala). O estatístico é p50/p75/p95 das falas; a diferença é B − A.
 *
 * RECUSA (código 1, nenhum número): menos de 10 rodadas VÁLIDAS em um dos lados; `criterio.md` ausente, fora do git,
 * alterado depois do commit ou commitado DEPOIS da primeira rodada (o critério vale por ter sido escrito antes de se ver
 * o número). `--ensaio` aceita um critério ainda não commitado e imprime que o resultado NÃO vale como decisão.
 *
 * DECISÃO (sobre o p75, a métrica primária): `B melhor` só se o IC 95% fica inteiro abaixo de 0 E o efeito mínimo
 * (`--efeito-minimo-pct`, sobre o p75 de A) é atingido; `B pior` se o IC fica inteiro acima de 0; senão `sem diferença
 * provada`. Com `--nao-inferioridade-ms N` (overhead): `sem custo provado` se o limite superior do IC do p75 ≤ N ms.
 * A taxa de falha de cada lado vem sempre ao lado: variante mais rápida que falha mais não ganha.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { analisarRodada } from './analisar.mjs'
import { limiteDe } from './comparar.mjs'
import { agregarRodadas, mediana, metricasDaRodada, percentil } from './metricas-captura.mjs'

export const MIN_RODADAS_VALIDAS = 10
export const ITERACOES_PADRAO = 10_000
export const SEMENTE_PADRAO = 20261121
export const PERCENTIS = [50, 75, 95]

const finito = (x) => typeof x === 'number' && Number.isFinite(x)

/** PRNG determinístico (mulberry32): a mesma semente dá o mesmo IC em qualquer máquina. */
export function prng(semente) {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Rodadas brutas de um lado → { validas: [{ rotulo, porFala: (number|null)[], metricas }], invalidas, quando }.
 * `porFala[k]` = `fimDaFalaAteLegendaMs` da fala k (null se a fala falhou, foi perdida ou não tem tradução).
 */
export function lerLado(dir, prefixo) {
  const re = new RegExp(`^${prefixo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.r\\d+\\.json$`)
  const arquivos = readdirSync(dir)
    .filter((f) => re.test(f))
    .sort((x, y) => Number(x.match(/\.r(\d+)\.json$/)[1]) - Number(y.match(/\.r(\d+)\.json$/)[1]))
  const validas = []
  const invalidas = []
  let primeira = Infinity
  let referencias = null
  for (const f of arquivos) {
    const arq = path.join(dir, f)
    const d = JSON.parse(readFileSync(arq, 'utf8'))
    primeira = Math.min(primeira, Date.parse(d.quando) || statSync(arq).mtimeMs)
    referencias ??= d.roteiro?.falas?.map((x) => x.referencia ?? null) ?? null
    const m = metricasDaRodada(d)
    if (!m.valida) {
      invalidas.push({ rotulo: d.rotulo ?? f, motivo: m.motivo })
      continue
    }
    const a = analisarRodada(d)
    validas.push({
      rotulo: d.rotulo,
      porFala: a.todasFalas.map((x) => (x.status === 'ok' ? x.fimDaFalaAteLegendaMs : null)),
      status: a.todasFalas.map((x) => x.status),
      // `parciais-incrementais`: o que o A/B dos parciais lê por fala (atraso por palavra, erasure, textos finais).
      palavras: a.todasFalas.map((x) => x.palavras ?? null),
      // `fimDaFalaAteOriginalMs` (guarda 1 sem tradução): o texto final do original no balão.
      porFalaOriginal: a.todasFalas.map((x) => x.palavras?.fimDaFalaAteOriginal ?? null),
      textos: a.todasFalas.map((x) => x.texto ?? null),
      traducoes: a.todasFalas.map((x) => x.traducao ?? null),
      metricas: m,
    })
  }
  return { validas, invalidas, referencias, primeiraRodadaEm: Number.isFinite(primeira) ? primeira : null }
}

/** Valores do par, por fala: só as falas com ao menos um valor nos DOIS lados entram. */
export function parearPorFala(ladoA, ladoB) {
  const n = Math.max(0, ...[...ladoA, ...ladoB].map((r) => r.porFala.length))
  const falas = []
  for (let k = 0; k < n; k++) {
    const a = ladoA.map((r) => r.porFala[k]).filter(finito)
    const b = ladoB.map((r) => r.porFala[k]).filter(finito)
    if (a.length && b.length) falas.push({ k, a, b })
  }
  return falas
}

/**
 * Diferença pareada B − A de p50/p75/p95 com IC 95% por bootstrap.
 * @param {{ k: number, a: number[], b: number[] }[]} falas
 */
export function bootstrapPareado(falas, { iteracoes = ITERACOES_PADRAO, semente = SEMENTE_PADRAO } = {}) {
  if (!falas.length) throw new Error('nenhuma fala com valor nos dois lados')
  const rnd = prng(semente)
  const sorteia = (xs) => xs[Math.floor(rnd() * xs.length)]
  const medianaDe = (xs) => mediana(xs.map(() => sorteia(xs)))
  const difs = Object.fromEntries(PERCENTIS.map((p) => [p, []]))
  for (let i = 0; i < iteracoes; i++) {
    const a = []
    const b = []
    for (let j = 0; j < falas.length; j++) {
      const f = sorteia(falas)
      a.push(medianaDe(f.a))
      b.push(medianaDe(f.b))
    }
    for (const p of PERCENTIS) difs[p].push(percentil(b, p) - percentil(a, p))
  }
  const A = falas.map((f) => mediana(f.a))
  const B = falas.map((f) => mediana(f.b))
  return Object.fromEntries(
    PERCENTIS.map((p) => [
      `p${p}`,
      {
        a: percentil(A, p),
        b: percentil(B, p),
        dif: percentil(B, p) - percentil(A, p),
        ic95: [percentil(difs[p], 2.5), percentil(difs[p], 97.5)],
      },
    ]),
  )
}

/**
 * As recusas antes de qualquer número. `criterio` = { existe, commitado, limpo, commitadoEm (ms) }.
 * @returns {string[]} vazio = pode comparar
 */
export function recusas({ validasA, validasB, criterio, primeiraRodadaEm, ensaio = false }) {
  const r = []
  if (validasA < MIN_RODADAS_VALIDAS) r.push(`lado A com ${validasA} rodadas válidas (mínimo ${MIN_RODADAS_VALIDAS})`)
  if (validasB < MIN_RODADAS_VALIDAS) r.push(`lado B com ${validasB} rodadas válidas (mínimo ${MIN_RODADAS_VALIDAS})`)
  if (!criterio?.existe) r.push('sem criterio.md (o critério é escrito e commitado ANTES da primeira rodada)')
  else if (!ensaio) {
    if (!criterio.commitado) r.push('criterio.md não está commitado no git (commit ANTES da primeira rodada)')
    else if (!criterio.limpo)
      r.push('criterio.md foi alterado depois do commit (o critério não muda depois de ver o número)')
    else if (primeiraRodadaEm && criterio.commitadoEm > primeiraRodadaEm)
      r.push(
        `criterio.md foi commitado (${new Date(criterio.commitadoEm).toISOString()}) DEPOIS da primeira rodada (${new Date(primeiraRodadaEm).toISOString()})`,
      )
  }
  return r
}

/** O estado do `criterio.md` no git: existe, rastreado, sem alteração pendente e quando foi commitado pela 1ª vez. */
export function estadoDoCriterio(arquivo) {
  if (!existsSync(arquivo)) return { existe: false }
  const dir = path.dirname(path.resolve(arquivo))
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' })
  const rastreado = git('ls-files', '--error-unmatch', path.basename(arquivo)).status === 0
  if (!rastreado) return { existe: true, commitado: false }
  const limpo = git('status', '--porcelain', '--', path.basename(arquivo)).stdout.trim() === ''
  const t = git('log', '--diff-filter=A', '--format=%ct', '--', path.basename(arquivo)).stdout.trim().split('\n').pop()
  return { existe: true, commitado: !!t, limpo, commitadoEm: t ? Number(t) * 1000 : undefined }
}

/** A decisão sobre o p75 (ver o cabeçalho). `efeitoMinimoPct` e `naoInferioridadeMs` são opcionais. */
export function decidir(res, { efeitoMinimoPct, naoInferioridadeMs } = {}) {
  const p75 = res.p75
  const [lo, hi] = p75.ic95
  if (naoInferioridadeMs !== undefined)
    return hi <= naoInferioridadeMs
      ? `sem custo provado: limite superior do IC 95% do p75 (${Math.round(hi)} ms) ≤ ${naoInferioridadeMs} ms`
      : `custo não descartado: limite superior do IC 95% do p75 (${Math.round(hi)} ms) > ${naoInferioridadeMs} ms`
  if (hi < 0) {
    const efeito = p75.a ? (-p75.dif / p75.a) * 100 : 0
    if (efeitoMinimoPct !== undefined && efeito < efeitoMinimoPct)
      return `sem diferença provada no efeito mínimo: B é mais rápido (IC fora de 0), mas ${efeito.toFixed(1)}% < ${efeitoMinimoPct}%`
    return `B melhor: IC 95% do p75 todo abaixo de 0 (efeito ${efeito.toFixed(1)}%)`
  }
  if (lo > 0) return 'B pior: IC 95% do p75 todo acima de 0'
  return 'sem diferença provada: o IC 95% do p75 cruza 0'
}

const n0 = (x) => (finito(x) ? String(Math.round(x)) : '—')
const sinal = (x) => (finito(x) ? `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x))}` : '—')

export function tabelaDoAB(res) {
  const linhas = ['| percentil | A (ms) | B (ms) | B − A (ms) | IC 95% da diferença (ms) |', '|---|---|---|---|---|']
  for (const [p, x] of Object.entries(res))
    linhas.push(`| ${p} | ${n0(x.a)} | ${n0(x.b)} | ${sinal(x.dif)} | [${sinal(x.ic95[0])}, ${sinal(x.ic95[1])}] |`)
  return linhas.join('\n')
}

/** Taxa de falha por lado (falhas ÷ falas que deviam ter tradução), sempre ao lado do p75. */
export function taxaDeFalhaDoLado(rodadas) {
  const todas = rodadas.flatMap((r) => r.status)
  const falhas = todas.filter((s) => s === 'falha').length
  const ok = todas.filter((s) => s === 'ok').length
  return { falhas, ok, taxa: falhas + ok ? falhas / (falhas + ok) : null }
}

/** As guardas do critério (frames longos, CPU, renders, taxa de falha). Uma guarda piora se B passa do limite de `slo-captura.json` sobre A. */
export const GUARDAS_PADRAO = [
  'framesLongos.n50',
  'framesLongos.n100',
  'framesLongos.somaMs',
  'cpuSilencio.processoPct',
  'rendersPorS.silencio',
  'rendersPorS.fala',
  'fimDaFalaAteLegendaMs.taxaDeFalha',
]

/**
 * Cada guarda: mediana das rodadas válidas de A e de B (`agregarRodadas`) e o veredito pela regra do SLO
 * (B > A × (1 + tolerância) + folga, quando "menor é melhor"). Guarda sem número nos dois lados fica `sem-medida`.
 */
export function avaliarGuardas(validasA, validasB, slo, nomes = GUARDAS_PADRAO) {
  const a = agregarRodadas(validasA.map((v) => v.metricas)).metricas
  const b = agregarRodadas(validasB.map((v) => v.metricas)).metricas
  return nomes.map((nome) => {
    const cfg = slo.metricas?.[nome]
    if (!cfg || !finito(a[nome]) || !finito(b[nome]))
      return { nome, a: a[nome] ?? null, b: b[nome] ?? null, status: 'sem-medida' }
    const limite = limiteDe(cfg, a[nome])
    const piorou = cfg.sentido === 'maior' ? b[nome] < limite : b[nome] > limite
    return { nome, a: a[nome], b: b[nome], limite, status: piorou ? 'piorou' : 'ok' }
  })
}

export function tabelaDeGuardas(guardas) {
  const f = (x) => (finito(x) ? String(Number(x.toFixed(3))) : '—')
  return [
    '| guarda | A | B | limite | situação |',
    '|---|---|---|---|---|',
    ...guardas.map(
      (g) =>
        `| ${g.nome} | ${f(g.a)} | ${f(g.b)} | ${f(g.limite)} | ${g.status === 'piorou' ? '**piorou**' : g.status} |`,
    ),
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
  if (!dir || !pa || !pb) throw new Error('uso: ab.mjs --rodadas DIR --a PREFIXO --b PREFIXO --criterio criterio.md')
  const ensaio = args.includes('--ensaio')
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
  const falas = parearPorFala(A.validas, B.validas)
  const iteracoes = Number(opt('iteracoes', ITERACOES_PADRAO))
  const semente = Number(opt('semente', SEMENTE_PADRAO))
  const res = bootstrapPareado(falas, { iteracoes, semente })
  const decisao = decidir(res, {
    efeitoMinimoPct: opt('efeito-minimo-pct') !== undefined ? Number(opt('efeito-minimo-pct')) : undefined,
    naoInferioridadeMs: opt('nao-inferioridade-ms') !== undefined ? Number(opt('nao-inferioridade-ms')) : undefined,
  })
  const fa = taxaDeFalhaDoLado(A.validas)
  const fb = taxaDeFalhaDoLado(B.validas)
  const arqSlo = opt('slo', path.join(path.dirname(fileURLToPath(import.meta.url)), 'slo-captura.json'))
  const guardas = avaliarGuardas(A.validas, B.validas, JSON.parse(readFileSync(arqSlo, 'utf8')))
  const saida = [
    `### A/B de fimDaFalaAteLegendaMs — A=${pa} (${A.validas.length} rodadas) × B=${pb} (${B.validas.length} rodadas)`,
    '',
    `${falas.length} falas pareadas; bootstrap de ${iteracoes} reamostragens, semente ${semente}.`,
    '',
    tabelaDoAB(res),
    '',
    `Taxa de falha: A ${fa.falhas}/${fa.falhas + fa.ok}, B ${fb.falhas}/${fb.falhas + fb.ok}.`,
    '',
    'Guardas (mediana das rodadas válidas; limite = regra de `slo-captura.json` sobre A):',
    '',
    tabelaDeGuardas(guardas),
    '',
    `**Decisão (p75):** ${decisao}`,
    ...(ensaio && !criterio.commitado
      ? ['', 'ENSAIO: o critério ainda não estava commitado; este resultado NÃO vale como decisão.']
      : []),
  ]
  console.log(saida.join('\n'))
  const j = opt('json', '')
  if (j)
    writeFileSync(
      j,
      JSON.stringify(
        {
          a: pa,
          b: pb,
          rodadas: [A.validas.length, B.validas.length],
          falas: falas.length,
          res,
          decisao,
          guardas,
          falhas: { a: fa, b: fb },
        },
        null,
        1,
      ),
    )
}
