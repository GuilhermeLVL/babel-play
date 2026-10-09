// @vitest-environment jsdom
/**
 * AS AJUDAS POR NÍVEL (`src/core/minigames/regras.ts`) e o nível que a pessoa escolheu
 * (`src/lib/jogos/nivelDoJogo.ts`).
 *
 * As regras por perfil de idade (o fator igual para todos) eram dos tabuleiros de antes e saíram com
 * eles. A tabela de níveis do protótipo, que os tabuleiros usam, é travada em
 * `tests/polimentoJogos.test.tsx`.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { ajudasDoJogo, jogoTemNiveis, NIVEIS_DO_JOGO } from '../src/core/minigames/regras'
import type { MinigameId } from '../src/core/minigames/types'
import { MINIGAMES } from '../src/core/minigames/types'
import { guardarNivelDoJogo, lerNivelDoJogo } from '../src/lib/jogos/nivelDoJogo'

const JOGOS = Object.keys(MINIGAMES) as MinigameId[]
const AJUDAS = ['espiar', 'radar', 'cortar', 'vogal', 'letra', 'tempo', 'resposta'] as const

describe('as ajudas por nível', () => {
  it('no Médio cada jogo tem as ajudas de sempre', () => {
    expect(ajudasDoJogo('memory', 'espiar', 'medio')).toBe(2)
    expect(ajudasDoJogo('wordsearch', 'radar', 'medio')).toBe(3)
    expect(ajudasDoJogo('blitz', 'cortar', 'medio')).toBe(2)
    expect(ajudasDoJogo('choseong', 'vogal', 'medio')).toBe(2)
    expect(ajudasDoJogo('tenis', 'letra', 'medio')).toBe(2)
    expect(ajudasDoJogo('taboo', 'tempo', 'medio')).toBe(2)
  })

  it('o Fácil nunca dá menos ajuda que o Médio, nem o Difícil mais; e no Difícil ninguém fica sem', () => {
    for (const jogo of JOGOS) {
      for (const qual of AJUDAS) {
        const [f, m, d] = NIVEIS_DO_JOGO.map((n) => ajudasDoJogo(jogo, qual, n))
        if (!m || !Number.isFinite(m)) continue
        expect(f, `${jogo} ${qual}`).toBeGreaterThanOrEqual(m)
        expect(d, `${jogo} ${qual}`).toBeLessThanOrEqual(m)
        expect(d, `${jogo} ${qual}`).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('a pausa só oferece a troca de nível nos jogos que a têm', () => {
    expect(jogoTemNiveis('tenis')).toBe(true)
    expect(jogoTemNiveis('cadavre')).toBe(false)
    expect(jogoTemNiveis('karaoke')).toBe(false)
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
