import { describe, expect, it } from 'vitest'

import { type FraseComTempo, frasePorTempo, temposDasFrases } from '../src/core/leitura/audiolivro'

const PAUSAS = { frase: 0.2, paragrafo: 0.4 }

const perto = (tempos: FraseComTempo[], esperado: FraseComTempo[]) => {
  expect(tempos).toHaveLength(esperado.length)
  tempos.forEach((t, k) => {
    expect(t.i).toBe(esperado[k].i)
    expect(t.t0).toBeCloseTo(esperado[k].t0, 9)
    expect(t.t1).toBeCloseTo(esperado[k].t1, 9)
  })
}

describe('temposDasFrases', () => {
  it('soma durações e pausas (parágrafo depois de fimDeParagrafo; a última sem pausa)', () => {
    const tempos = temposDasFrases(
      [
        { duracaoS: 2, fimDeParagrafo: false },
        { duracaoS: 3, fimDeParagrafo: true },
        { duracaoS: 1, fimDeParagrafo: false },
      ],
      PAUSAS,
    )
    perto(tempos, [
      { i: 0, t0: 0, t1: 2 },
      { i: 1, t0: 2.2, t1: 5.2 },
      { i: 2, t0: 5.6, t1: 6.6 },
    ])
  })

  it('lista vazia dá lista vazia', () => {
    expect(temposDasFrases([], PAUSAS)).toEqual([])
  })
})

describe('frasePorTempo', () => {
  const tempos = temposDasFrases(
    [
      { duracaoS: 2, fimDeParagrafo: false },
      { duracaoS: 3, fimDeParagrafo: true },
      { duracaoS: 1, fimDeParagrafo: false },
    ],
    PAUSAS,
  )

  it.each([
    [2.1, 0],
    [2.2, 1],
    [-0.1, -1],
    [99, 2],
    [0, 0],
    [5.3, 1],
    [5.6, 2],
  ])('t=%s → %s', (t, esperado) => {
    expect(frasePorTempo(tempos, t)).toBe(esperado)
  })

  it('lista vazia → -1', () => {
    expect(frasePorTempo([], 1)).toBe(-1)
  })

  it('10 000 frases em < 5 ms por consulta (busca binária)', () => {
    const muitas = temposDasFrases(
      Array.from({ length: 10_000 }, (_, k) => ({ duracaoS: 1 + (k % 7) * 0.1, fimDeParagrafo: k % 5 === 4 })),
      PAUSAS,
    )
    const consultas = 1000
    const inicio = performance.now()
    for (let k = 0; k < consultas; k++) {
      const alvo = muitas[(k * 37) % muitas.length]
      expect(frasePorTempo(muitas, alvo.t0)).toBe(alvo.i)
    }
    expect((performance.now() - inicio) / consultas).toBeLessThan(5)
  })
})
