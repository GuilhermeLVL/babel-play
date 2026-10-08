// @vitest-environment jsdom
/**
 * AS CENAS DOS JOGOS (`src/components/minigames/ArteDosJogos.tsx`): cada jogo tem a sua. Os nove
 * culturais vestiam a arte de outro (quatro deles eram o relógio do Duelo) e a grade lia como jogo
 * repetido. E a regra de sempre continua: nenhuma cor literal, para a arte trocar junto com o tema.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import ArteDoJogo from '../src/components/minigames/ArteDosJogos'
import { type MinigameId, MINIGAMES } from '../src/core'

afterEach(cleanup)

const JOGOS = Object.keys(MINIGAMES) as MinigameId[]
const desenho = (jogo: MinigameId) => {
  const { container } = render(<ArteDoJogo jogo={jogo} />)
  const svg = container.querySelector('svg') as SVGElement
  const html = svg.innerHTML
  cleanup()
  return html
}

describe('as cenas dos jogos', () => {
  it('todo jogo tem cena, e nenhuma se repete', () => {
    const cenas = JOGOS.map(desenho)
    expect(cenas.every((c) => c.length > 0)).toBe(true)
    expect(new Set(cenas).size).toBe(JOGOS.length)
  })

  it('nenhuma cor literal: só tokens do tema e a cor da família', () => {
    for (const jogo of JOGOS) {
      const html = desenho(jogo)
      const cores = [...html.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1])
      for (const cor of cores) {
        expect(cor, `${jogo}: ${cor}`).toMatch(/^(none|currentColor|var\(--[a-z-]+\))$/)
      }
    }
  })
})
