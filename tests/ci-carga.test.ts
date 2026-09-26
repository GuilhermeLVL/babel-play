/**
 * O veredito da carga leve do CI (`scripts/perf/ci-carga.mjs`): p95 por resposta, zero erro. O
 * servidor de verdade só sobe no job `carga` do ci.yml; aqui fica a regra, que é o que decide.
 */
import { describe, expect, it } from 'vitest'

import { avaliar, percentil } from '../scripts/perf/ci-carga.mjs'

describe('ci-carga — veredito', () => {
  it('percentil nearest-rank', () => {
    const l = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentil(l, 95)).toBe(95)
    expect(percentil(l, 50)).toBe(50)
    expect(percentil([], 95)).toBeNull()
  })

  it('passa com p95 abaixo do limiar e nenhum erro', () => {
    const v = avaliar(
      { rota: '/api/health', latencias: [1, 2, 3, 4], erros: 0, timeouts: 0, fora2xx: {} },
      { p95Max: 500 },
    )
    expect(v.falhas).toEqual([])
  })

  it('reprova p95 no limiar, erro de conexão, timeout e resposta fora de 2xx — dizendo qual', () => {
    const lat = Array.from({ length: 100 }, (_, i) => (i < 94 ? 10 : 600))
    const v = avaliar(
      { rota: '/api/x', latencias: lat, erros: 2, timeouts: 1, fora2xx: { 429: 3, 500: 0 } },
      { p95Max: 500 },
    )
    expect(v.falhas).toEqual([
      'p95 600.0 ms >= 500 ms',
      '2 erro(s) de conexão',
      '1 timeout(s)',
      'respostas fora de 2xx: 429×3',
    ])
  })

  it('sem resposta nenhuma é reprovação, não "p95 indefinido passou"', () => {
    expect(
      avaliar({ rota: '/api/x', latencias: [], erros: 0, timeouts: 0, fora2xx: {} }, { p95Max: 500 }).falhas,
    ).toEqual(['nenhuma resposta medida'])
  })
})
