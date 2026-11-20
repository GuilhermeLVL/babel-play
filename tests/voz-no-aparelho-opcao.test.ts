/**
 * A OPÇÃO "Voz de alta qualidade" do seletor de voz (`opcoesDeVoz`): título curto, descrição com o fato e a saída,
 * sem repetir "No aparelho" (o chip é "Voz sintetizada").
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

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

describe('opcoesDeVoz — as 10 vozes com o modelo baixado', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('sem o modelo, uma linha só; com ele, as 10 vozes nomeadas e a F1 recomendada', async () => {
    const { REVISAO_DO_SUPERTONIC } = await import('../src/core/voz/supertonic')
    expect(opcoesDeVoz('pt', false, true).filter((x) => x.id === VOZ_NO_APARELHO)).toHaveLength(1)
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'frasy.vozNoAparelho.modelo' ? REVISAO_DO_SUPERTONIC : null),
    })
    const linhas = opcoesDeVoz('pt', false, true).filter((x) => x.id === VOZ_NO_APARELHO)
    expect(linhas.map((x) => x.vozDoModelo)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'])
    expect(linhas[0].nome).toBe('Feminina 1')
    expect(linhas[5].nome).toBe('Masculina 1')
    expect(linhas.filter((x) => x.etiquetas.includes('Recomendada')).map((x) => x.vozDoModelo)).toEqual(['F1'])
  })
})
