/**
 * A CALIBRAGEM DOS PREÇOS (recompensas v2, Task 2.4) — o que `docs/economia-v2.md` promete.
 *
 * A simulação (`scripts/economia/simular-ritmo.ts`) roda os pesos reais do core por 30 dias; o
 * perfil TÍPICO tem de comprar, só com Seeds, um comum a cada 2–3 dias, um raro por semana e um
 * épico a cada 2–3 semanas. Mudar peso ou preço sem refazer a conta reprova aqui.
 */
import { describe, expect, it } from 'vitest'

import { DIAS_ALVO, faixasDoCatalogo, PERFIS, simular } from '../scripts/economia/simular-ritmo'

describe('ritmo da economia', () => {
  const tipico = simular(PERFIS.find((p) => p.id === 'tipico')!)
  const faixas = faixasDoCatalogo()

  for (const rar of ['comum', 'raro', 'epico', 'lendario'] as const) {
    it(`perfil típico compra um ${rar} dentro da meta de dias`, () => {
      const [min, max] = DIAS_ALVO[rar]
      expect(faixas[rar].min / tipico.seedsPorDia).toBeGreaterThanOrEqual(min)
      expect(faixas[rar].max / tipico.seedsPorDia).toBeLessThanOrEqual(max)
    })
  }

  it('nenhuma fonte da simulação é tempo ou presença', () => {
    for (const p of PERFIS) {
      for (const fonte of Object.keys(simular(p).porFonte)) expect(fonte).not.toMatch(/presen|minuto|tempo|captura/i)
    }
  })

  it('mais prática rende mais: leve < típico < intenso', () => {
    const [leve, t, intenso] = PERFIS.map((p) => simular(p).seedsPorDia)
    expect(leve).toBeLessThan(t)
    expect(t).toBeLessThan(intenso)
  })
})
