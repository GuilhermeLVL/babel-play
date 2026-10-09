// @vitest-environment jsdom
/**
 * O DESENHO DO HEADSET NO COMPUTADOR (pedido do dono, 02/10/2026). `questNovo()` passa a valer também
 * no computador, atrás de uma chave DESLIGADA de fábrica; no Quest nada muda.
 *
 * NO CELULAR E NO TABLET (decisão do dono, 08/10/2026: o desenho novo será o único em todo aparelho) a
 * mesma chave vale, e nasce LIGADA; `nao` devolve a casca de antes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const aparelho = vi.hoisted(() => ({ tipo: 'desktop-com-gpu' }))
const semToque = vi.hoisted(() => ({ agora: false }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  /* O celular e o tablet de verdade têm tela de toque; o jsdom não tem nenhuma. */
  const perfilDoDispositivo = () => {
    const p = real.perfilDoDispositivo()
    const toques = aparelho.tipo.startsWith('celular') && !semToque.agora ? 5 : 0
    return { ...p, tipo: aparelho.tipo, sinais: { ...p.sinais, toques } }
  }
  return { ...real, perfilDoDispositivo }
})

import {
  CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR,
  definirDesenhoNovoNoComputador,
  definirTelaNovaDoQuest,
  desenhoNovoNoComputador,
  noCelular,
  noComputador,
  noHeadset,
  questNovo,
} from '../src/lib/dispositivo/telaNovaDoQuest'

afterEach(() => {
  localStorage.clear()
  aparelho.tipo = 'desktop-com-gpu'
  semToque.agora = false
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

  it('no celular e no tablet o desenho novo nasce ligado, sem ninguém ter mexido na chave', () => {
    for (const tipo of ['celular-bom', 'celular-fraco']) {
      aparelho.tipo = tipo
      expect(localStorage.getItem(CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR)).toBeNull()
      expect(desenhoNovoNoComputador(), tipo).toBe(true)
      expect(questNovo(), tipo).toBe(true)
      expect(noCelular(), tipo).toBe(true)
      expect(noComputador(), tipo).toBe(false)
      expect(noHeadset(), tipo).toBe(false)
    }
  })

  it('no celular a chave continua valendo: desligar grava `nao` (apagar devolveria o padrão) e religar grava `sim`', () => {
    aparelho.tipo = 'celular-bom'
    definirDesenhoNovoNoComputador(false)
    expect(localStorage.getItem(CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR)).toBe('nao')
    expect(questNovo()).toBe(false)
    expect(document.documentElement.dataset.questNovo).toBe('false')
    definirDesenhoNovoNoComputador(true)
    expect(localStorage.getItem(CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR)).toBe('sim')
    expect(questNovo()).toBe(true)
    expect(document.documentElement.dataset.questNovo).toBe('true')
  })

  it('o padrão ligado é do aparelho DE TOQUE: o perfil celular sem toque (só sem captura de tela) segue o do build', () => {
    semToque.agora = true
    aparelho.tipo = 'celular-fraco'
    expect(noCelular()).toBe(true)
    expect(questNovo()).toBe(false)
    definirDesenhoNovoNoComputador(true)
    expect(questNovo()).toBe(true)
    definirDesenhoNovoNoComputador(false)
    expect(localStorage.getItem(CHAVE_DO_DESENHO_NOVO_NO_COMPUTADOR)).toBeNull()
    expect(questNovo()).toBe(false)
  })

  it('o padrão ligado é só do celular: no computador, sem a chave, continua desligado', () => {
    aparelho.tipo = 'celular-bom'
    expect(questNovo()).toBe(true)
    aparelho.tipo = 'desktop-com-gpu'
    expect(noCelular()).toBe(false)
    expect(questNovo()).toBe(false)
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
