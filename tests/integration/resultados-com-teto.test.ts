/**
 * FASE 5 — `GET /api/exercises/results` PARA DE DEVOLVER A TABELA INTEIRA.
 *
 * ACHADO DO TESTE DE CARGA, e não de leitura de código. Com a base de desenvolvimento (198 linhas)
 * a rota custava 37 ms e ninguém via nada. Sob o k6, que grava uma rodada por iteração, a tabela
 * chegou a ~20 mil linhas e a MESMA rota passou a devolver **3,85 MB por chamada** — 1,1 GB de
 * tráfego numa corrida de 2m30, com `data_received` de 7,2 MB/s.
 *
 * O detalhe que fecha o diagnóstico: `scripts/perf/latencia.mjs` já mandava `?limite=20` desde a
 * baseline, e o `.strip()` do schema descartava o parâmetro em silêncio. A rota respondia 200 e
 * devolvia tudo — a medição da baseline registrou 37 ms para uma rota que, com dados de verdade,
 * não tem teto nenhum.
 *
 * Ela é chamada uma vez por montagem do Hub e a cada fim de rodada, então fica mais cara
 * exatamente na medida em que a pessoa joga.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const U = asUserId('teto-resultados')
let h: EphemeralDb
let repo: typeof import('../../server/db/repositories/exerciseResults').exerciseResultsRepo
let TETO: number

beforeAll(async () => {
  h = await setupEphemeralDb()
  const m = await import('../../server/db/repositories/exerciseResults')
  repo = m.exerciseResultsRepo
  TETO = m.TETO_PADRAO_DE_RESULTADOS

  // Mais linhas que o teto, em rodadas separadas — é assim que a tabela cresce de verdade.
  for (let r = 0; r < 6; r++) {
    await repo.addRodada(U, {
      roundId: `teto-${r}`,
      exerciseKind: 'memory',
      origem: r % 2 === 0 ? 'baralho' : 'trilha',
      score: 10,
      itens: Array.from({ length: 50 }, (_, i) => ({
        cardId: `c-${r}-${i}`,
        itemRef: `i-${r}-${i}`,
        correct: 1,
        attempts: 1,
        ms: 1000 + i,
        hinted: 0,
        kind: 'srs',
      })),
    })
  }
}, 60_000)

afterAll(async () => {
  await h.cleanup()
})

describe('o teto da listagem sem filtro', () => {
  it('a semeadura passou do teto — senão o teste não mediria nada', async () => {
    const { client } = await import('../../server/db/db')
    const r = await client.execute('select count(*) as n from exercise_results')
    expect(Number(r.rows[0].n)).toBeGreaterThan(TETO)
  })

  it('sem limite pedido, devolve no máximo o teto padrão', async () => {
    expect((await repo.list(U)).length).toBe(TETO)
  })

  it('devolve as MAIS RECENTES, não as primeiras', async () => {
    // A mediana de tempo que o Hub calcula precisa ser de amostra recente: o ritmo de quem joga
    // muda, e a média da vida inteira descreve alguém que a pessoa já não é.
    const pagina = await repo.list(U, 10)
    const todas = await repo.list(U, 1000)
    expect(pagina.map((l) => l.id)).toEqual(todas.slice(0, 10).map((l) => l.id))
    expect(pagina[0].createdAt).toBeGreaterThanOrEqual(pagina[9].createdAt)
  })

  it('quem pede mais recebe mais', async () => {
    expect((await repo.list(U, 250)).length).toBeGreaterThan(TETO)
  })

  /**
   * Os dois caminhos FILTRADOS continuam sem teto próprio, e isso é decisão: uma sessão ou uma
   * fonte já é um recorte, e cortá-lo de novo faria a tela de jogos remontar a última rodada com
   * metade dos itens. O que não tinha recorte nenhum era o caminho sem filtro.
   */
  it('o caminho por origem continua inteiro dentro da origem', async () => {
    const daTrilha = await repo.listByOrigem(U, 'trilha')
    expect(daTrilha.length).toBe(150)
    expect(daTrilha.every((l) => l.origem === 'trilha')).toBe(true)
  })
})
