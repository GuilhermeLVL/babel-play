/**
 * A/B DO PRIMEIRO TEXTO NA TELA: o IC das medianas por rodada e a decisão (melhor / pior / sem diferença / não-regressão). Sem navegador.
 */
import { describe, expect, it } from 'vitest'

import { compararMedianas, decidir } from '../scripts/perf/latencia-legenda/ab-primeiro-texto.mjs'

const lento = [3200, 3300, 3400, 3200, 3350, 3250, 3400, 3300, 3280, 3320]
const rapido = [1040, 1050, 1060, 1045, 1055, 1048, 1052, 1041, 1058, 1049]

describe('ab-primeiro-texto', () => {
  it('bimodal lento contra rápido: o IC fica inteiro abaixo de 0 e a decisão é "depois melhor"', () => {
    const c = compararMedianas(lento, rapido, { iteracoes: 2000 })
    expect(c.dif).toBeLessThan(-2000)
    expect(c.ic[1]).toBeLessThan(0)
    expect(decidir(c)).toBe('depois melhor')
  })

  it('o mesmo conjunto dos dois lados: sem diferença provada', () => {
    const c = compararMedianas(lento, [...lento].reverse(), { iteracoes: 2000 })
    expect(decidir(c)).toBe('sem diferença provada')
  })

  it('pior: IC inteiro acima de 0', () => {
    expect(decidir(compararMedianas(rapido, lento, { iteracoes: 2000 }))).toBe('depois pior')
  })

  it('não-regressão: passa quando o limite superior do IC cabe no teto e falha quando não cabe', () => {
    const c = compararMedianas(rapido, rapido, { iteracoes: 2000 })
    expect(decidir(c, { naoRegressaoMs: 100 })).toBe('passa')
    expect(decidir(compararMedianas(rapido, lento, { iteracoes: 2000 }), { naoRegressaoMs: 100 })).toBe('falha')
  })

  it('é determinístico com a mesma semente', () => {
    expect(compararMedianas(lento, rapido, { iteracoes: 500 })).toEqual(
      compararMedianas(lento, rapido, { iteracoes: 500 }),
    )
  })
})
