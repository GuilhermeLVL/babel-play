/**
 * SaaS — RESERVA ATÔMICA de chamada gerenciada (correção do P0-1 da auditoria).
 *
 * O par `get()` + `increment()` era um read-modify-write: sob concorrência, N requisições
 * liam o mesmo `count` antes de qualquer incremento pousar e TODAS passavam. Medido:
 * 20 chamadas aceitas contra um teto de 5 (docs/audit/04-scalability.md §3).
 *
 * `reserve()` decide e grava numa ÚNICA instrução, então o teto vale mesmo com N
 * requisições simultâneas.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let repo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ usageCountersRepo: repo } = await h.load('../../server/db/repositories/usageCounters'))
})
afterAll(async () => { await h.cleanup() })

describe('usageCountersRepo.reserve', () => {
  it('sem linha e teto ≥ 1 → reserva e cria a linha em 1', async () => {
    const u = asUserId('r-novo')
    expect(await repo.reserve(u, 'managed_calls', '2026-08', 5)).toBe(true)
    expect(await repo.get(u, 'managed_calls', '2026-08')).toBe(1)
  })

  it('abaixo do teto → reserva e soma', async () => {
    const u = asUserId('r-abaixo')
    await repo.reserve(u, 'managed_calls', '2026-08', 3)
    expect(await repo.reserve(u, 'managed_calls', '2026-08', 3)).toBe(true)
    expect(await repo.get(u, 'managed_calls', '2026-08')).toBe(2)
  })

  it('no teto → NÃO reserva e NÃO incrementa', async () => {
    const u = asUserId('r-teto')
    await repo.reserve(u, 'managed_calls', '2026-08', 2)
    await repo.reserve(u, 'managed_calls', '2026-08', 2)
    expect(await repo.get(u, 'managed_calls', '2026-08')).toBe(2)

    expect(await repo.reserve(u, 'managed_calls', '2026-08', 2)).toBe(false)
    expect(await repo.get(u, 'managed_calls', '2026-08')).toBe(2) // não passou de 2
  })

  it('teto 0 → nunca reserva e não cria linha', async () => {
    const u = asUserId('r-zero')
    expect(await repo.reserve(u, 'managed_calls', '2026-08', 0)).toBe(false)
    expect(await repo.get(u, 'managed_calls', '2026-08')).toBe(0)
  })

  /** O teste que prova o P0-1: é o cenário exato medido na auditoria. */
  it('20 reservas SIMULTÂNEAS contra teto 5 → exatamente 5 passam', async () => {
    const u = asUserId('r-corrida')
    const CAP = 5
    const resultados = await Promise.all(
      Array.from({ length: 20 }, () => repo.reserve(u, 'managed_calls', '2026-08', CAP)),
    )
    expect(resultados.filter(Boolean)).toHaveLength(CAP)
    expect(await repo.get(u, 'managed_calls', '2026-08')).toBe(CAP)
  })

  it('janela e usuário isolam a reserva', async () => {
    const u = asUserId('r-iso')
    await repo.reserve(u, 'managed_calls', '2026-08', 1)
    expect(await repo.reserve(u, 'managed_calls', '2026-09', 1)).toBe(true)  // outra janela
    expect(await repo.reserve(asUserId('r-iso2'), 'managed_calls', '2026-08', 1)).toBe(true)
  })
})

describe('usageCountersRepo.refund', () => {
  it('estorna uma reserva que não virou chamada', async () => {
    const u = asUserId('r-estorno')
    await repo.reserve(u, 'managed_calls', '2026-08', 5)
    await repo.reserve(u, 'managed_calls', '2026-08', 5)
    await repo.refund(u, 'managed_calls', '2026-08')
    expect(await repo.get(u, 'managed_calls', '2026-08')).toBe(1)
  })

  it('nunca deixa o contador negativo', async () => {
    const u = asUserId('r-piso')
    await repo.refund(u, 'managed_calls', '2026-08')
    await repo.refund(u, 'managed_calls', '2026-08')
    expect(await repo.get(u, 'managed_calls', '2026-08')).toBe(0)
  })

  it('libera vaga de volta: cheio → estorno → cabe mais uma', async () => {
    const u = asUserId('r-vaga')
    await repo.reserve(u, 'managed_calls', '2026-08', 1)
    expect(await repo.reserve(u, 'managed_calls', '2026-08', 1)).toBe(false)
    await repo.refund(u, 'managed_calls', '2026-08')
    expect(await repo.reserve(u, 'managed_calls', '2026-08', 1)).toBe(true)
  })
})
