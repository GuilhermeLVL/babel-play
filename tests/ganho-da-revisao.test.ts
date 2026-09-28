/**
 * O RESUMO DO FIM DA REVISÃO DIZ O QUE FOI CREDITADO (recompensas v2, Task 5.4 — spec 10.2).
 *
 * O servidor não credita "uma revisão": ele reconta o perfil (`xpDeEventos`, `seedsGanhasDeEventos`)
 * a partir de `reviews` e `correctReviews` (nota >= 3). `ganhoDaRevisao` faz a mesma conta para as
 * notas de uma rodada, e o fim de rodada dos jogos (`ganhoDaRodada`) usa a MESMA regra por item.
 */
import { describe, expect, it } from 'vitest'

import { PESOS_SEEDS, PESOS_XP, seedsGanhasDeEventos, xpDeEventos } from '../src/core/learning/xp'
import { ganhoDaNota, ganhoDaRevisao } from '../src/core/minigames/grade'

const base = { sessoes: 0, palavrasCapturadas: 0, revisoes: 0, revisoesCertas: 0 }

describe('ganhoDaRevisao', () => {
  it('soma XP e Seeds nota a nota, com o corte de acerto em 3', () => {
    expect(ganhoDaNota(1)).toEqual({ xp: PESOS_XP.revisao, seeds: 0 })
    expect(ganhoDaNota(2)).toEqual({ xp: PESOS_XP.revisao, seeds: 0 })
    expect(ganhoDaNota(3)).toEqual({ xp: PESOS_XP.revisao + PESOS_XP.revisaoCerta, seeds: PESOS_SEEDS.revisaoCerta })
    expect(ganhoDaRevisao([])).toEqual({ xp: 0, seeds: 0 })
  })

  it('é exatamente a diferença que o recálculo do perfil mostra', () => {
    const notas = [1, 2, 3, 4, 4, 3]
    const certas = notas.filter((n) => n >= 3).length
    const depois = { ...base, revisoes: notas.length, revisoesCertas: certas }
    expect(ganhoDaRevisao(notas)).toEqual({
      xp: xpDeEventos(depois) - xpDeEventos(base),
      seeds: seedsGanhasDeEventos(depois) - seedsGanhasDeEventos(base),
    })
  })
})
