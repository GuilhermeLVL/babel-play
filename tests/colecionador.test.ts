/**
 * O COLECIONADOR PASSA A SER CONFERIDO PELO SERVIDOR.
 *
 * Era a única conquista fora de `CONQUISTAS_CONFERIVEIS`: qualquer pedido direto à rota creditava
 * 100 Seeds e 120 XP. O servidor não vê os eventos raros, mas vê os pré-requisitos de cada um.
 */
import { describe, expect, it } from 'vitest'

import {
  CONQUISTAS,
  CONQUISTAS_CONFERIVEIS,
  type ContextoDeConquistas,
  EVENTOS_RAROS_DO_JOGO,
  progressoConferivelDoColecionador,
  progressoNoServidor,
} from '../src/core'
import { EVENTOS_RAROS } from '../src/lib/eventosDeJogo'

const ctx = (over: Partial<ContextoDeConquistas['metricas']> = {}, combo = 0): ContextoDeConquistas => ({
  metricas: { drillCorrect: 0, correctReviews: 0, rodadasPerfeitas: 0, ...over } as never,
  nivel: 1,
  melhorComboPorJogo: combo ? { blitz: combo } : {},
  // O que o navegador diria: o servidor ignora estes dois para o Colecionador.
  eventosVistos: 11,
  totalDeEventos: 11,
  idiomas: 0,
  compras: 0,
})

describe('Colecionador no servidor', () => {
  it('todas as conquistas são conferidas', () => {
    expect(CONQUISTAS.map((c) => c.id).filter((id) => !CONQUISTAS_CONFERIVEIS.has(id))).toEqual([])
  })

  it('o número de eventos raros do core bate com o do jogo', () => {
    expect(EVENTOS_RAROS_DO_JOGO).toBe(EVENTOS_RAROS.length)
  })

  it('sem jogar, o navegador dizendo "vi tudo" não basta', () => {
    const colecionador = CONQUISTAS.find((c) => c.id === 'colecionador')!
    const p = progressoNoServidor(colecionador, ctx())
    expect(p.atual).toBeLessThan(p.meta)
  })

  it('exige combo 15 no Duelo, uma rodada perfeita e seis acertos', () => {
    expect(progressoConferivelDoColecionador(ctx({ drillCorrect: 6, rodadasPerfeitas: 1 }, 15))).toEqual({
      atual: 3,
      meta: 3,
    })
    expect(progressoConferivelDoColecionador(ctx({ drillCorrect: 6, rodadasPerfeitas: 1 }, 14))).toEqual({
      atual: 2,
      meta: 3,
    })
    expect(progressoConferivelDoColecionador(ctx({ drillCorrect: 5, rodadasPerfeitas: 1 }, 15))).toEqual({
      atual: 2,
      meta: 3,
    })
    expect(
      progressoConferivelDoColecionador(ctx({ drillCorrect: 3, correctReviews: 3, rodadasPerfeitas: 1 }, 15)).atual,
    ).toBe(3)
  })

  it('as outras conquistas seguem a própria regra', () => {
    const cliente = CONQUISTAS.find((c) => c.id === 'cliente')!
    expect(progressoNoServidor(cliente, { ...ctx(), compras: 1 })).toEqual(cliente.progresso({ ...ctx(), compras: 1 }))
  })
})
