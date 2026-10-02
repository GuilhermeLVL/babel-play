// @vitest-environment jsdom
/**
 * O DESENHO DO HEADSET NO COMPUTADOR (pedido do dono, 02/10/2026). `questNovo()` passa a valer também
 * no computador, atrás de uma chave DESLIGADA de fábrica; no Quest nada muda, e o celular fica de fora.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const aparelho = vi.hoisted(() => ({ tipo: 'desktop-com-gpu' }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  return { ...real, perfilDoDispositivo: () => ({ ...real.perfilDoDispositivo(), tipo: aparelho.tipo }) }
})

import {
  CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR,
  definirDesenhoNovoNoComputador,
  definirTelaNovaDoQuest,
  desenhoNovoNoComputador,
  noComputador,
  noHeadset,
  questNovo,
} from '../src/lib/dispositivo/telaNovaDoQuest'

afterEach(() => {
  localStorage.clear()
  aparelho.tipo = 'desktop-com-gpu'
  delete document.documentElement.dataset.questNovo
})

describe('o desenho novo no computador', () => {
  it('desligado de fábrica: o computador continua com as telas de sempre', () => {
    expect(desenhoNovoNoComputador()).toBe(false)
    expect(questNovo()).toBe(false)
  })

  it('ligado, vale no computador (com e sem GPU), marca o documento e avisa quem escuta', () => {
    const ouviu = vi.fn()
    window.addEventListener('babel:quest-tela-nova', ouviu)
    definirDesenhoNovoNoComputador(true)
    window.removeEventListener('babel:quest-tela-nova', ouviu)
    expect(localStorage.getItem(CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR)).toBe('sim')
    expect(questNovo()).toBe(true)
    expect(document.documentElement.dataset.questNovo).toBe('true')
    expect(ouviu).toHaveBeenCalledTimes(1)
    aparelho.tipo = 'desktop-sem-gpu'
    expect(questNovo()).toBe(true)

    definirDesenhoNovoNoComputador(false)
    expect(questNovo()).toBe(false)
    expect(document.documentElement.dataset.questNovo).toBe('false')
  })

  it('o celular fica de fora, com a chave ligada ou não', () => {
    definirDesenhoNovoNoComputador(true)
    for (const tipo of ['celular-bom', 'celular-fraco']) {
      aparelho.tipo = tipo
      expect(questNovo(), tipo).toBe(false)
    }
  })

  it('no Quest manda a chave do Quest, não a do computador', () => {
    aparelho.tipo = 'quest'
    expect(questNovo()).toBe(true)
    definirTelaNovaDoQuest(false)
    definirDesenhoNovoNoComputador(true)
    expect(questNovo()).toBe(false)
  })

  it('o que é do aparelho pergunta por noHeadset(), que não muda com o desenho', () => {
    definirDesenhoNovoNoComputador(true)
    expect(noHeadset()).toBe(false)
    expect(noComputador()).toBe(true)
    aparelho.tipo = 'quest'
    expect(noHeadset()).toBe(true)
    expect(noComputador()).toBe(false)
  })
})
