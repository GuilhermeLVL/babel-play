/**
 * A/B DOS PARCIAIS (`parciais-incrementais`, 2.6/3.3/4.3): o bootstrap sobre as palavras (efeito conhecido e nulo), o texto final
 * contra o conjunto de A, as guardas de IC e o veredito de cada critério. Roda sem navegador.
 */
import { describe, expect, it } from 'vitest'

import {
  bootstrapDeUnidades,
  conferirFinais,
  distanciaDePalavras,
  estatDeAtraso,
  estatDeErasure,
  estatDeWer,
  guardaOrcamentoDeErasure,
  julgarVariante,
  unidadesPorFala,
  vereditoDoCriterio,
  werDe,
} from '../scripts/perf/latencia-legenda/ab-parciais.mjs'

type Rodada = Record<string, any>
const ba = bootstrapDeUnidades as (f: any, e: any, o?: any) => any
const cf = conferirFinais as (a: any, b: any, campo: string, refs?: string[]) => any
const jv = julgarVariante as (v: string, c: any, g: any[], e?: number, tetoFinalMs?: number) => any

/** Rodadas sintéticas: 4 falas, cada uma com 5 atrasos fixos + `delta` (ms) e erasure `ne`. */
const rodadas = (n: number, delta: number, ne: number, texto = 'olá mundo'): Rodada[] =>
  Array.from({ length: n }, (_, r) => ({
    palavras: Array.from({ length: 4 }, (_, k) => ({
      foraDoCalculo: false,
      atrasoOriginalMs: [1000, 1100, 1200, 1300, 1400].map((x) => x + delta + k * 10 + r),
      atrasoTraducaoMs: [2000, 2100].map((x) => x + delta),
      erasureOriginal: { apagadas: Math.round(ne * 10), final: 10 },
      erasureTraducao: { apagadas: 1, final: 10 },
    })),
    textos: Array.from({ length: 4 }, () => texto),
    traducoes: Array.from({ length: 4 }, () => 'hello world'),
  }))

describe('bootstrap sobre palavras e erasure', () => {
  const opt = { iteracoes: 2000, semente: 7 }
  it('efeito conhecido (−400 ms no atraso): IC contém −400 e exclui 0', () => {
    const f = unidadesPorFala(
      rodadas(12, 0, 0.5),
      rodadas(12, -400, 0.5),
      (r: Rodada, k: number) => r.palavras[k].atrasoOriginalMs,
    )
    const r = ba(f, estatDeAtraso(50), opt)
    expect(r.falas).toBe(4)
    expect(r.ic95[0]).toBeLessThanOrEqual(-400)
    expect(r.ic95[1]).toBeGreaterThanOrEqual(-420)
    expect(r.ic95[1]).toBeLessThan(0)
  })
  it('efeito nulo: o IC cruza 0', () => {
    const f = unidadesPorFala(
      rodadas(12, 0, 0.5),
      rodadas(12, 0, 0.5),
      (r: Rodada, k: number) => r.palavras[k].atrasoOriginalMs,
    )
    const r = ba(f, estatDeAtraso(50), opt)
    expect(r.ic95[0]).toBeLessThanOrEqual(0)
    expect(r.ic95[1]).toBeGreaterThanOrEqual(0)
  })
  it('erasure: Σ apagadas ÷ Σ finais; B +0,3 dá diferença +0,3', () => {
    const f = unidadesPorFala(
      rodadas(12, 0, 0.5),
      rodadas(12, 0, 0.8),
      (r: Rodada, k: number) => r.palavras[k].erasureOriginal,
    )
    const r = ba(f, estatDeErasure, opt)
    expect(r.a).toBeCloseTo(0.5, 5)
    expect(r.dif).toBeCloseTo(0.3, 5)
  })
  it('só pareia as falas com unidade nos dois lados; sem nenhuma, o resultado é vazio', () => {
    const a = rodadas(3, 0, 0.5)
    const b = rodadas(3, 0, 0.5)
    for (const r of b) r.palavras[2].foraDoCalculo = true
    const extrai = (r: Rodada, k: number) => (r.palavras[k].foraDoCalculo ? null : r.palavras[k].atrasoOriginalMs)
    expect(unidadesPorFala(a, b, extrai).map((x: { k: number }) => x.k)).toEqual([0, 1, 3])
    expect(ba([], estatDeAtraso(50)).ic95).toBeNull()
  })
})

