/**
 * A OPÇÃO "Voz de alta qualidade" do seletor de voz (`opcoesDeVoz`): título curto, descrição com o fato e a saída,
 * sem repetir "No aparelho" (o chip é "Voz sintetizada").
 */
import { describe, expect, it } from 'vitest'

import { MB_DO_SUPERTONIC } from '../src/core/voz/supertonic'
import { opcoesDeVoz } from '../src/lib/voz/catalogoDeVozes'
import { VOZ_NO_APARELHO } from '../src/lib/voz/vozNoAparelho'

describe('opcoesDeVoz — voz de alta qualidade no aparelho', () => {
  const o = opcoesDeVoz('pt', false, true).find((x) => x.id === VOZ_NO_APARELHO)

  it('tem título curto e a descrição diz o fato, o custo e a saída', () => {
    expect(o?.nome).toBe('Voz de alta qualidade')
    expect(o?.detalhe).toBe(
      `Voz sintetizada que roda neste aparelho. Baixa uma vez (≈ ${MB_DO_SUPERTONIC} MB) e depois funciona sem internet.`,
    )
  })

  it('o rótulo é só "Voz sintetizada", sem repetir "No aparelho"', () => {
    expect(o?.etiquetas).toEqual(['Voz sintetizada'])
    expect(`${o?.nome} ${o?.detalhe}`).not.toMatch(/No aparelho/i)
  })
})
