/**
 * PAGINAÇÃO POR CURSOR NA ORDEM DECRESCENTE (`vocabRepo.listarPagina`, ramo `<` / `IS NOT DISTINCT
 * FROM`). Página pequena, empates na coluna que ordena e valores nulos: percorrer todas as páginas
 * tem de devolver cada cartão UMA vez, na mesma ordem da consulta sem página.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let vocabRepo: any
let db: any
let sql: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ vocabRepo } = await h.load('../../server/db/repositories/vocab'))
  ;({ db } = await h.load('../../server/db/db'))
  ;({ sql } = await h.load('drizzle-orm'))
})

afterAll(async () => {
  await h.cleanup()
})

async function todasAsPaginas(userId: string, ordem: string, limite: number): Promise<string[]> {
  const ids: string[] = []
  let cursor = null
  for (let i = 0; i < 50; i++) {
    const p: any = await vocabRepo.listarPagina(userId, { ordem, limite, cursor })
    ids.push(...p.itens.map((c: { id: string }) => c.id))
    if (!p.proximoCursor) return ids
    cursor = p.proximoCursor
  }
  throw new Error('paginação não terminou')
}

describe('listarPagina: cursor na ordem decrescente', () => {
  it('frequentes (empates): cada cartão aparece uma vez, na ordem da consulta inteira', async () => {
    const u = asUserId('pag-desc-freq')
    const palavras = ['apple', 'arrow', 'anchor', 'bread', 'bridge', 'cloud', 'candle', 'castle', 'copper']
    const { cards } = await vocabRepo.bulkAdd(
      u,
      palavras.map((word) => ({ word, srcLang: 'en', back: `sentido de ${word}` })),
    )
    // Ocorrências com empates: a* = 3, b* = 2, c* = 1.
    for (const c of cards) {
      const n = c.word.startsWith('a') ? 3 : c.word.startsWith('b') ? 2 : 1
      await db.execute(sql`UPDATE vocab_cards SET occurrences = ${n} WHERE id = ${c.id}`)
    }
    const inteira = (await vocabRepo.listarPagina(u, { ordem: 'frequentes', limite: 500 })).itens.map((c: any) => c.id)
    const paginada = await todasAsPaginas(u, 'frequentes', 2)
    expect(paginada).toEqual(inteira)
    expect(new Set(paginada).size).toBe(palavras.length)
  })

  it('dificuldade (empates e nulos): nenhum cartão some nem repete entre as páginas', async () => {
    const u = asUserId('pag-desc-dif')
    const palavras = ['desk', 'door', 'dream', 'drum', 'dust', 'dawn', 'duck']
    const { cards } = await vocabRepo.bulkAdd(
      u,
      palavras.map((word) => ({ word, srcLang: 'en', back: `sentido de ${word}` })),
    )
    const score: Record<string, number | null> = {
      desk: 0.9,
      door: 0.5,
      dream: 0.5,
      drum: 0.1,
      dust: null,
      dawn: null,
      duck: 0.5,
    }
    for (const c of cards) {
      await db.execute(sql`UPDATE vocab_cards SET difficulty_score = ${score[c.word]} WHERE id = ${c.id}`)
    }
    const inteira = (await vocabRepo.listarPagina(u, { ordem: 'dificuldade', limite: 500 })).itens.map((c: any) => c.id)
    const paginada = await todasAsPaginas(u, 'dificuldade', 2)
    expect(paginada).toEqual(inteira)
    expect(new Set(paginada).size).toBe(palavras.length)
  })
})
