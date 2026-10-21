/**
 * LIMPEZA DIÁRIA × ERRO TRANSITÓRIO DO POSTGRES. Deadlock (40P01) ou falha de serialização (40001)
 * num usuário repete aquele usuário UMA vez; se insistir, ele fica para amanhã e a passada segue.
 * Qualquer outro erro interrompe a passada, como antes.
 *
 * A falha é injetada em `agregadosRepo.fusoGravado`, a primeira coisa que a limpeza de um usuário faz.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const DIA = 86_400_000
const AGORA = 1_800_000_000_000

let h: EphemeralDb
let db: any
let sql: any
let agregadosRepo: any
let limparBanco: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ db } = await h.load('../../server/db/db'))
  ;({ sql } = await h.load('drizzle-orm'))
  ;({ agregadosRepo } = await h.load('../../server/db/repositories/agregados'))
  ;({ limparBanco } = await h.load('../../server/lib/limpezaDiaria'))
})

afterAll(async () => {
  vi.restoreAllMocks()
  await h.cleanup()
})

/** Um cartão apagado há 40 dias: a limpeza tem o que tirar deste usuário. */
async function cartaoVelho(userId: string, id: string) {
  const t = AGORA - 40 * DIA
  await db.execute(sql`INSERT INTO vocab_cards (id, created_at, updated_at, user_id, deleted_at, word)
    VALUES (${id}, ${t}, ${t}, ${userId}, ${t}, ${'palavra'})`)
}

const erroPg = (code: string) => Object.assign(new Error('Failed query: …'), { cause: { code } })

describe('limpeza diária com erro transitório', () => {
  it('deadlock uma vez: o usuário é repetido e limpo', async () => {
    await cartaoVelho('limp-t1', 'limp-t1-card')
    const original = agregadosRepo.fusoGravado.bind(agregadosRepo)
    const spy = vi.spyOn(agregadosRepo, 'fusoGravado')
    spy.mockRejectedValueOnce(erroPg('40P01')).mockImplementation(original)
    const r = await limparBanco({ agora: AGORA, dias: 30 })
    spy.mockRestore()
    expect(r.cartoes).toBe(1)
    expect(r.usuarios).toBe(1)
  })

  it('falha de serialização duas vezes: o usuário fica para amanhã e a passada segue com os outros', async () => {
    await cartaoVelho('limp-t2', 'limp-t2-card')
    await cartaoVelho('limp-t3', 'limp-t3-card')
    const original = agregadosRepo.fusoGravado.bind(agregadosRepo)
    const spy = vi
      .spyOn(agregadosRepo, 'fusoGravado')
      .mockImplementation((u: unknown) => (u === 'limp-t2' ? Promise.reject(erroPg('40001')) : original(u)))
    const r = await limparBanco({ agora: AGORA, dias: 30 })
    spy.mockRestore()
    expect(r.cartoes).toBe(1) // só o de limp-t3
    const [{ n }] = (await db.execute(sql`SELECT count(*)::int AS n FROM vocab_cards WHERE id = 'limp-t2-card'`)).rows
    expect(n).toBe(1)
  })

  it('erro que não é transitório interrompe a passada', async () => {
    const spy = vi.spyOn(agregadosRepo, 'fusoGravado').mockRejectedValue(erroPg('23505'))
    await expect(limparBanco({ agora: AGORA, dias: 30 })).rejects.toThrow()
    spy.mockRestore()
  })
})
