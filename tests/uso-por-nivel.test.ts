/**
 * O QUE RESTA DO MÊS POR NÍVEL, no cliente (change `planos-v3-e-rota-inteligente`, etapa 3).
 *
 * `GET /api/me/uso` passa a trazer `porNivel` (por trechos e ao vivo). A tela do medidor e a política
 * de rota leem `restanteDoNivel` — que também responde diante de um servidor anterior, sem `porNivel`.
 */
import { describe, expect, it } from 'vitest'

import { restanteDoNivel, type UsoDoMes } from '../src/lib/uso'

const base: UsoDoMes = {
  plano: 'premium',
  janela: '2026-10',
  chamadas: { usado: 0, teto: 100 },
  segundosDeAudio: { usado: 600, teto: 72_000 },
  tokensDeLlm: { usado: 0, teto: 100 },
}

describe('restanteDoNivel', () => {
  it('lê o restante que o servidor mandou, por nível', () => {
    const uso: UsoDoMes = {
      ...base,
      porNivel: {
        trechos: { usado: 600, teto: 72_000, restante: 71_400 },
        aovivo: { usado: 1_800, teto: 36_000, restante: 34_200 },
      },
    }
    expect(restanteDoNivel(uso, 'trechos')).toBe(71_400)
    expect(restanteDoNivel(uso, 'aovivo')).toBe(34_200)
  })

  it('sem teto é `null` — ilimitado não é zero', () => {
    const uso: UsoDoMes = {
      ...base,
      porNivel: {
        trechos: { usado: 10, teto: null, restante: null },
        aovivo: { usado: 0, teto: null, restante: null },
      },
    }
    expect(restanteDoNivel(uso, 'trechos')).toBeNull()
    expect(restanteDoNivel(uso, 'aovivo')).toBeNull()
  })

  it('servidor anterior (sem `porNivel`): os trechos saem do contador de sempre, e não há ao vivo', () => {
    expect(restanteDoNivel(base, 'trechos')).toBe(71_400)
    expect(restanteDoNivel(base, 'aovivo')).toBe(0)
    expect(restanteDoNivel({ ...base, segundosDeAudio: { usado: 5, teto: null } }, 'trechos')).toBeNull()
  })

  it('nunca é negativo, e sem resposta do servidor não há restante', () => {
    expect(restanteDoNivel({ ...base, segundosDeAudio: { usado: 80_000, teto: 72_000 } }, 'trechos')).toBe(0)
    expect(restanteDoNivel(null, 'trechos')).toBe(0)
  })
})
