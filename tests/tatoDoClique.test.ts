/**
 * O TATO QUE ACOMPANHA O SOM DO CLIQUE (`src/lib/sfxDelegate.ts`): a mesma dedução que escolhe o som
 * escolhe a vibração. Os sons de AÇÃO (guardar, acertar, errar) não vibram por aqui: quem os dispara
 * é o código da ação.
 */
import { describe, expect, it } from 'vitest'

import { PADROES_DE_TATO } from '../src/lib/dispositivo/tato'
import { tatoDoSom } from '../src/lib/sfxDelegate'

describe('o tato do clique', () => {
  it('cada som de interface tem a sua vibração', () => {
    expect(tatoDoSom('click')).toBe('toque')
    expect(tatoDoSom('select')).toBe('toque')
    expect(tatoDoSom('nav')).toBe('navegar')
    expect(tatoDoSom('open')).toBe('abrir')
    expect(tatoDoSom('close')).toBe('fechar')
    expect(tatoDoSom('toggleOn')).toBe('ligar')
    expect(tatoDoSom('toggleOff')).toBe('desligar')
  })

  it('os sons de ação não vibram pelo clique', () => {
    for (const som of ['add', 'remove', 'speak', 'success', 'error', 'recordStart', 'recordStop', 'levelUp'] as const) {
      expect(tatoDoSom(som), som).toBeNull()
    }
  })

  it('toda vibração devolvida tem padrão definido', () => {
    for (const som of ['click', 'select', 'nav', 'open', 'close', 'toggleOn', 'toggleOff'] as const) {
      const tipo = tatoDoSom(som)
      expect(tipo && PADROES_DE_TATO[tipo]).toBeTruthy()
    }
  })
})
