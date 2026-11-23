/**
 * ATRASO POR PALAVRA E ERASURE NA BANCADA (`parciais-incrementais`, tarefa 1.7): como `lat.dom` + o roteiro com tempo por
 * palavra viram `atrasoDePalavraMs` (p50/p90, original e tradução-proxy) e `erasureOriginal`/`erasureTraducao`, com as
 * MESMAS funções de `src/core/legendas/medidasDeParcial.ts`. Rodada sintética, sem navegador.
 */
import { describe, expect, it } from 'vitest'

import { analisarRodada } from '../scripts/perf/latencia-legenda/analisar.mjs'
import { agregarRodadas, metricasDaRodada } from '../scripts/perf/latencia-legenda/metricas-captura.mjs'
import * as pal from '../scripts/perf/latencia-legenda/palavras-da-fala.mjs'
import { validar } from '../scripts/perf/latencia-legenda/validar-alinhamento.mjs'

// O módulo é .mjs sem tipos: tipado como `any` aqui (o `typecheck:estrito` não infere o JS).
const P = pal as any
const analisar = analisarRodada as any
const metricas = metricasDaRodada as any
const agregar = agregarRodadas as any
const validarAlinhamento = validar as any

/*
 * Linha do tempo: bipe do arquivo em 1 s → âncora na página = 3000 ms (ver `bancada-desempenho-captura.test.ts`).
 * Fala 0: voz 3,0–5,0 s do arquivo (página 5000–7000), referência "lions are social" com fim das palavras em
 * 3,6 / 4,2 / 5,0 s do arquivo (página 5600 / 6200 / 7000).
 * Fala 1: 6,0–8,0 s (página 8000–10000), "cats sleep" com fim em 6,8 / 8,0 s (página 8800 / 10000).
 */
function rodada(dom: Record<string, unknown>[], falas?: Record<string, unknown>[]) {
  return {
    rotulo: 'desktop.r1',
    tIniciarPerf: 1000,
    perfilDoAparelho: { tipo: 'desktop-sem-gpu', modoLeve: 'false' },
    config: { eu: 'pt-BR', eles: 'en-US' },
    roteiro: {
      bipeS: 1,
      duracaoS: 20,
      falas: falas ?? [
        {
          k: 0,
          iniS: 3,
          fimS: 5,
          durVozS: 2,
          referencia: 'Lions are social.',
          palavras: [
            { t: 'lions', iniS: 3, fimS: 3.6 },
            { t: 'are', iniS: 3.6, fimS: 4.2 },
            { t: 'social', iniS: 4.2, fimS: 5 },
          ],
          alinhamento: { fracao: 1, foraDoCalculo: false },
        },
        {
          k: 1,
          iniS: 6,
          fimS: 8,
          durVozS: 2,
          referencia: 'Cats sleep.',
          palavras: [
            { t: 'cats', iniS: 6, fimS: 6.8 },
            { t: 'sleep', iniS: 6.8, fimS: 8 },
          ],
          alinhamento: { fracao: 1, foraDoCalculo: false },
        },
      ],
    },
    lat: {
      aud: [
        [2990, 0.0, 0.0],
        [3010, 0.2, 0.9],
        [3030, 0.0, 0.0],
      ],
      dom,
      ev: [],
      loaf: [],
      rc: [],
    },
    cap: [],
    amostras: [],
  }
}

// O balão como a tela de hoje o pinta: o parcial do original ocupa o campo da tradução (`o` vazio); no final, `o` e `tr`.
const DOM = [
  { t: 5000, tf: 5010, i: 0, o: '', tr: '', nova: false },
  { t: 6000, tf: 6010, i: 0, o: '', tr: 'Lions are', nova: false }, // "lions" (fim 5600) → 410; "are" (6200) → -190
  { t: 7500, tf: 7510, i: 0, o: '', tr: 'Lions are so', nova: false }, // "so" não é a forma final (social)
  { t: 8000, tf: 8010, i: 0, o: 'Lions are social.', tr: 'Leões são', nova: false }, // "social" (7000) → 1010
  { t: 8300, tf: 8310, i: 0, o: 'Lions are social.', tr: 'Leões são sociais.', nova: false },
  { t: 8700, tf: 8710, i: 1, o: '', tr: '', nova: false },
  { t: 10500, tf: 10510, i: 1, o: 'Cats sleep.', tr: 'Gatos dormem.', nova: false },
]

