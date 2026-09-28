/**
 * O BAÚ DA RODADA EXIGE DESEMPENHO — duas estrelas, a régua do fim de rodada (`fases`).
 *
 * O servidor sorteava um item a cada rodada gravada, mesmo com 0% de acerto: o baú premiava ter
 * aberto o jogo, não ter jogado. A régua é calculada das LINHAS GRAVADAS da rodada (o servidor não
 * confia no cliente), com o mesmo corte de estrelas que a tela mostra: precisão ≥ 75%.
 */
import { describe, expect, it } from 'vitest'

import { ESTRELAS_PARA_O_BAU, rodadaRendeBau } from '../src/core'

const linhas = (...c: Array<0 | 1 | null>) => c.map((correct) => ({ correct }))

describe('rodadaRendeBau', () => {
  it('pede duas estrelas', () => {
    expect(ESTRELAS_PARA_O_BAU).toBe(2)
  })

  it('0% e 50% não rendem baú; 75% e 100% rendem', () => {
    expect(rodadaRendeBau(linhas(0, 0, 0, 0))).toEqual({ rende: false, estrelas: 0 })
    expect(rodadaRendeBau(linhas(1, 1, 0, 0))).toEqual({ rende: false, estrelas: 1 })
    expect(rodadaRendeBau(linhas(1, 1, 1, 0))).toEqual({ rende: true, estrelas: 2 })
    expect(rodadaRendeBau(linhas(1, 1, 1, 1))).toEqual({ rende: true, estrelas: 3 })
  })

  it('só o que teve resposta entra na conta; rodada sem resposta nenhuma não rende', () => {
    expect(rodadaRendeBau(linhas(1, 1, 1, null))).toEqual({ rende: true, estrelas: 3 })
    expect(rodadaRendeBau(linhas(null, null))).toEqual({ rende: false, estrelas: 0 })
    expect(rodadaRendeBau([])).toEqual({ rende: false, estrelas: 0 })
  })
})
