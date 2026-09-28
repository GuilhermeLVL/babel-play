/**
 * PORTAS DE QUALIDADE — a cascata por trecho do `harness-adaptativo.md` §5.
 *
 * O barato roda primeiro; se o resultado PARECE ruim, só aquele trecho sobe um degrau. Estes testes
 * prendem as regras (os limiares do próprio Whisper para STT; razão de tamanho, cópia do original e
 * logprob para MT) e que os limiares vêm de config — os padrões são "a calibrar na bancada".
 */
import { describe, expect, it } from 'vitest'

import {
  avaliarTraducaoLocal,
  avaliarTrechoStt,
  LIMIARES_PADRAO_MT,
  LIMIARES_PADRAO_STT,
  quedasBruscas,
  razaoDeCompressaoAproximada,
} from '../src/core/harness/portasDeQualidade'

describe('avaliarTrechoStt — regras do Whisper', () => {
  it('sem sinal nenhum, passa', () => {
    expect(avaliarTrechoStt({}).veredicto).toBe('ok')
  })

  it('trecho saudável passa', () => {
    const r = avaliarTrechoStt({
      compressionRatio: 1.6,
      avgLogprob: -0.3,
      noSpeechProb: 0.05,
      confiancasDePalavra: [0.9, 0.95, 0.88],
    })
    expect(r).toEqual({ veredicto: 'ok', motivos: [] })
  })

  it('compression_ratio > 2,4 (repetição, alucinação em laço) → subir', () => {
    const r = avaliarTrechoStt({ compressionRatio: 2.5, avgLogprob: -0.2 })
    expect(r.veredicto).toBe('subir')
    expect(r.motivos).toContain('compressao')
  })

  it('compression_ratio = 2,4 não sobe (limiar estrito, como no Whisper)', () => {
    expect(avaliarTrechoStt({ compressionRatio: 2.4 }).veredicto).toBe('ok')
  })

  it('avg_logprob < −1 → subir', () => {
    const r = avaliarTrechoStt({ avgLogprob: -1.2, noSpeechProb: 0.1 })
    expect(r.veredicto).toBe('subir')
    expect(r.motivos).toContain('logprob')
  })

  it('no_speech_prob > 0,6 E avg_logprob < −1 → silêncio (descarta, não sobe)', () => {
    expect(avaliarTrechoStt({ noSpeechProb: 0.8, avgLogprob: -1.5 }).veredicto).toBe('silencio')
  })

  it('no_speech_prob alto com logprob bom NÃO é silêncio (o Whisper confiou no texto)', () => {
    expect(avaliarTrechoStt({ noSpeechProb: 0.8, avgLogprob: -0.4 }).veredicto).toBe('ok')
  })

  it('silêncio vence a subida (não se paga nuvem para transcrever silêncio)', () => {
    expect(avaliarTrechoStt({ noSpeechProb: 0.9, avgLogprob: -2, compressionRatio: 3 }).veredicto).toBe('silencio')
  })

  it('confiança média da palavra abaixo de τ → subir', () => {
    const r = avaliarTrechoStt({ confiancasDePalavra: [0.3, 0.4, 0.35] })
    expect(r.veredicto).toBe('subir')
    expect(r.motivos).toContain('confianca-media')
  })

  it('DUAS quedas bruscas locais → subir; uma só não', () => {
    const uma = [0.9, 0.9, 0.4, 0.9, 0.9, 0.9]
    const duas = [0.9, 0.4, 0.9, 0.9, 0.3, 0.9]
    expect(avaliarTrechoStt({ confiancasDePalavra: uma }).veredicto).toBe('ok')
    const r = avaliarTrechoStt({ confiancasDePalavra: duas })
    expect(r.veredicto).toBe('subir')
    expect(r.motivos).toContain('quedas')
  })

  it('limiares vêm de config', () => {
    const lim = { ...LIMIARES_PADRAO_STT, compressao: 3 }
    expect(avaliarTrechoStt({ compressionRatio: 2.8 }, lim).veredicto).toBe('ok')
    expect(avaliarTrechoStt({ confiancasDePalavra: [0.6, 0.6] }, { ...LIMIARES_PADRAO_STT, tau: 0.7 }).veredicto).toBe(
      'subir',
    )
  })
})

