// @vitest-environment jsdom
/**
 * AS REGRAS POR NÍVEL (`src/core/minigames/regras.ts`) e o nível que a pessoa escolheu
 * (`src/lib/jogos/nivelDoJogo.ts`). O que não pode quebrar: no Médio cada jogo tem exatamente os
 * números de sempre; o Fácil nunca aperta mais que o Médio, nem o Difícil menos.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  ajudasDoJogo,
  jogoTemNiveis,
  NIVEIS_DO_JOGO,
  type PerfilDeIdade,
  REGRAS_DE_BASE,
  resumoDasRegras,
  segundosDoJogo,
  tempoAVistaDoJogo,
  vidasDoJogo,
} from '../src/core/minigames/regras'
import type { MinigameId } from '../src/core/minigames/types'
import { guardarNivelDoJogo, lerNivelDoJogo } from '../src/lib/jogos/nivelDoJogo'

const PERFIS: PerfilDeIdade[] = ['kids', 'pro', 'senior']
const JOGOS = Object.keys(REGRAS_DE_BASE) as MinigameId[]

describe('as regras por nível', () => {
  it('o Médio é a regra de sempre: os números que cada jogo trazia no componente', () => {
    expect(segundosDoJogo('blitz', 'pro', 'medio')).toBe(60)
    expect(segundosDoJogo('blitz', 'senior', 'medio')).toBe(90)
    expect(PERFIS.map((p) => segundosDoJogo('karuta', p, 'medio'))).toEqual([12, 8, 14])
    expect(PERFIS.map((p) => segundosDoJogo('choseong', p, 'medio'))).toEqual([18, 15, 22])
    expect(PERFIS.map((p) => segundosDoJogo('tenis', p, 'medio'))).toEqual([8, 6, 9])
    expect(PERFIS.map((p) => segundosDoJogo('shiritori', p, 'medio'))).toEqual([20, 15, 25])
    expect(PERFIS.map((p) => segundosDoJogo('taboo', p, 'medio'))).toEqual([35, 30, 45])
    expect(PERFIS.map((p) => vidasDoJogo('koffer', p, 'medio'))).toEqual([4, 3, 4])
    expect(PERFIS.map((p) => tempoAVistaDoJogo('koffer', p, 'medio'))).toEqual([2600, 2000, 3000])
    expect(PERFIS.map((p) => vidasDoJogo('bao', p, 'medio'))).toEqual([4, 3, 4])
    expect(ajudasDoJogo('memory', 'espiar', 'medio')).toBe(2)
    expect(ajudasDoJogo('wordsearch', 'radar', 'medio')).toBe(3)
    expect(ajudasDoJogo('blitz', 'cortar', 'medio')).toBe(2)
    expect(ajudasDoJogo('choseong', 'vogal', 'medio')).toBe(2)
    expect(ajudasDoJogo('tenis', 'letra', 'medio')).toBe(2)
    expect(ajudasDoJogo('taboo', 'tempo', 'medio')).toBe(2)
  })

  it('o Fácil nunca aperta mais que o Médio, e o Difícil nunca menos, em todo jogo e perfil', () => {
    for (const jogo of JOGOS) {
      for (const perfil of PERFIS) {
        const [f, m, d] = NIVEIS_DO_JOGO.map((n) => resumoDasRegras(jogo, perfil, n))
        if (m.segundos !== null) {
          expect(f.segundos, `${jogo} ${perfil}`).toBeGreaterThan(m.segundos)
          expect(d.segundos, `${jogo} ${perfil}`).toBeLessThan(m.segundos)
        }
        if (m.vidas !== null) {
          expect(f.vidas, `${jogo} ${perfil}`).toBeGreaterThan(m.vidas)
          expect(d.vidas, `${jogo} ${perfil}`).toBeLessThan(m.vidas)
        }
        for (const qual of Object.keys(m.ajudas)) {
          expect(f.ajudas[qual]).toBeGreaterThan(m.ajudas[qual])
          expect(d.ajudas[qual]).toBeLessThan(m.ajudas[qual])
        }
      }
    }
  })

  it('no Difícil ninguém fica sem vida nem sem ajuda', () => {
    for (const jogo of JOGOS) {
      for (const perfil of PERFIS) {
        const d = resumoDasRegras(jogo, perfil, 'dificil')
        if (d.vidas !== null) expect(d.vidas).toBeGreaterThanOrEqual(1)
        for (const n of Object.values(d.ajudas)) expect(n).toBeGreaterThanOrEqual(1)
        if (d.segundos !== null) expect(d.segundos).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it('jogo sem regra que o nível mude diz que não tem níveis', () => {
    expect(jogoTemNiveis('tenis')).toBe(true)
    expect(jogoTemNiveis('cadavre')).toBe(false)
    expect(jogoTemNiveis('karaoke')).toBe(false)
    expect(segundosDoJogo('cadavre', 'pro', 'facil')).toBeNull()
    expect(ajudasDoJogo('cadavre', 'qualquer', 'facil')).toBe(0)
  })
})

describe('o nível escolhido', () => {
  beforeEach(() => localStorage.clear())

  it('sem escolha, é o Médio', () => {
    expect(lerNivelDoJogo('termo')).toBe('medio')
  })

  it('é por jogo, e o jogo ainda não ajustado começa no último nível escolhido', () => {
    guardarNivelDoJogo('termo', 'dificil')
    guardarNivelDoJogo('ditado', 'facil')
    expect(lerNivelDoJogo('termo')).toBe('dificil')
    expect(lerNivelDoJogo('ditado')).toBe('facil')
    expect(lerNivelDoJogo('bao')).toBe('facil')
  })

  it('valor estranho no armazenamento não vira nível', () => {
    localStorage.setItem('babel.nivel.termo', 'impossivel')
    expect(lerNivelDoJogo('termo')).toBe('medio')
  })
})
