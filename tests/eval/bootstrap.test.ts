import { describe, expect, it } from 'vitest'

import { bootstrap, bootstrapPareado, mediaEm, razaoEm, rngComSemente } from '../../src/core/eval/bootstrap'

describe('bootstrap', () => {
  it('é determinístico com a mesma semente', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(bootstrap(v.length, mediaEm(v))).toEqual(bootstrap(v.length, mediaEm(v)))
    const a = rngComSemente(1)
    const b = rngComSemente(1)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('o intervalo contém a média e encolhe com mais casos', () => {
    const pequeno = Array.from({ length: 20 }, (_, i) => (i % 2 ? 1 : 0))
    const grande = Array.from({ length: 2000 }, (_, i) => (i % 2 ? 1 : 0))
    const p = bootstrap(pequeno.length, mediaEm(pequeno))
    const g = bootstrap(grande.length, mediaEm(grande))
    expect(p.valor).toBeCloseTo(0.5)
    expect(p.ic95[0]).toBeLessThanOrEqual(0.5)
    expect(p.ic95[1]).toBeGreaterThanOrEqual(0.5)
    expect(g.ic95[1] - g.ic95[0]).toBeLessThan(p.ic95[1] - p.ic95[0])
  })

  it('WER de corpus é razão de somas, não média de razões', () => {
    // Uma frase de 1 palavra errada e uma de 9 palavras certas: WER = 1/10, não (1 + 0)/2.
    expect(razaoEm([1, 0], [1, 9])([0, 1])).toBeCloseTo(0.1)
  })

  it('pareado: diferença constante é significativa; sistemas iguais não são', () => {
    const a = Array.from({ length: 200 }, (_, i) => (i % 7) / 7)
    const b = a.map((x) => x + 0.05)
    const d = bootstrapPareado(a.length, mediaEm(b), mediaEm(a))
    expect(d.valor).toBeCloseTo(0.05)
    expect(d.significativo).toBe(true)
    expect(bootstrapPareado(a.length, mediaEm(a), mediaEm(a)).significativo).toBe(false)
  })

  it('pareado detecta o que dois intervalos sobrepostos esconderiam', () => {
    // Variação grande entre casos (frases fáceis e difíceis), vantagem pequena e CONSTANTE de B.
    const a = Array.from({ length: 300 }, (_, i) => ((i * 37) % 100) / 100)
    const b = a.map((x) => x + 0.01)
    const ia = bootstrap(a.length, mediaEm(a))
    const ib = bootstrap(b.length, mediaEm(b))
    expect(ib.ic95[0]).toBeLessThan(ia.ic95[1]) // os intervalos se sobrepõem
    expect(bootstrapPareado(a.length, mediaEm(b), mediaEm(a)).significativo).toBe(true)
  })
})
