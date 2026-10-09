// @vitest-environment jsdom
/**
 * O DESENHO NOVO É O ÚNICO (decisão do dono, 08/10/2026: "apague o legado"). Vale no computador, no
 * headset, no celular e no tablet, sem chave: as de antes (`babel.desenhoNovo`, `babel.quest.telaNova`,
 * `?desenho=`) não são mais lidas. O que continua variando é o APARELHO, e quem pergunta por ele é
 * `noHeadset()`, `noComputador()` e `noCelular()`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const aparelho = vi.hoisted(() => ({ tipo: 'desktop-com-gpu' }))
vi.mock('../src/lib/dispositivo/perfil', async (original) => {
  const real = await original<typeof import('../src/lib/dispositivo/perfil')>()
  const perfilDoDispositivo = () => ({ ...real.perfilDoDispositivo(), tipo: aparelho.tipo })
  return { ...real, perfilDoDispositivo }
})

import {
  marcarQuestNovoNoDocumento,
  noCelular,
  noComputador,
  noHeadset,
  questNovo,
} from '../src/lib/dispositivo/telaNovaDoQuest'

const APARELHOS = ['desktop-com-gpu', 'desktop-sem-gpu', 'quest', 'celular-bom', 'celular-fraco']

afterEach(() => {
  localStorage.clear()
  aparelho.tipo = 'desktop-com-gpu'
  delete document.documentElement.dataset.questNovo
})

describe('o desenho novo é o único', () => {
  it('vale em todo aparelho, e o documento é marcado para o CSS', () => {
    for (const tipo of APARELHOS) {
      aparelho.tipo = tipo
      expect(questNovo(), tipo).toBe(true)
      delete document.documentElement.dataset.questNovo
      marcarQuestNovoNoDocumento()
      expect(document.documentElement.dataset.questNovo, tipo).toBe('true')
    }
  })

  it('as chaves de antes não desligam nada: quem as tinha gravadas continua no desenho novo', () => {
    localStorage.setItem('babel.desenhoNovo', 'nao')
    localStorage.setItem('babel.quest.telaNova', 'nao')
    for (const tipo of APARELHOS) {
      aparelho.tipo = tipo
      expect(questNovo(), tipo).toBe(true)
    }
    marcarQuestNovoNoDocumento()
    expect(document.documentElement.dataset.questNovo).toBe('true')
  })
})

describe('o que é do aparelho', () => {
  it('noHeadset(), noComputador() e noCelular() respondem pelo aparelho, cada um pelo seu', () => {
    const esperado: Record<string, [boolean, boolean, boolean]> = {
      'desktop-com-gpu': [false, true, false],
      'desktop-sem-gpu': [false, true, false],
      quest: [true, false, false],
      'celular-bom': [false, false, true],
      'celular-fraco': [false, false, true],
    }
    for (const tipo of APARELHOS) {
      aparelho.tipo = tipo
      expect([noHeadset(), noComputador(), noCelular()], tipo).toEqual(esperado[tipo])
    }
  })
})
