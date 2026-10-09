import { describe, expect, it } from 'vitest'

import { COMO_SE_JOGA } from '../src/components/minigames/ComoSeJoga'
import { type MinigameId, MINIGAMES } from '../src/core/minigames/types'

/**
 * A FICHA "COMO SE JOGA".
 *
 * O tour guiado (um balão por elemento do tabuleiro de antes) saiu com o desenho de antes: no desenho do
 * protótipo a primeira partida abre a explicação em três telas (`tests/explicacaoDoJogo.test.tsx`). O que
 * fica guardado aqui é a ficha de referência, que a pausa e a antessala continuam abrindo.
 */

const IDS = Object.keys(MINIGAMES) as MinigameId[]

describe('a ficha de cada jogo', () => {
  it('a ficha completa continua existindo para quem quer ler os detalhes', () => {
    // O tour é o primeiro contato; os LIMITES do método continuam escritos no "?" — no meio da
    // partida eles seriam justamente o texto que faz pular.
    for (const id of IDS) {
      expect(COMO_SE_JOGA[id].limites.length, `jogo ${id}`).toBeGreaterThan(30)
    }
  })
})
