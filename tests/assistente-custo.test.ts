/**
 * O CUSTO DO ASSISTENTE AO VIVO NOS PLANOS (`scripts/ia/modeloDeCusto.ts`; spec
 * `docs/specs/2026-10-25-assistente-ao-vivo.md`): o assistente gasta da `tokensMes` do plano, então a conta no teto do
 * dia cabe no que a coluna "IA de texto" já paga, e a margem do anual continua ≥ 0.
 */
import { describe, expect, it } from 'vitest'

import { custoDoAssistenteNoPiorCaso, margemDoAnual } from '../scripts/ia/modeloDeCusto'
import { PLAN_MATRIX } from '../src/core/planos'

describe('o assistente ao vivo na conta dos planos', () => {
  for (const plano of ['plus', 'familia', 'pro4'] as const)
    it(`${plano}: o teto do dia × 30 não passa da tokensMes, cabe na IA de texto, e a margem do anual segue ≥ 0`, () => {
      const a = custoDoAssistenteNoPiorCaso(plano)
      const m = margemDoAnual(plano)
      expect(a.tokensMes).toBeLessThanOrEqual(PLAN_MATRIX[plano].quotas.tokensMes ?? Infinity)
      expect(a.brlMes).toBeLessThanOrEqual(m.iaDeTextoBrl)
      expect(m.margemMensalBrl).toBeGreaterThanOrEqual(0)
    })

  it('o Grátis não tem assistente de nuvem: zero chamadas e zero custo', () => {
    expect(custoDoAssistenteNoPiorCaso('free')).toMatchObject({ chamadasMes: 0, tokensMes: 0, brlMes: 0 })
  })
})
