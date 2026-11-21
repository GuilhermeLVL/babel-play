/**
 * NORMALIZAÇÃO DE VOLUME (openspec `stt-ingles-volume-e-rota`, REQ-014): pico (percentil 99,9) a −3 dBFS, teto de 40 dB,
 * nunca atenua, não amplifica silêncio, nunca sai de [−1, 1] e devolve cópia.
 */
import { describe, expect, it } from 'vitest'

import {
  GANHO_MAXIMO_DB,
  normalizarVolume,
  PICO_ALVO_DBFS,
  picoPorPercentil,
  PISO_DE_SILENCIO_DBFS,
} from '../src/core/audio/normalizarVolume'

const db = (x: number) => 20 * Math.log10(x)
const linear = (d: number) => 10 ** (d / 20)

/** Onda de 200 Hz a 16 kHz com o pico dado (dBFS), `n` amostras. */
function senoide(picoDb: number, n = 16_000): Float32Array {
  const a = new Float32Array(n)
  for (let i = 0; i < n; i++) a[i] = linear(picoDb) * Math.sin((2 * Math.PI * 200 * i) / 16_000)
  return a
}
const maxAbs = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
const dentro = (a: Float32Array) => a.every((v) => v >= -1 && v <= 1)

describe('normalizarVolume', () => {
  it('fala baixa (−30 dBFS) sobe a −3 dBFS', () => {
    const r = normalizarVolume(senoide(-30))
    expect(db(picoPorPercentil(r.pcm))).toBeCloseTo(PICO_ALVO_DBFS, 1)
    expect(r.ganhoDb).toBeCloseTo(27, 0)
    expect(dentro(r.pcm)).toBe(true)
  })

  it('fala a −60 dBFS: ganho limitado a 40 dB (teto), pico final −20 dBFS', () => {
    const r = normalizarVolume(senoide(-60))
    expect(r.ganhoDb).toBeCloseTo(GANHO_MAXIMO_DB, 5)
    expect(db(maxAbs(r.pcm))).toBeCloseTo(-20, 0)
    expect(dentro(r.pcm)).toBe(true)
  })

  it('já alta (acima de −3 dBFS): não muda, e nunca atenua', () => {
    for (const d of [-2, -1, 0]) {
      const entrada = senoide(d)
      const r = normalizarVolume(entrada)
      expect(r.ganho).toBe(1)
      expect(Array.from(r.pcm)).toEqual(Array.from(entrada))
    }
  })

  it('silêncio, ruído abaixo do piso e vazio não mudam', () => {
    expect(normalizarVolume(new Float32Array(0)).pcm).toHaveLength(0)
    expect(normalizarVolume(new Float32Array(1000)).ganho).toBe(1)
    const ruido = senoide(PISO_DE_SILENCIO_DBFS - 5)
    const r = normalizarVolume(ruido)
    expect(r.ganho).toBe(1)
    expect(Array.from(r.pcm)).toEqual(Array.from(ruido))
  })

  it('clique isolado: o ganho vem do percentil 99,9 (a fala sobe; −38 dBFS de pico, ganho de ~35 dB) e o clique é limitado sem sair de [−1, 1]', () => {
    const fala = senoide(-38, 32_000)
    fala[10_000] = linear(-1) // um clique a −1 dBFS; um máximo ingênuo daria ganho de 0 dB
    fala[20_000] = -linear(-1)
    const r = normalizarVolume(fala)
    expect(r.ganhoDb).toBeGreaterThan(30)
    expect(db(picoPorPercentil(r.pcm))).toBeCloseTo(PICO_ALVO_DBFS, 0)
    expect(dentro(r.pcm)).toBe(true)
    expect(r.pcm[10_000]).toBe(1)
    expect(r.pcm[20_000]).toBe(-1)
  })

  it('não altera a entrada e devolve outra cópia', () => {
    const entrada = senoide(-40)
    const antes = Array.from(entrada)
    const r = normalizarVolume(entrada)
    expect(r.pcm).not.toBe(entrada)
    expect(Array.from(entrada)).toEqual(antes)
    // …também quando não há ganho
    const alta = senoide(-1)
    expect(normalizarVolume(alta).pcm).not.toBe(alta)
  })

  it('invariante: nenhuma amostra fora de [−1, 1], em muitas entradas aleatórias', () => {
    let semente = 7
    const rnd = () => ((semente = (semente * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1
    for (let k = 0; k < 40; k++) {
      const escala = linear(-80 + k * 2)
      const a = Float32Array.from({ length: 4_000 }, () => rnd() * escala)
      a[17] = 1 // pico cheio
      expect(dentro(normalizarVolume(a).pcm)).toBe(true)
    }
  })

  it('amostra não finita não derruba nem vaza: vira 0', () => {
    const a = senoide(-40, 2_000)
    a[3] = Number.NaN
    a[4] = Number.POSITIVE_INFINITY
    const r = normalizarVolume(a)
    expect(dentro(r.pcm)).toBe(true)
    expect(r.pcm[3]).toBe(0)
  })
})

describe('picoPorPercentil', () => {
  it('bate com a ordenação direta', () => {
    let semente = 3
    const rnd = () => ((semente = (semente * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1
    for (const n of [1, 2, 10, 999, 1000, 5_001]) {
      const a = Float32Array.from({ length: n }, rnd)
      const ordenado = Float32Array.from(a, Math.abs).sort()
      const esperado = ordenado[Math.min(n - 1, Math.ceil(0.999 * n) - 1)]
      expect(picoPorPercentil(a)).toBe(esperado)
    }
  })
})
