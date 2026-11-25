import { describe, expect, it } from 'vitest'

import { ID_DO_PARAKEET } from '../src/gateway/adapters/parakeetModelo'
import { transcricaoNoAparelho } from '../src/lib/captura/useEstadoSemRede'

describe('transcricaoNoAparelho (faixa sem rede)', () => {
  it('o modelo de fala do par completo basta', () => {
    expect(transcricaoNoAparelho(true, () => false)).toBe(true)
  })

  it('sem o modelo do par, o Parakeet baixado conta (mesmo critério da promessa offline)', () => {
    expect(transcricaoNoAparelho(false, (id) => id === ID_DO_PARAKEET)).toBe(true)
  })

  it('sem nenhum dos dois: não funciona', () => {
    expect(transcricaoNoAparelho(false, () => false)).toBe(false)
  })

  it('manifesto ilegível não derruba: conta como sem cópia', () => {
    expect(
      transcricaoNoAparelho(false, () => {
        throw new Error('localStorage bloqueado')
      }),
    ).toBe(false)
  })
})
