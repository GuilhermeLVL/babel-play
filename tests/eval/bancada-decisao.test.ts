/**
 * A REGRA DE DECISÃO DA BANCADA (B5) — pura, a partir do resumo pareado candidato × linha de base.
 *
 * Até aqui a regra vivia em prosa (`bancada-2026-09.md`) e cada troca era decidida lendo a tabela:
 * "troca só se o IC 95% pareado exclui 0, o custo cabe e o gold de conversa não piora". O B7 vai
 * trocar os padrões da produção com base nisto, então a regra virou código com teste:
 *
 *   - por corpus, com o Δ ORIENTADO (positivo = melhor; no WER e na alucinação, menor é melhor):
 *       superior       IC inteiro acima de 0
 *       não-inferior   IC inteiro acima de −margem (a margem é DECLARADA, por métrica)
 *       inferior       IC inteiro abaixo de 0 e passando da margem
 *       inconclusivo   o resto (IC largo demais para dizer)
 *   - o veredito geral é o PIOR dos corpora;
 *   - REPROVA, qualquer que seja o veredito: gold de conversa piorou (IC exclui 0 para baixo, mesmo
 *     dentro da margem) ou custo por hora acima do teto. Custo desconhecido não aprova.
 */
import { describe, expect, it } from 'vitest'

import {
  classificar,
  decidir,
  decisoesDoResumo,
  markdownDasDecisoes,
} from '../../scripts/eval-fala/bancada/decisao.mjs'
import { resumir } from '../../scripts/eval-fala/bancada/resumo.mjs'

const MARGENS = { comet: 0.01, chrf: 1, wer: 0.005, alucinacao: 0.02 }
const comp = (corpus: string, metrica: string, valor: number, lo: number, hi: number) => ({
  corpus,
  metrica,
  diferenca: { valor, ic95: [lo, hi] },
})
const base = { margens: MARGENS, tetoUsdPorHora: 0.05, custoUsdPorHora: 0.02 }

describe('classificar (IC já orientado: positivo = melhor)', () => {
  it('as quatro classes', () => {
    expect(classificar([0.001, 0.02], 0.01)).toBe('superior')
    expect(classificar([-0.009, 0.02], 0.01)).toBe('nao-inferior')
    expect(classificar([-0.009, -0.001], 0.01)).toBe('nao-inferior') // pior, mas dentro da margem
    expect(classificar([-0.05, -0.02], 0.01)).toBe('inferior')
    expect(classificar([-0.03, 0.02], 0.01)).toBe('inconclusivo')
  })
  it('margem zero é a regra antiga: só troca com IC acima de 0', () => {
    expect(classificar([-0.001, 0.02], 0)).toBe('inconclusivo')
    expect(classificar([0.001, 0.02], 0)).toBe('superior')
  })
})

