/**
 * SQL cru no dialeto Postgres (Fase 1, tarefa 4): armadilhas que SQLite perdoava e Postgres não.
 * Alias camelCase sem aspas vira minúsculo; subconsulta em FROM exige alias; `LIMIT -1` não existe;
 * `max(a, b)` de dois argumentos é `GREATEST`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const U = asUserId('dialeto-user')

describe('SQL cru no dialeto Postgres', () => {
  let h: EphemeralDb

  const m: Record<string, any> = {}

  beforeAll(async () => {
    h = await setupEphemeralDb()
    m.db = await h.load('../../server/db/db')
    m.schema = await h.load('../../server/db/schema')
    m.contagens = await h.load('../../server/db/repositories/contagensDeConteudo')
    m.agregados = await h.load('../../server/db/repositories/agregados')
    m.cache = await h.load('../../server/db/repositories/cacheDeTraducao')
  })
  afterAll(async () => {
    await h.cleanup()
  })

  it('contagensDeConteudo lê a duração da sessão (alias "duracaoMs" entre aspas)', async () => {
    await m.db.db.insert(m.schema.sessions).values({
      id: 'sess-dur',
      userId: U,
      title: 'Aula',
      kind: 'gravada',
      durationMs: 123_000,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    })
    await m.db.db.insert(m.schema.vocabCards).values({
      id: 'card-dur',
      userId: U,
      word: 'lesson',
      srcLang: 'en',
      sessionId: 'sess-dur',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    })
    const r = await m.contagens.contagensDeConteudo(U, { agora: 1_700_000_100_000, idioma: '' })
    expect(r.sessoes).toHaveLength(1)
    expect(r.sessoes[0].duracaoMs).toBe(123_000)
  })

  it('preencherAgregadosPendentes roda (subconsulta com alias) e é no-op sem dados', async () => {
    const r = await m.agregados.preencherAgregadosPendentes({ maximoDeUsuarios: 5 })
    expect(r).toEqual({ preenchidos: 0, restam: false })
  })

  it('cacheDeTraducao.apagarExcedentes apaga só o que passa do teto (OFFSET sem LIMIT)', async () => {
    for (const [i, chave] of ['a', 'b', 'c', 'd'].entries()) {
      await m.cache.cacheDeTraducaoRepo.gravar({
        chave,
        origem: 'en',
        destino: 'pt',
        modelo: 'm',
        versaoPrompt: 'v1',
        traducao: 'x',
        criadoEm: 1_000,
        usadoEm: 100 + i,
      })
    }
    const apagadas = await m.cache.cacheDeTraducaoRepo.apagarExcedentes(2)
    expect(apagadas).toBe(2)
  })

  it('reconstruirNaTransacao roda no Postgres: booleano em coalesce, ON CONFLICT e estado por item', async () => {
    const { db, linhas } = m.db
    const { sql } = await import('drizzle-orm')
    const t = 1_700_000_000_000
    await db.insert(m.schema.reviewLogs).values({
      id: 'rl1',
      userId: U,
      cardId: 'card-dur',
      reviewedAt: t,
      grade: 3,
      respostaMs: 900,
      createdAt: t,
      updatedAt: t,
    })
    for (const [id, correct, em] of [
      ['er1', 0, t],
      ['er2', 1, t + 5_000],
    ] as const) {
      await db.insert(m.schema.exerciseResults).values({
        id,
        userId: U,
        cardId: 'card-dur',
        kind: 'drill',
        exerciseKind: 'match',
        roundId: 'r1',
        correct,
        ms: 500,
        createdAt: em,
        updatedAt: em,
      })
    }
    await m.agregados.reconstruirNaTransacao(db, U, 'UTC', t + 10_000)
    const [e] = linhas(
      await db.execute(
        sql`SELECT acertos, erros, ultimo_resultado, ultimo_em FROM estado_por_item WHERE user_id = ${U}`,
      ),
    )
    expect(e).toMatchObject({ acertos: 1, erros: 1, ultimo_resultado: 1, ultimo_em: t + 5_000 })
  })
})
