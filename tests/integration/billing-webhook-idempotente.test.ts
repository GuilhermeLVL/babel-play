/**
 * Idempotência do webhook de billing: o mesmo evento entregue duas vezes só é "novo" na primeira.
 * Guarda a troca de `rowsAffected` (libsql) por `linhasAfetadas` (Postgres) em `marcarSeNovo`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let billingEventsRepo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ billingEventsRepo } = await h.load('../../server/db/repositories/billingEvents'))
})
afterAll(async () => {
  await h.cleanup()
})

describe('billingEventsRepo.marcarSeNovo', () => {
  it('devolve true na primeira chamada e false na segunda com o mesmo evento', async () => {
    expect(await billingEventsRepo.marcarSeNovo('evt_1', 'asaas', 'PAYMENT_CONFIRMED', null, 'pay_1')).toBe(true)
    expect(await billingEventsRepo.marcarSeNovo('evt_1', 'asaas', 'PAYMENT_CONFIRMED', null, 'pay_1')).toBe(false)
  })

  it('eventos com ids diferentes são independentes', async () => {
    expect(await billingEventsRepo.marcarSeNovo('evt_2', 'asaas', 'PAYMENT_CONFIRMED', null, 'pay_2')).toBe(true)
  })
})