describe('decidir', () => {
  it('superior em tudo, custo no teto: aprova', () => {
    const d = decidir({
      ...base,
      exigirGold: true,
      comparacoes: [comp('gold:en-pt', 'comet', 0.02, 0.005, 0.03), comp('fleurs:en-pt', 'comet', 0.01, 0.004, 0.02)],
    })
    expect(d.veredito).toBe('superior')
    expect(d.aprovado).toBe(true)
    expect(d.reprovacoes).toEqual([])
  })

  it('o veredito geral é o PIOR corpus', () => {
    const d = decidir({
      ...base,
      exigirGold: true,
      comparacoes: [comp('gold:en-pt', 'comet', 0.003, -0.004, 0.01), comp('fleurs:en-pt', 'comet', 0.02, 0.01, 0.03)],
    })
    expect(d.veredito).toBe('nao-inferior')
    expect(d.aprovado).toBe(true)
    expect(d.porCorpus.map((c: { classe: string }) => c.classe)).toEqual(['nao-inferior', 'superior'])
  })

  it('gold de conversa piorou (IC exclui 0 para baixo): REPROVA mesmo dentro da margem', () => {
    const d = decidir({
      ...base,
      margens: { ...MARGENS, comet: 0.05 },
      exigirGold: true,
      comparacoes: [comp('gold:en-pt', 'comet', -0.01, -0.02, -0.001), comp('fleurs:en-pt', 'comet', 0.03, 0.02, 0.04)],
    })
    expect(d.veredito).toBe('nao-inferior')
    expect(d.aprovado).toBe(false)
    expect(d.reprovacoes).toContain('gold-piorou')
  })

  it('inferior e inconclusivo não aprovam', () => {
    const inferior = decidir({ ...base, comparacoes: [comp('wmt:en-pt', 'comet', -0.03, -0.05, -0.02)] })
    expect(inferior.veredito).toBe('inferior')
    expect(inferior.aprovado).toBe(false)
    const incerto = decidir({ ...base, comparacoes: [comp('wmt:en-pt', 'comet', -0.005, -0.03, 0.02)] })
    expect(incerto.veredito).toBe('inconclusivo')
    expect(incerto.aprovado).toBe(false)
  })

  it('STT: no WER e na alucinação, Δ negativo é melhor', () => {
    const melhor = decidir({ ...base, comparacoes: [comp('fleurs_pt', 'wer', -0.02, -0.03, -0.01)] })
    expect(melhor.veredito).toBe('superior')
    expect(melhor.porCorpus[0].ic95).toEqual([0.01, 0.03])
    const alucina = decidir({ ...base, comparacoes: [comp('sem_fala', 'alucinacao', 0.05, 0.02, 0.08)] })
    expect(alucina.veredito).toBe('inferior')
  })

  it('custo por hora acima do teto: REPROVA, e o veredito de qualidade continua visível', () => {
    const d = decidir({
      ...base,
      custoUsdPorHora: 0.09,
      comparacoes: [comp('fleurs:en-pt', 'comet', 0.02, 0.01, 0.03)],
    })
    expect(d.veredito).toBe('superior')
    expect(d.aprovado).toBe(false)
    expect(d.reprovacoes).toEqual(['custo-acima-do-teto'])
  })

  it('custo desconhecido não aprova', () => {
    const d = decidir({
      ...base,
      custoUsdPorHora: null,
      comparacoes: [comp('fleurs:en-pt', 'comet', 0.02, 0.01, 0.03)],
    })
    expect(d.aprovado).toBe(false)
    expect(d.motivos.join(' ')).toMatch(/custo/)
  })

  it('MT sem o gold de conversa é inconclusivo: o produto é conversa', () => {
    const d = decidir({ ...base, exigirGold: true, comparacoes: [comp('fleurs:en-pt', 'comet', 0.02, 0.01, 0.03)] })
    expect(d.veredito).toBe('inconclusivo')
    expect(d.aprovado).toBe(false)
    expect(d.motivos.join(' ')).toMatch(/gold/)
  })

  it('sem comparações: inconclusivo', () => {
    expect(decidir({ ...base, comparacoes: [] }).veredito).toBe('inconclusivo')
  })

  it('margem tem de ser declarada: ausente ou negativa é erro', () => {
    expect(() => decidir({ ...base, margens: {}, comparacoes: [comp('x', 'comet', 0, 0, 0)] })).toThrow(/margem/)
    expect(() => decidir({ ...base, margens: { comet: -0.01 }, comparacoes: [comp('x', 'comet', 0, 0, 0)] })).toThrow(
      /margem/,
    )
  })
})