describe('quedasBruscas — δ = P_t − (P_{t−1} + P_{t+1})/2', () => {
  it('conta só as quedas com δ < −0,3', () => {
    expect(quedasBruscas([0.9, 0.5, 0.9])).toBe(1) // δ = −0,4
    expect(quedasBruscas([0.9, 0.7, 0.9])).toBe(0) // δ = −0,2
  })

  it('as pontas não têm vizinho dos dois lados e não contam', () => {
    expect(quedasBruscas([0.1, 0.9, 0.9, 0.1])).toBe(0)
    expect(quedasBruscas([0.5])).toBe(0)
    expect(quedasBruscas([])).toBe(0)
  })

  it('declive suave não é queda brusca', () => {
    expect(quedasBruscas([0.9, 0.8, 0.7, 0.6, 0.5, 0.4])).toBe(0)
  })
})

describe('avaliarTraducaoLocal — porta MT local → nuvem', () => {
  it('tradução saudável passa', () => {
    const r = avaliarTraducaoLocal({
      origem: 'I would like a cup of coffee',
      traducao: 'Eu gostaria de uma xícara de café',
    })
    expect(r).toEqual({ veredicto: 'ok', motivos: [] })
  })

  it('tradução vazia → subir', () => {
    expect(avaliarTraducaoLocal({ origem: 'Hello there, friend', traducao: '  ' }).veredicto).toBe('subir')
  })

  it('razão de tamanho < 0,5 → subir (tradução truncada)', () => {
    const r = avaliarTraducaoLocal({ origem: 'I would like a cup of coffee, please', traducao: 'Café' })
    expect(r.veredicto).toBe('subir')
    expect(r.motivos).toContain('razao-de-tamanho')
  })

  it('razão de tamanho > 2 → subir (o modelo divagou)', () => {
    const r = avaliarTraducaoLocal({
      origem: 'See you tomorrow',
      traducao: 'Até amanhã, até amanhã, até amanhã, até amanhã, até amanhã',
    })
    expect(r.motivos).toContain('razao-de-tamanho')
  })

  it('texto curto não passa pela razão de tamanho ("ok" → "tá bom" é legítimo)', () => {
    expect(avaliarTraducaoLocal({ origem: 'ok', traducao: 'tá bom então' }).veredicto).toBe('ok')
  })

  it('cópia do original > 50% → subir', () => {
    const r = avaliarTraducaoLocal({ origem: 'the quick brown fox jumps', traducao: 'the quick brown raposa pula' })
    expect(r.veredicto).toBe('subir')
    expect(r.motivos).toContain('copia')
  })

  it('nome próprio repetido não conta como cópia se a maioria mudou', () => {
    expect(
      avaliarTraducaoLocal({ origem: 'John went to the market today', traducao: 'John foi ao mercado hoje' }).veredicto,
    ).toBe('ok')
  })

  it('logprob médio abaixo de τ_mt → subir', () => {
    const r = avaliarTraducaoLocal({
      origem: 'I would like a cup of coffee',
      traducao: 'Eu gostaria de uma xícara de café',
      logprobMedio: -3,
    })
    expect(r.veredicto).toBe('subir')
    expect(r.motivos).toContain('logprob')
  })

  it('limiares vêm de config', () => {
    const e = {
      origem: 'I would like a cup of coffee',
      traducao: 'Eu gostaria de uma xícara de café',
      logprobMedio: -0.9,
    }
    expect(avaliarTraducaoLocal(e).veredicto).toBe('ok')
    expect(avaliarTraducaoLocal(e, { ...LIMIARES_PADRAO_MT, tauMt: -0.5 }).veredicto).toBe('subir')
  })
})

describe('razaoDeCompressaoAproximada — o compression_ratio sem zlib', () => {
  it('fala normal fica abaixo do limiar do Whisper (2,4)', () => {
    for (const t of [
      'Então, hoje a gente vai falar sobre como funciona o sistema de transporte da cidade.',
      'I think the main problem is that nobody really knows what the budget is going to be next year.',
      'Olá, tudo bem? Eu queria saber se você pode me ajudar com uma coisa rapidinho.',
    ]) {
      expect(razaoDeCompressaoAproximada(t), t).toBeLessThan(2.4)
    }
  })

  it('o laço do decode greedy passa do limiar', () => {
    const laco = 'Obrigado por assistir. '.repeat(8)
    expect(razaoDeCompressaoAproximada(laco)).toBeGreaterThan(2.4)
    expect(razaoDeCompressaoAproximada('the the the the the the the the the the the the the the')).toBeGreaterThan(2.4)
  })

  it('texto curto não é julgado (sem sinal): undefined', () => {
    expect(razaoDeCompressaoAproximada('Tá bom.')).toBeUndefined()
  })

  it('alimenta avaliarTrechoStt: laço → subir por compressão', () => {
    const r = avaliarTrechoStt({ compressionRatio: razaoDeCompressaoAproximada('a gente vai '.repeat(10)) })
    expect(r.veredicto).toBe('subir')
    expect(r.motivos).toEqual(['compressao'])
  })
})
