/**
 * OS SLOs DA SUÍTE DE CARGA, lidos de UM arquivo (`scripts/perf/suite/slo.json`), que é a fonte dos
 * números de `docs/slo.md`. A suíte (`rodar.mjs`) e a carga leve do CI (`scripts/perf/ci-carga.mjs`)
 * leem daqui — mudar um limiar é mudar o JSON e o documento, e os dois lados acompanham.
 *
 * Funções puras (o teste `tests/perf-suite.test.ts` as cobre): percentil, resumo e veredito.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ARQUIVO_SLO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'slo.json')

/** Lê e confere o formato mínimo. Lança com mensagem clara se faltar um número. */
export function carregarSlo(arquivo = ARQUIVO_SLO) {
  const slo = JSON.parse(readFileSync(arquivo, 'utf8'))
  const num = (v, onde) => {
    if (typeof v !== 'number' || !(v > 0)) throw new Error(`slo.json: ${onde} precisa ser um número > 0`)
  }
  num(slo.erroMaxPct, 'erroMaxPct')
  num(slo.quebra?.erroPct, 'quebra.erroPct')
  num(slo.classes?.leitura?.p95Ms, 'classes.leitura.p95Ms')
  num(slo.classes?.gravacao?.p95Ms, 'classes.gravacao.p95Ms')
  num(slo.classes?.upload?.p95Ms, 'classes.upload.p95Ms')
  num(slo.classes?.ia?.p95SobreProvedorMs, 'classes.ia.p95SobreProvedorMs')
  num(slo.ci?.conexoes, 'ci.conexoes')
  num(slo.ci?.duracaoS, 'ci.duracaoS')
  num(slo.frontend?.jsInicialGzipMaxKB, 'frontend.jsInicialGzipMaxKB')
  num(slo.frontend?.cssInicialGzipMaxKB, 'frontend.cssInicialGzipMaxKB')
  if (!Array.isArray(slo.frontend.proibidosNoDist))
    throw new Error('slo.json: frontend.proibidosNoDist precisa ser uma lista')
  if (!slo.classes[slo.ci.classe]) throw new Error(`slo.json: ci.classe "${slo.ci.classe}" não existe em classes`)
  return slo
}

/** O teto de p95 que vale para uma classe (a de IA é sobre o custo do nosso lado). */
export function tetoP95(slo, classe) {
  const c = slo.classes[classe]
  return c?.p95Ms ?? c?.p95SobreProvedorMs ?? null
}

/** Percentil `p` (nearest-rank) de uma lista JÁ ORDENADA. */
export function percentil(ordenada, p) {
  if (!ordenada.length) return null
  return ordenada[Math.min(ordenada.length - 1, Math.max(0, Math.ceil((p / 100) * ordenada.length) - 1))]
}

/** Resumo de uma lista de latências (não precisa vir ordenada). */
export function resumir(latencias) {
  const o = [...latencias].sort((a, b) => a - b)
  const r = (x) => (x === null ? null : Math.round(x * 10) / 10)
  return {
    n: o.length,
    p50: r(percentil(o, 50)),
    p95: r(percentil(o, 95)),
    p99: r(percentil(o, 99)),
    max: r(o.at(-1) ?? null),
  }
}

/**
 * O veredito de um nível de carga.
 *   `porClasse`: { leitura: {p95, n}, gravacao: {...}, upload: {...}, ia: {p95, n} } — `ia.p95` já é
 *                o custo sobre o provedor;
 *   `erroPct`:   % de respostas com erro (5xx, socket, timeout, 4xx inesperado).
 * Devolve `{ dentroDoSlo, quebrou, falhas }`: `dentroDoSlo` usa `erroMaxPct`; `quebrou` usa
 * `quebra.erroPct` (a definição de ponto de quebra da Fase 4). Classe sem amostra não reprova.
 */
export function avaliarNivel({ porClasse, erroPct }, slo) {
  const falhasP95 = []
  for (const [classe, r] of Object.entries(porClasse)) {
    const teto = tetoP95(slo, classe)
    if (teto !== null && r?.n && r.p95 !== null && r.p95 > teto)
      falhasP95.push(`${classe}: p95 ${r.p95} ms > ${teto} ms`)
  }
  const falhas = [...falhasP95]
  if (erroPct > slo.erroMaxPct) falhas.push(`erro ${erroPct}% > ${slo.erroMaxPct}%`)
  return {
    dentroDoSlo: falhas.length === 0,
    quebrou: falhasP95.length > 0 || erroPct > slo.quebra.erroPct,
    falhas,
  }
}