describe('decisoesDoResumo: do resumo pareado às decisões por candidato × base', () => {
  const pareado = (contra: string, metrica: string, valor: number, lo: number, hi: number) => ({
    contra,
    n: 60,
    metrica,
    diferenca: { valor, ic95: [lo, hi], significativo: lo > 0 || hi < 0 },
  })
  const resumo = {
    mt: [
      {
        corpus: 'gold:en-pt',
        sistema: 'deepinfra:openai/gpt-oss-20b',
        candidato: true,
        usdPorHoraDeFala: 0.012,
        parametros: { foraDaProducao: false },
        comparacoes: [pareado('groq:openai/gpt-oss-120b', 'comet', 0.001, -0.006, 0.008)],
      },
      {
        corpus: 'fleurs:en-pt',
        sistema: 'deepinfra:openai/gpt-oss-20b',
        candidato: true,
        usdPorHoraDeFala: 0.018,
        parametros: { foraDaProducao: false },
        comparacoes: [pareado('groq:openai/gpt-oss-120b', 'comet', 0.002, -0.004, 0.009)],
      },
      { corpus: 'gold:en-pt', sistema: 'groq:openai/gpt-oss-120b', candidato: false, comparacoes: [] },
      {
        corpus: 'gold:en-pt',
        sistema: 'deepinfra:Qwen/Qwen3.5-9B@none',
        candidato: true,
        usdPorHoraDeFala: 0.01,
        parametros: { foraDaProducao: true },
        comparacoes: [pareado('groq:openai/gpt-oss-120b', 'comet', -0.03, -0.05, -0.01)],
      },
    ],
    stt: [
      {
        conjunto: 'fleurs_pt',
        sistema: 'deepinfra:openai/whisper-large-v3-turbo+t0+seg+vad800',
        candidato: true,
        metrica: 'wer',
        custoUsdPorHora: 0.012,
        comparacoes: [pareado('groq:whisper-large-v3-turbo+t0+seg+vad800', 'wer', 0.001, -0.002, 0.004)],
      },
    ],
  }
  const opcoes = { margens: MARGENS, tetoMtUsdPorHora: 0.05, tetoSttUsdPorHora: 0.05 }

  it('uma decisão por (função, candidato, base), com o custo mais alto do candidato', () => {
    const ds = decisoesDoResumo(resumo, opcoes)
    expect(ds).toHaveLength(3)
    const d20 = ds.find((d: { candidato: string }) => d.candidato === 'deepinfra:openai/gpt-oss-20b')
    expect(d20).toMatchObject({ funcao: 'mt', contra: 'groq:openai/gpt-oss-120b', custoUsdPorHora: 0.018 })
    expect(d20.veredito).toBe('nao-inferior')
    expect(d20.aprovado).toBe(true)
    const qwen = ds.find((d: { candidato: string }) => d.candidato.startsWith('deepinfra:Qwen'))
    expect(qwen.aprovado).toBe(false)
    expect(qwen.reprovacoes).toContain('gold-piorou')
    expect(qwen.avisos.join(' ')).toMatch(/parametrosDoProvedor/)
    const stt = ds.find((d: { funcao: string }) => d.funcao === 'stt')
    expect(stt).toMatchObject({ veredito: 'nao-inferior', aprovado: true, custoUsdPorHora: 0.012 })
  })

  it('de ponta a ponta: resumir leva custo, parâmetros e timeout do bruto até a decisão', () => {
    const casos = (d: number) => Array.from({ length: 30 }, (_, i) => ({ id: `g${i}`, chrf: 50 + d + (i % 5) }))
    const r = resumir(
      [
        {
          resultados: [
            { sistema: 'groq:openai/gpt-oss-120b', corpus: 'gold:en-pt', casos: casos(0), usdPorHoraDeFala: 0.036 },
            {
              sistema: 'deepinfra:Qwen/Qwen3.5-9B@none',
              corpus: 'gold:en-pt',
              casos: casos(3),
              usdPorHoraDeFala: 0.07,
              parametros: { foraDaProducao: true },
              acimaDoTimeoutDeProducao: 2,
            },
          ],
        },
      ],
      ['deepinfra:'],
    )
    const [d] = decisoesDoResumo(r, opcoes)
    expect(d.porCorpus[0].metrica).toBe('chrf')
    expect(d.veredito).toBe('superior')
    expect(d.custoUsdPorHora).toBe(0.07)
    expect(d.reprovacoes).toEqual(['custo-acima-do-teto'])
    expect(d.avisos.join(' ')).toMatch(/12 s/)
    expect(d.avisos.join(' ')).toMatch(/parametrosDoProvedor/)
  })

  it('o Markdown diz o veredito, a reprovação e as margens usadas', () => {
    const md = markdownDasDecisoes(decisoesDoResumo(resumo, opcoes), opcoes)
    expect(md).toContain('não-inferior')
    expect(md).toContain('REPROVADO')
    expect(md).toContain('gold de conversa piorou')
    expect(md).toMatch(/COMET 0[.,]01/)
  })
})
