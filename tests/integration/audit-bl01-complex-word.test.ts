/**
 * REGRESSÃO — BL-01: o auto-slow (Analysis.tsx) detectava frase "complexa" por lista HARDCODED de
 * 4 palavras inglesas. Substituído por heurística real: palavra longa (≥13) ou polissilábica (≥4
 * sílabas). (src/core/learning/text-stats.ts sentenceHasComplexWord)
 */
import { describe, it, expect } from 'vitest'
import { sentenceHasComplexWord } from '@core'

describe('BL-01 — heurística de frase complexa', () => {
  it('detecta palavra longa/polissilábica (heurística real, não a lista de 4 palavras)', () => {
    expect(sentenceHasComplexWord('This is an extraordinary responsibility')).toBe(true) // longa/polissilábica
    expect(sentenceHasComplexWord('a democratização do conhecimento')).toBe(true)        // ≥13 chars
    expect(sentenceHasComplexWord('the implementation was incomprehensible')).toBe(true) // longas
  })
  it('frase simples não dispara', () => {
    expect(sentenceHasComplexWord('the cat sat on the mat')).toBe(false)
    expect(sentenceHasComplexWord('eu gosto de café')).toBe(false)
    expect(sentenceHasComplexWord('')).toBe(false)
  })
})
