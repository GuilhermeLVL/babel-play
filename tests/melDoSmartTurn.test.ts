/**
 * AS FEATURES MEL DO SMART TURN v3 em TypeScript têm de dar o MESMO que o `WhisperFeatureExtractor` do
 * transformers (a referência do modelo): 80 bins × 800 quadros, log-mel de Whisper, onda normalizada, áudio
 * cortado nos últimos 8 s ou completado com zeros NO COMEÇO. O arquivo `fixtures/smartTurnMel.json` foi gerado
 * por `WhisperFeatureExtractor(chunk_length=8)` (transformers, numpy) sobre a mesma onda determinística.
 */
import { describe, expect, it } from 'vitest'

import { featuresDoSmartTurn, JANELA_AMOSTRAS, QUADROS_MEL, BINS_MEL } from '../src/gateway/capture/melDoSmartTurn'
import referencia from './fixtures/smartTurnMel.json'

/** A mesma onda do gerador Python: LCG de 32 bits + duas senoides com envelope. */
function onda(n: number): Float32Array {
  let s = 12345
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const ruido = (s / 4294967296 - 0.5) * 0.1
    const env = 0.5 + 0.5 * Math.sin(((2 * Math.PI * i) / 16000) * 1.3)
    const v =
      0.3 * Math.sin(((2 * Math.PI * 220 * i) / 16000)) * env + 0.1 * Math.sin((2 * Math.PI * 1870 * i) / 16000) + ruido
    out[i] = v
  }
  return out
}

type Caso = { amostras: number; media: number; min: number; max: number; quadros: Record<string, number[]> }

describe('melDoSmartTurn', () => {
  it('a forma é 80 bins × 800 quadros (8 s a 16 kHz)', () => {
    expect(JANELA_AMOSTRAS).toBe(128000)
    expect(BINS_MEL).toBe(80)
    expect(QUADROS_MEL).toBe(800)
    expect(featuresDoSmartTurn(new Float32Array(16000)).length).toBe(80 * 800)
  })

  for (const nome of ['curto', 'longo'] as const) {
    it(`bate com o WhisperFeatureExtractor (${nome})`, () => {
      const ref = (referencia.casos as Record<string, Caso>)[nome]
      const f = featuresDoSmartTurn(onda(ref.amostras))
      let soma = 0
      let min = Infinity
      let max = -Infinity
      for (const v of f) {
        soma += v
        min = Math.min(min, v)
        max = Math.max(max, v)
      }
      expect(soma / f.length).toBeCloseTo(ref.media, 3)
      expect(min).toBeCloseTo(ref.min, 3)
      expect(max).toBeCloseTo(ref.max, 3)
      for (const [q, coluna] of Object.entries(ref.quadros)) {
        const quadro = Number(q)
        let erroMax = 0
        for (let b = 0; b < 80; b++) erroMax = Math.max(erroMax, Math.abs(f[b * 800 + quadro] - coluna[b]))
        expect(erroMax).toBeLessThan(2e-3)
      }
    })
  }

  it('áudio vazio não quebra (vira silêncio de 8 s)', () => {
    const f = featuresDoSmartTurn(new Float32Array(0))
    expect(f.length).toBe(80 * 800)
    expect(f.every(Number.isFinite)).toBe(true)
  })
})
