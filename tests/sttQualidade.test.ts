/**
 * As funções puras do STT de nuvem (`server/ai/sttQualidade.ts`): o prompt que vem do cabeçalho e a
 * triagem dos segmentos do `verbose_json`. O proxy inteiro é exercitado em
 * `tests/integration/stt-nuvem-honesta.test.ts`; aqui ficam as bordas que lá custariam um provedor
 * falso por caso.
 */
import { describe, expect, it } from 'vitest'

import { promptDoCabecalho, TETO_DO_PROMPT, triarSegmentos } from '../server/ai/sttQualidade'

describe('promptDoCabecalho', () => {
  it('ausente ou vazio → null', () => {
    expect(promptDoCabecalho(undefined)).toBeNull()
    expect(promptDoCabecalho('')).toBeNull()
    expect(promptDoCabecalho(encodeURIComponent('  \n\t '))).toBeNull()
  })

  it('codificação inválida → null, sem lançar', () => {
    expect(promptDoCabecalho('%')).toBeNull()
    expect(promptDoCabecalho('%E0%A4%A')).toBeNull()
  })

  it('o teto conta pontos de código, não unidades UTF-16 (emoji não parte ao meio)', () => {
    const texto = '😀'.repeat(TETO_DO_PROMPT + 10)
    const p = promptDoCabecalho(encodeURIComponent(texto))!
    expect(Array.from(p)).toHaveLength(TETO_DO_PROMPT)
    expect(p).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })

  it('quebra de linha vira espaço (não cola palavras)', () => {
    expect(promptDoCabecalho(encodeURIComponent('bom\ndia'))).toBe('bom dia')
  })
})

describe('triarSegmentos', () => {
  it('sem segmentos (resposta em json, ou lista vazia) → null: nada a triar', () => {
    expect(triarSegmentos(undefined)).toBeNull()
    expect(triarSegmentos([])).toBeNull()
    expect(triarSegmentos('não é lista')).toBeNull()
  })

  it('segmento sem os números FICA — ausência de sinal não é silêncio', () => {
    expect(triarSegmentos([{ text: ' oi' }])).toEqual({ texto: 'oi', total: 1, semFala: 0, repeticao: 0 })
  })

  it('só no_speech alto, com logprob confiante, fica; só logprob baixo, com no_speech baixo, fica', () => {
    const r = triarSegmentos([
      { text: ' um', no_speech_prob: 0.9, avg_logprob: -0.5 },
      { text: ' dois', no_speech_prob: 0.2, avg_logprob: -1.5 },
    ])
    expect(r?.texto).toBe('um dois')
  })

  it('provedor sem o espaço inicial: latino ganha espaço, chinês junta sem separador', () => {
    expect(triarSegmentos([{ text: 'bom' }, { text: 'dia' }])?.texto).toBe('bom dia')
    expect(triarSegmentos([{ text: '你好' }, { text: '世界' }])?.texto).toBe('你好世界')
  })

  it('tudo descartado → texto vazio', () => {
    const r = triarSegmentos([{ text: ' la la la', compression_ratio: 5 }])
    expect(r).toEqual({ texto: '', total: 1, semFala: 0, repeticao: 1 })
  })
})
