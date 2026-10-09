// @vitest-environment jsdom
/**
 * AS PREFERÊNCIAS DO QUEST NA CAPTURA: a fonte do som, a chave guardada e o tamanho da legenda.
 */
import { cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  ESCALAS_DA_LEGENDA,
  guardarFonteDoQuest,
  lerEscalaDaLegenda,
  lerFonteDoQuest,
  mudarEscalaDaLegenda,
} from '../src/lib/dispositivo/preferenciasDoQuest'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('a fonte do Quest', () => {
  it('de fábrica são OS DOIS; a escolha fica guardada; valor estranho volta ao padrão', () => {
    expect(lerFonteDoQuest()).toBe('ambos')
    guardarFonteDoQuest('mic')
    expect(lerFonteDoQuest()).toBe('mic')
    localStorage.setItem('babel.quest.fonte', 'qualquer')
    expect(lerFonteDoQuest()).toBe('ambos')
  })
})

describe('o tamanho da legenda', () => {
  it('o tamanho anda um passo por vez, para nas pontas e fica guardado', () => {
    expect(lerEscalaDaLegenda()).toBe(1)
    expect(mudarEscalaDaLegenda(1, 1)).toBe(1.25)
    expect(lerEscalaDaLegenda()).toBe(1.25)
    const maior = ESCALAS_DA_LEGENDA[ESCALAS_DA_LEGENDA.length - 1]
    expect(mudarEscalaDaLegenda(maior, 1)).toBe(maior)
    expect(mudarEscalaDaLegenda(ESCALAS_DA_LEGENDA[0], -1)).toBe(ESCALAS_DA_LEGENDA[0])
  })
})