describe('atraso por palavra e erasure a partir de lat.dom', () => {
  it('o original: parcial no campo da tradução, final em `o`; atraso por palavra de referência', () => {
    const a = analisar(rodada(DOM))
    const f0 = a.todasFalas.find((f: any) => f.k === 0).palavras
    // lions: 6010 − 5600 = 410; are: 6010 − 6200 = −190; social: 8010 − 7000 = 1010
    expect(f0.atrasoOriginalMs).toEqual([410, -190, 1010])
    expect(f0.semCasamento).toBe(0)
    // Saídas do original: "lions are" → "lions are so" → "lions are social": "so" trocada por "social" = 1 apagada; final 3 palavras.
    expect(f0.erasureOriginal).toEqual({ apagadas: 1, final: 3, ne: 1 / 3 })
    // Tradução: só vale com o original preenchido; "leoes sao" → "leoes sao sociais": nenhuma apagada.
    expect(f0.erasureTraducao).toEqual({ apagadas: 0, final: 3, ne: 0 })
    // Tradução (proxy): "leões são sociais" = 3 palavras sobre 3 de origem (1:1): leões(5600) são(6200) sociais(7000).
    // leões: 8010 − 5600; são: 8010 − 6200; sociais: 8310 − 7000
    expect(f0.atrasoTraducaoMs).toEqual([2410, 1810, 1310])
    expect(f0.foraDoCalculo).toBe(false)
  })

  it('o balão de cada fala é o do índice certo e a outra fala não vaza', () => {
    const a = analisar(rodada(DOM))
    const f1 = a.todasFalas.find((f: any) => f.k === 1).palavras
    // cats: 10510 − 8800 = 1710; sleep: 10510 − 10000 = 510
    expect(f1.atrasoOriginalMs).toEqual([1710, 510])
    expect(f1.erasureOriginal).toEqual({ apagadas: 0, final: 2, ne: 0 })
  })

  it('fala com < 90% casadas no alinhamento fica fora do atraso e é contada à parte; a erasure continua', () => {
    const falas = rodada(DOM).roteiro.falas.map((f) =>
      f.k === 0 ? { ...f, alinhamento: { fracao: 0.8, foraDoCalculo: true } } : f,
    )
    const a = analisar(rodada(DOM, falas))
    const f0 = a.todasFalas.find((f: any) => f.k === 0).palavras
    expect(f0.foraDoCalculo).toBe(true)
    expect(f0.atrasoOriginalMs).toEqual([])
    expect(f0.erasureOriginal?.apagadas).toBe(1)
    const resumo = metricas(rodada(DOM, falas)).palavras
    expect(resumo.foraDoCalculo).toBe(1)
    expect(resumo.atrasoDePalavraMs.original.n).toBe(2) // só a fala 1
  })

  it('palavra do roteiro que o STT não escreveu fica de fora e é contada', () => {
    const dom = DOM.map((r) => (r.i === 1 ? { ...r, o: 'Cats', tr: r.o ? 'Gatos' : r.tr } : r))
    const f1 = analisar(rodada(dom)).todasFalas.find((f: any) => f.k === 1).palavras
    expect(f1.atrasoOriginalMs).toEqual([-90])
    expect(f1.semCasamento).toBe(1)
  })

  it('sem roteiro de palavras (roteiro antigo), a rodada segue e a fala sai sem medida de atraso', () => {
    const sem = rodada(DOM).roteiro.falas.map((f) => ({ k: f.k, iniS: f.iniS, fimS: f.fimS, durVozS: f.durVozS }))
    const f0 = analisar(rodada(DOM, sem)).todasFalas.find((f: any) => f.k === 0).palavras
    expect(f0.atrasoOriginalMs).toEqual([])
    expect(f0.erasureOriginal).not.toBeNull()
  })
})

describe('resumo da rodada e agregação', () => {
  it('p50/p90 do atraso (palavras de todas as falas somadas) e erasure agregada (Σ apagadas ÷ Σ final)', () => {
    const m = metricas(rodada(DOM))
    expect(m.valida).toBe(true)
    const p = m.palavras
    // original: [410, -190, 1010, 1710, 510] → ordenado [-190, 410, 510, 1010, 1710]
    expect(p.atrasoDePalavraMs.original.n).toBe(5)
    expect(p.atrasoDePalavraMs.original.p50).toBe(510)
    expect(p.atrasoDePalavraMs.original.p90).toBeCloseTo(1010 + 0.6 * (1710 - 1010), 5)
    expect(p.erasureOriginal).toMatchObject({ apagadas: 1, final: 5 })
    expect(p.erasureOriginal.ne).toBeCloseTo(0.2, 10)
    expect(p.atrasoDePalavraMs.traducao.n).toBeGreaterThan(0)
  })

  it('agregarRodadas junta as palavras das rodadas (nunca mediana de percentis) e publica as chaves', () => {
    const ag = agregar([metricas(rodada(DOM)), metricas(rodada(DOM))])
    expect(ag.palavras.rodadas).toBe(2)
    expect(ag.palavras.atrasoDePalavraMs.original.n).toBe(10)
    expect(ag.metricas['atrasoDePalavraMs.original.p50']).toBe(510)
    expect(ag.metricas.erasureOriginal).toBeCloseTo(0.2, 10)
    expect(ag.metricas).toHaveProperty('atrasoDePalavraMs.traducao.p90')
    expect(ag.metricas).toHaveProperty('erasureTraducao')
  })
})

