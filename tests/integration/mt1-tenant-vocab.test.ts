/**
 * Marco 1 — Commit 4: isolamento de vocab_cards + review_logs.
 *
 * Cobre a dedup POR usuário (A e B podem ter a mesma palavra), o carimbo do review_log e os
 * no-ops de escrita cruzada (review/patch/remove/relabel de A sobre cartão de B).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const A = asUserId('user-A')
const B = asUserId('user-B')

let h: EphemeralDb
let vocabRepo: any
let db: any
let schema: any
let aCard: any
let bCard: any

const CARTA = { word: 'house', back: 'casa', srcLang: 'en', tgtLang: 'pt', sentence: 'I live in a house.' }

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ vocabRepo } = await h.load('../../server/db/repositories/vocab'))
  ;({ db } = await h.load('../../server/db/db'))
  schema = await h.load('../../server/db/schema')

  aCard = (await vocabRepo.bulkAdd(A, [CARTA])).cards[0]
  bCard = (await vocabRepo.bulkAdd(B, [CARTA])).cards[0]
})
afterAll(async () => { await h.cleanup() })

describe('Marco 1 — isolamento vocab/reviewLogs', () => {
  it('dedup é POR usuário: A e B têm a mesma palavra, cartões distintos e carimbados', () => {
    expect(aCard).toBeDefined()
    expect(bCard).toBeDefined()
    expect(aCard.id).not.toBe(bCard.id)
    expect(aCard.userId).toBe('user-A')
    expect(bCard.userId).toBe('user-B')
  })

  it('re-adicionar a mesma palavra PARA O MESMO usuário CONTA a ocorrência (não cria cartão)', async () => {
    /* MUDANÇA DE CONTRATO DELIBERADA (F2b), não regressão.
       Antes, a 2ª vez que o usuário via a palavra virava `skipped: 'duplicada'` e sumia — e é
       por isso que `frequency` ficou 0 de 2.126 linhas no banco real, e "quantas vezes vi isto"
       nunca teve resposta. Agora a repetição é CONTADA: nenhum cartão novo, `occurrences` sobe,
       e a palavra volta em `repetidas` para a tela poder dizer "já estava no seu baralho".
       O invariante que importa continua o mesmo: um cartão por (usuário, palavra, idioma). */
    const r = await vocabRepo.bulkAdd(A, [CARTA])
    expect(r.cards).toHaveLength(0)
    expect(r.repetidas).toContain(CARTA.word)

    const deck = (await vocabRepo.list(A)).filter((c: any) => c.word === CARTA.word)
    expect(deck).toHaveLength(1)
    expect(deck[0].occurrences).toBeGreaterThanOrEqual(2)
  })

  it('list e get são isolados', async () => {
    expect((await vocabRepo.list(A)).map((c: any) => c.id)).toEqual([aCard.id])
    expect(await vocabRepo.get(A, bCard.id)).toBeUndefined()
  })

  it('review de A sobre cartão de B lança e NÃO cria review_log', async () => {
    await expect(vocabRepo.review(A, bCard.id, 3)).rejects.toThrow()
    const logs = await db.select().from(schema.reviewLogs)
    expect(logs.filter((l: any) => l.cardId === bCard.id)).toHaveLength(0)
  })

  it('review do próprio cartão grava review_log carimbado com o dono', async () => {
    await vocabRepo.review(A, aCard.id, 3)
    const mine = (await db.select().from(schema.reviewLogs)).filter((l: any) => l.cardId === aCard.id)
    expect(mine).toHaveLength(1)
    expect(mine[0].userId).toBe('user-A')
  })

  it('patch/remove/relabel de A sobre cartão de B são no-op', async () => {
    expect(await vocabRepo.patch(A, bCard.id, { back: 'HACK' })).toBeUndefined()
    await vocabRepo.remove(A, bCard.id)
    expect((await vocabRepo.get(B, bCard.id)).back).toBe('casa') // intacto p/ B
    expect(await vocabRepo.relabel(A, [{ id: bCard.id, srcLang: 'xx', tgtLang: 'yy' }])).toBe(0)
    expect((await vocabRepo.get(B, bCard.id)).srcLang).toBe('en')
  })
})
