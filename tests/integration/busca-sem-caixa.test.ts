/**
 * Busca de texto digitado pela pessoa ignora a caixa (Postgres: `LIKE` distingue maiúsculas, então a
 * busca usa `ILIKE`). Um teste por entrada de busca do servidor: acervo de palavras e notas do Anki.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const U = asUserId('busca-user')

describe('busca sem diferenciar caixa', () => {
  let h: EphemeralDb

  let vocabRepo: any

  let ankiRepo: any

  beforeAll(async () => {
    h = await setupEphemeralDb()
    ;({ vocabRepo } = await h.load('../../server/db/repositories/vocab'))
    ;({ ankiRepo } = await h.load('../../server/db/repositories/anki'))
  })
  afterAll(async () => {
    await h.cleanup()
  })

  it('acervo: "casa" acha a palavra "Casa" e "ÁGUA" acha "água" (palavra ou tradução)', async () => {
    const { db } = await h.load<{ db: any }>('../../server/db/db')
    const { vocabCards } = await h.load<{ vocabCards: any }>('../../server/db/schema')
    const t = 1_700_000_000_000
    for (const [id, word, back] of [
      ['v1', 'Casa', 'house'],
      ['v2', 'water', 'ÁGUA'],
      ['v3', 'garden', 'jardim'],
    ]) {
      await db.insert(vocabCards).values({ id, userId: U, word, back, srcLang: 'en', createdAt: t, updatedAt: t })
    }
    const a = await vocabRepo.listarPagina(U, { busca: 'casa' })
    expect(a.itens.map((c: { word: string }) => c.word)).toEqual(['Casa'])
    const b = await vocabRepo.listarPagina(U, { busca: 'água' })
    expect(b.itens.map((c: { word: string }) => c.word)).toEqual(['water'])
    const c = await vocabRepo.listarPagina(U, { busca: 'HOUSE' })
    expect(c.total).toBe(1)
  })

  it('Anki: "CHURN" acha a nota "Churn" e "livro" acha "Livro-Razão"', async () => {
    const deck = await ankiRepo.criarOuAcharDeck(U, { nome: 'Busca', arquivoOrigem: 'busca.apkg' })
    const { db } = await h.load<{ db: any }>('../../server/db/db')
    const { ankiNotes } = await h.load<{ ankiNotes: any }>('../../server/db/schema')
    const t = 1_700_000_000_000
    for (const [guid, frente, verso] of [
      ['b1', 'Churn', 'evasão'],
      ['b2', 'ledger', 'Livro-Razão'],
    ]) {
      await db
        .insert(ankiNotes)
        .values({ id: `n-${guid}`, userId: U, deckId: deck.id, guid, frente, verso, createdAt: t, updatedAt: t })
    }
    const a = await ankiRepo.listarNotas(U, deck.id, { busca: 'CHURN' })
    expect(a.itens.map((n: { frente: string }) => n.frente)).toEqual(['Churn'])
    const b = await ankiRepo.listarNotas(U, deck.id, { busca: 'livro' })
    expect(b.itens.map((n: { frente: string }) => n.frente)).toEqual(['ledger'])
  })
})