describe('referência proporcional e validação do alinhamento', () => {
  it('percentil de apoio', () => {
    expect(P.percentilDe([1, 2, 3, 4, 5], 50)).toBe(3)
    expect(P.percentilDe([], 50)).toBeNull()
  })

  it('a validação mede o desvio da 1ª e da última palavra contra a voz do roteiro e a energia do áudio', () => {
    const sr = 16000
    const x = new Float32Array(sr * 6)
    for (let i = Math.round(sr * 1.0); i < Math.round(sr * 3.0); i++) x[i] = 0.2 * Math.sin(i / 7) // voz de 1,0 a 3,0 s
    const roteiro = {
      falas: [
        {
          k: 0,
          iniS: 1.0,
          fimS: 3.0,
          palavras: [
            { t: 'a', iniS: 1.2, fimS: 1.6 },
            { t: 'b', iniS: 1.6, fimS: 2.9 },
          ],
          alinhamento: { foraDoCalculo: false },
        },
        { k: 1, iniS: 4, fimS: 5, palavras: [{ t: 'x', iniS: 4, fimS: 5 }], alinhamento: { foraDoCalculo: true } },
      ],
    }
    const r = validarAlinhamento(roteiro, x)
    expect(r.falasValidadas).toBe(1)
    expect(r.inicioVsRoteiro.medianaComSinalMs).toBe(200)
    expect(r.fimVsRoteiro.medianaComSinalMs).toBe(-100)
    expect(Math.abs(r.inicioVsEnergia.medianaComSinalMs - 200)).toBeLessThanOrEqual(20)
    expect(Math.abs(r.fimVsEnergia.medianaComSinalMs + 100)).toBeLessThanOrEqual(20)
  })
})

describe('fimDaFalaAteOriginalMs (guarda 1 do final sem tradução)', () => {
  const f = P.fimDaFalaAteOriginalMs as (q: any[], fim: number) => number | null
  // Sem tradução o original ocupa o campo `tr` (com `o` vazio); `tf` é o quadro pintado (o commit é `t`).
  it('é o 1º quadro pintado (tf) com o texto FINAL, menos o fim da voz; parciais diferentes do final não contam', () => {
    const quadros = [
      { t: 5000, tf: 5010, o: '', tr: 'lions' },
      { t: 6100, tf: 6110, o: '', tr: 'lions are' },
      { t: 7400, tf: 7412, o: '', tr: 'Lions are social.' },
      { t: 7900, tf: 7910, o: '', tr: 'lions are social' }, // o mesmo final de novo: vale o 1º
    ]
    expect(f(quadros, 7000)).toBe(412)
  })

  it('usa t quando não há tf, ignora pontuação e caixa, e o original pode estar em `o`', () => {
    expect(f([{ t: 6500, o: 'Olá, mundo!', tr: '' }], 6000)).toBe(500)
  })

  it('um parcial que já mostrava o texto final conta, e o valor fica negativo (a pessoa já viu)', () => {
    const quadros = [
      { t: 6800, tf: 6810, o: '', tr: 'cats sleep' },
      { t: 7600, tf: 7610, o: '', tr: 'Cats sleep.' },
    ]
    expect(f(quadros, 7000)).toBe(-190)
  })

  it('sem texto final ou sem fim da voz: null', () => {
    expect(f([{ t: 5000, o: '', tr: '' }], 7000)).toBeNull()
    expect(f([{ t: 5000, o: '', tr: 'oi' }], Number.NaN)).toBeNull()
  })

  it('entra nas medidas da fala (campo `fimDaFalaAteOriginal`), com o fim da voz do roteiro', () => {
    const fala = { k: 0, fimS: 5.0, palavras: [{ t: 'oi', fimS: 5.0 }], alinhamento: { foraDoCalculo: false } }
    const m = P.medidasDaFala(fala, [{ t: 5800, tf: 5810, o: '', tr: 'oi' }], (s: number) => 3000 + (s - 1) * 1000)
    expect(m.fimDaFalaAteOriginal).toBe(5810 - 7000)
  })
})
