/**
 * RECONSTRUÇÃO CONCORRENTE DOS AGREGADOS. No SQLite era `BEGIN IMMEDIATE` + retry em `SQLITE_BUSY`;
 * no Postgres é a trava consultiva do usuário como primeira instrução da transação. Duas reconstruções
 * simultâneas do mesmo usuário (duas leituras que chamam `garantir` ao mesmo tempo) têm de terminar
 * sem erro e com o mesmo resultado de uma só — sem célula duplicada nem chave primária violada.
 *
 * PGlite por padrão; com `TESTE_POSTGRES_URL=postgres://…`, contra um Postgres de verdade (pool de 5
 * conexões), onde as duas transações correm de fato em paralelo.
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import type { EphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let vocabRepo: any
let agregadosRepo: any

beforeAll(async () => {
  h = await abrirBancoDeTeste()
  ;({ vocabRepo } = await h.load('../../server/db/repositories/vocab'))
  ;({ agregadosRepo } = await h.load('../../server/db/repositories/agregados'))
}, 60_000)

afterAll(async () => {
  await h?.cleanup()
})

async function semear(userId: string): Promise<void> {
  const { cards } = await vocabRepo.bulkAdd(userId, [
    { word: 'water', srcLang: 'en', back: 'água' },
    { word: 'fire', srcLang: 'en', back: 'fogo' },
  ])
  for (const c of cards) await vocabRepo.review(userId, c.id, 3)
}

describe('agregados: reconstrução concorrente', () => {
  it('duas reconstruções simultâneas do mesmo usuário terminam sem erro e com um resultado só', async () => {
    const userId = `agreg-conc-${randomUUID()}`
    await semear(userId)
    await agregadosRepo.reconstruir(userId)
    const esperado = await agregadosRepo.celulas(userId)
    expect(esperado).toHaveLength(1)

    await Promise.all([agregadosRepo.reconstruir(userId), agregadosRepo.reconstruir(userId)])
    expect(await agregadosRepo.celulas(userId)).toEqual(esperado)
    const e = await agregadosRepo.estado(userId)
    expect(e.marcaVista).toBe(e.marcaBruto)
  })

  it('várias leituras em paralelo (garantir) com revisões no meio não perdem revisão', async () => {
    const userId = `agreg-conc-rev-${randomUUID()}`
    const { cards } = await vocabRepo.bulkAdd(userId, [
      { word: 'one', srcLang: 'en', back: 'um' },
      { word: 'two', srcLang: 'en', back: 'dois' },
      { word: 'three', srcLang: 'en', back: 'três' },
      { word: 'four', srcLang: 'en', back: 'quatro' },
    ])
    await Promise.all([
      ...cards.map((c: any) => vocabRepo.review(userId, c.id, 3)),
      agregadosRepo.reconstruir(userId),
      agregadosRepo.reconstruir(userId),
    ])
    await agregadosRepo.garantir(userId)
    expect(await agregadosRepo.revisoesVivas(userId)).toBe(4)
  })
})
