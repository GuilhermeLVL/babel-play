// @vitest-environment jsdom
/**
 * O TEMPO ATÉ A VOZ (`tts_inicio`) guardado para o /diagnostico: ao fechar o intérprete, o resumo da
 * conversa (só números, nenhum texto) fica neste aparelho, como o resumo da última captura.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { CHAVE_DO_ULTIMO_INTERPRETE, lerUltimoDoInterprete, tempoAteAVoz } from '../src/lib/voz/tempoAteAVoz'

beforeEach(() => {
  tempoAteAVoz.zerar()
  localStorage.clear()
})

describe('tempoAteAVoz.guardar', () => {
  it('sem amostra não guarda nada (nunca um zero inventado)', () => {
    tempoAteAVoz.guardar()
    expect(localStorage.getItem(CHAVE_DO_ULTIMO_INTERPRETE)).toBeNull()
    expect(lerUltimoDoInterprete()).toBeNull()
  })

  it('guarda o resumo da conversa com a hora e o que cada motor fez', () => {
    for (const ms of [1200, 1500, 1800, 2600]) tempoAteAVoz.registrar(ms, 'voz-da-nuvem')
    tempoAteAVoz.registrar(900, 'voz-do-aparelho')
    tempoAteAVoz.guardar(1_700_000_000_000)
    const guardado = lerUltimoDoInterprete()
    expect(guardado).toMatchObject({ quando: 1_700_000_000_000, amostras: 5 })
    expect(guardado?.porMotor['voz-da-nuvem'].amostras).toBe(4)
    expect(guardado?.porMotor['voz-do-aparelho'].p50).toBe(900)
    expect(JSON.stringify(guardado)).not.toMatch(/texto/i)
  })

  it('a conversa seguinte substitui a anterior', () => {
    tempoAteAVoz.registrar(1000, 'voz-do-aparelho')
    tempoAteAVoz.guardar(1)
    tempoAteAVoz.zerar()
    tempoAteAVoz.registrar(2000, 'voz-do-aparelho')
    tempoAteAVoz.guardar(2)
    expect(lerUltimoDoInterprete()).toMatchObject({ quando: 2, amostras: 1, p50: 2000 })
  })

  it('armazenamento quebrado não derruba a conversa', () => {
    tempoAteAVoz.registrar(1000, 'voz-do-aparelho')
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('cheio')
    }
    try {
      expect(() => tempoAteAVoz.guardar()).not.toThrow()
    } finally {
      Storage.prototype.setItem = original
    }
  })

  it('JSON estragado lê como nada', () => {
    localStorage.setItem(CHAVE_DO_ULTIMO_INTERPRETE, '{ruim')
    expect(lerUltimoDoInterprete()).toBeNull()
  })
})