describe('texto final contra o conjunto de A', () => {
  it('texto de B igual a algum de A passa; um texto novo reprova; a variação interna de A é contada', () => {
    const A = [...rodadas(2, 0, 0.5, 'um texto'), ...rodadas(1, 0, 0.5, 'um texto!')]
    const B = rodadas(2, 0, 0.5, 'um texto!')
    const ok = cf(A, B, 'textos')
    expect(ok.foraDoConjuntoDeA).toBe(0)
    expect(ok.divergentesEmA).toBe(4)
    const ruim = cf(A, rodadas(1, 0, 0.5, 'outro texto'), 'textos')
    expect(ruim.foraDoConjuntoDeA).toBe(4)
    expect(ruim.exemplos[0]).toEqual({ k: 0, texto: 'outro texto' })
  })
  it('WER contra a referência (palavras normalizadas)', () => {
    expect(distanciaDePalavras(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1)
    const refs = ['olá mundo', 'olá mundo', 'olá mundo', 'olá mundo']
    const c = cf(rodadas(1, 0, 0.5, 'olá mundo'), rodadas(1, 0, 0.5, 'olá terra'), 'textos', refs)
    expect(c.werA).toBe(0)
    expect(c.werB).toBe(0.5)
  })
})

describe('veredito do critério', () => {
  const primaria = (a: number, dif: number, lo: number, hi: number) => ({ a, b: a + dif, dif, ic95: [lo, hi] })
  it('IC inteiro abaixo de 0 e efeito >= 20%, sem guarda reprovada: APROVADO', () => {
    expect(vereditoDoCriterio(primaria(1000, -300, -400, -200), []).veredito).toBe('APROVADO')
  })
  it('efeito < 20% ou IC que cruza 0: SEM DIFERENÇA PROVADA', () => {
    expect(vereditoDoCriterio(primaria(1000, -100, -150, -50), []).veredito).toBe('SEM DIFERENÇA PROVADA')
    expect(vereditoDoCriterio(primaria(1000, -300, -400, 50), []).veredito).toBe('SEM DIFERENÇA PROVADA')
  })
  it('guarda reprovada ou primária pior: REPROVADO, mesmo com a primária ganhando', () => {
    const g = [{ nome: 'x', status: 'piorou' }]
    expect(vereditoDoCriterio(primaria(1000, -300, -400, -200), g).veredito).toBe('REPROVADO')
    expect(vereditoDoCriterio(primaria(1000, 200, 100, 300), []).veredito).toBe('REPROVADO')
  })
  it('guarda sem medida não reprova', () => {
    expect(vereditoDoCriterio(primaria(1000, -300, -400, -200), [{ nome: 'x', status: 'sem-medida' }]).veredito).toBe(
      'APROVADO',
    )
  })
})

describe('guardas por variante', () => {
  const ic = (a: number, b: number, lo: number, hi: number, falas = 4) => ({ a, b, dif: b - a, ic95: [lo, hi], falas })
  const comp = (over: Record<string, unknown> = {}) => ({
    atrasoOriginal: { p50: ic(1000, 600, -500, -300), p90: ic(2000, 1500, -600, -400) },
    atrasoTraducao: { p50: ic(2000, 1200, -900, -700), p90: ic(3000, 2000, -1200, -800) },
    erasureOriginal: ic(0.6, 0.62, -0.01, 0.03),
    erasureTraducao: ic(0.4, 0.2, -0.3, -0.1),
    fimDaFala: { p75: { a: 1000, b: 900, dif: -100, ic95: [-200, -10] } },
    primeiroTextoNaTelaMs: { a: 3000, b: 1000, dif: -2000 },
    werFinal: ic(0.2, 0.2, -0.01, 0.01),
    textos: { comparadas: 32, foraDoConjuntoDeA: 0, foraNormalizado: 0, divergentesEmA: 0, werA: 0.1, werB: 0.1 },
    traducoes: { comparadas: 32, foraDoConjuntoDeA: 0, foraNormalizado: 0, divergentesEmA: 0 },
    ...over,
  })
  it('V1 aprovado quando tudo cumpre; erasure com limite superior > +0,05 reprova', () => {
    expect(jv('v1', comp(), []).veredito).toBe('APROVADO')
    const r = jv('v1', comp({ erasureOriginal: ic(0.6, 3.5, 2.5, 3.5) }), [])
    expect(r.veredito).toBe('REPROVADO')
    expect(r.reprovadas[0]).toMatch(/erasureOriginal/)
  })
  it('V4 sem tradução (fimDaFala nulo): a guarda 1 vale sobre o final do ORIGINAL, com o mesmo limite de +30 ms', () => {
    const orig = (lo: number, hi: number) => ({ p75: { a: 900, b: 900 + hi, dif: (lo + hi) / 2, ic95: [lo, hi] } })
    const erasure = { a: 0, b: 0.2, dif: 0.2, ic95: [0.1, 0.3], icB: [0.1, 0.3], falas: 4 }
    const ok = jv('v4', comp({ fimDaFala: null, fimDoOriginal: orig(-40, 30), erasureOriginal: erasure }), [])
    expect(ok.veredito).toBe('APROVADO')
    expect(ok.guardas[0].nome).toMatch(/fimDaFalaAteOriginalMs/)
    const ruim = jv('v4', comp({ fimDaFala: null, fimDoOriginal: orig(54, 445), erasureOriginal: erasure }), [])
    expect(ruim.veredito).toBe('REPROVADO')
    expect(ruim.reprovadas[0]).toMatch(/fimDaFalaAteOriginalMs/)
    // Sem nenhuma das duas medidas, segue "sem medida" (nem aprova nem reprova).
    expect(jv('v4', comp({ fimDaFala: null, erasureOriginal: erasure }), []).guardas[0].status).toBe('sem-medida')
  })
  it('fimDaFala com limite superior > 0 reprova; texto final fora do conjunto de A reprova', () => {
    expect(jv('v1', comp({ fimDaFala: { p75: { a: 1000, b: 1050, dif: 50, ic95: [-20, 90] } } }), []).veredito).toBe(
      'REPROVADO',
    )
    const t = { comparadas: 32, foraDoConjuntoDeA: 1, foraNormalizado: 0, divergentesEmA: 0, werA: 0.1, werB: 0.1 }
    expect(jv('v1', comp({ textos: t }), []).veredito).toBe('REPROVADO')
  })
  it('V3 usa o atraso da TRADUÇÃO como primária e o do original só reprova com piora provada', () => {
    expect(jv('v3', comp(), []).primaria).toEqual(comp().atrasoTraducao.p50)
    expect(jv('v3', comp({ atrasoOriginal: { p50: ic(1000, 1010, -50, 80), p90: ic(1, 1, 0, 0) } }), []).veredito).toBe(
      'APROVADO',
    )
    expect(
      jv('v3', comp({ atrasoOriginal: { p50: ic(1000, 1300, 200, 400), p90: ic(1, 1, 0, 0) } }), []).veredito,
    ).toBe('REPROVADO')
  })
  it('as guardas do SLO entram: "piorou" reprova', () => {
    const slo = [{ nome: 'rendersPorS.fala', a: 100, b: 200, limite: 150, status: 'piorou' }]
    expect(jv('v1', comp(), slo).veredito).toBe('REPROVADO')
  })
  it('V1b: p75 do final tolera +30 ms de limite superior (V1 exigia <= 0)', () => {
    const p75 = (hi: number) => ({ p75: { a: 1000, b: 1010, dif: 10, ic95: [-5, hi] } })
    expect(jv('v1b', comp({ fimDaFala: p75(30) }), []).veredito).toBe('APROVADO')
    expect(jv('v1b', comp({ fimDaFala: p75(31) }), []).veredito).toBe('REPROVADO')
    expect(jv('v1', comp({ fimDaFala: p75(4) }), []).veredito).toBe('REPROVADO')
  })
  it('V1b: texto final por WER pareado (limite superior <= +2 pp); fora do conjunto de A é só informativo', () => {
    const t = { comparadas: 32, foraDoConjuntoDeA: 5, foraNormalizado: 3, divergentesEmA: 5, werA: 0.2, werB: 0.2 }
    expect(jv('v1b', comp({ textos: t }), []).veredito).toBe('APROVADO')
    expect(jv('v1b', comp({ werFinal: ic(0.2, 0.21, 0, 0.02) }), []).veredito).toBe('APROVADO')
    const r = jv('v1b', comp({ werFinal: ic(0.2, 0.23, 0.01, 0.0201) }), [])
    expect(r.veredito).toBe('REPROVADO')
    expect(r.reprovadas[0]).toMatch(/WER pareado/)
  })
  it('V1c: mesmas regras da V1b (p75 +30 ms, WER pareado, erasure +0,05)', () => {
    const p75 = (hi: number) => ({ p75: { a: 1000, b: 1010, dif: 10, ic95: [-5, hi] } })
    expect(jv('v1c', comp({ fimDaFala: p75(30) }), []).veredito).toBe('APROVADO')
    expect(jv('v1c', comp({ fimDaFala: p75(31) }), []).veredito).toBe('REPROVADO')
    expect(jv('v1c', comp({ werFinal: ic(0.2, 0.23, 0.01, 0.0201) }), []).veredito).toBe('REPROVADO')
    expect(jv('v1c', comp({ erasureOriginal: ic(0.6, 0.7, 0.0, 0.06) }), []).veredito).toBe('REPROVADO')
  })
  it('V4: erasure é orçamento ABSOLUTO de B (média <= 0,5 e IC superior de B <= 0,6); a diferença contra A não reprova', () => {
    const e = (a: number, b: number, icB: [number, number]) => ({
      a,
      b,
      dif: b - a,
      ic95: [b - a - 0.1, b - a + 0.4],
      icB,
      falas: 8,
    })
    // base sem parcial (a = 0): +0,45 de diferença não reprova mais
    expect(jv('v4', comp({ erasureOriginal: e(0, 0.45, [0.3, 0.58]) }), []).veredito).toBe('APROVADO')
    expect(jv('v4', comp({ erasureOriginal: e(0, 0.5, [0.3, 0.6]) }), []).veredito).toBe('APROVADO')
    const m = jv('v4', comp({ erasureOriginal: e(0, 0.51, [0.3, 0.55]) }), [])
    expect(m.veredito).toBe('REPROVADO')
    expect(m.reprovadas[0]).toMatch(/orçamento absoluto/)
    expect(jv('v4', comp({ erasureOriginal: e(0, 0.4, [0.3, 0.61]) }), []).veredito).toBe('REPROVADO')
    expect(guardaOrcamentoDeErasure({ a: 0, b: null, dif: null, ic95: null, icB: null }).status).toBe('sem-medida')
  })
  it('V4: as demais guardas são as de V1c (p75 +30 ms, WER +2 pp)', () => {
    const p75 = (hi: number) => ({ p75: { a: 1000, b: 1010, dif: 10, ic95: [-5, hi] } })
    expect(jv('v4', comp({ fimDaFala: p75(30) }), []).veredito).toBe('APROVADO')
    expect(jv('v4', comp({ fimDaFala: p75(31) }), []).veredito).toBe('REPROVADO')
    expect(jv('v4', comp({ werFinal: ic(0.2, 0.23, 0.01, 0.0201) }), []).veredito).toBe('REPROVADO')
    expect(jv('v4', comp({ fimDaFala: null }), []).guardas[0].status).toBe('sem-medida')
  })
  it('V7: `--teto-final-ms` troca só o teto da guarda 1 (+100 ms); sem o parâmetro os vereditos antigos não mudam', () => {
    const p75 = (hi: number) => ({ p75: { a: 1000, b: 1010, dif: 10, ic95: [-5, hi] } })
    const orig = (hi: number) => ({ p75: { a: 900, b: 900 + hi, dif: hi / 2, ic95: [1, hi] } })
    expect(jv('v4', comp({ fimDaFala: p75(100) }), [], 20, 100).veredito).toBe('APROVADO')
    expect(jv('v4', comp({ fimDaFala: p75(101) }), [], 20, 100).veredito).toBe('REPROVADO')
    expect(jv('v4', comp({ fimDaFala: p75(100) }), []).veredito).toBe('REPROVADO') // sem o parâmetro: +30 ms
    const sem = (hi: number, teto?: number) =>
      jv('v4', comp({ fimDaFala: null, fimDoOriginal: orig(hi) }), [], 20, teto)
    expect(sem(116, 100).veredito).toBe('REPROVADO') // o IC [+1, +116] da V6 não passa nem em +100
    expect(sem(100, 100).guardas[0].detalhe).toMatch(/≤ 100 ms/)
    expect(sem(100, 100).veredito).toBe('APROVADO')
  })
  it('V1c continua com o teto +0,05 da diferença (V4 não muda variantes antigas)', () => {
    expect(jv('v1c', comp({ erasureOriginal: ic(0.6, 0.7, 0.0, 0.06) }), []).veredito).toBe('REPROVADO')
  })
  it('V1b: a erasure segue com teto +0,05', () => {
    expect(jv('v1b', comp({ erasureOriginal: ic(0.6, 0.7, 0.0, 0.06) }), []).veredito).toBe('REPROVADO')
  })
})

describe('WER pareado do final', () => {
  it('soma erros e palavras de referência por fala; sem referência ou texto, a unidade é nula', () => {
    const w = werDe(['a b c d', 'x y']) as (r: any, k: number) => { erros: number; total: number } | null
    expect(w({ textos: ['a b c e', 'x y'] }, 0)).toEqual({ erros: 1, total: 4 })
    expect(w({ textos: ['a b c d'] }, 1)).toBeNull()
    expect(w({ textos: ['a'] }, 5)).toBeNull()
    expect(
      (estatDeWer as any)([
        { erros: 1, total: 4 },
        { erros: 0, total: 2 },
      ]),
    ).toBeCloseTo(1 / 6)
  })
})
