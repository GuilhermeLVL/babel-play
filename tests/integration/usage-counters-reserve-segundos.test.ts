/**
 * RESERVA DE VÁRIAS UNIDADES — o que torna possível um teto em SEGUNDOS de áudio.
 *
 * O teto anterior contava chamadas, e chamada não é a unidade que o provedor cobra: a Groq fatura
 * STT por hora de áudio. Uma chamada de 1 segundo e uma de 25 MB consumiam o mesmo teto, então
 * quem deixasse a captura aberta o dia inteiro gastava dinheiro real sem estourar contador nenhum.
 *
 * O risco desta mudança é o teto ESTOURAR: com `by > 1`, a condição antiga (`count < cap`) deixaria
 * passar 99 + 60 contra um teto de 100. É isso que os testes abaixo prendem.
 */
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb,setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let repo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ usageCountersRepo: repo } = await h.load('../../server/db/repositories/usageCounters'))
})
afterAll(async () => { await h.cleanup() })

const M = 'stt_seconds'
const W = '2026-08'

describe('reserva de N unidades', () => {
  it('reserva o bloco inteiro de uma vez', async () => {
    const u = asUserId('s-bloco')
    expect(await repo.reserve(u, M, W, 100, 10)).toBe(true)
    expect(await repo.get(u, M, W)).toBe(10)
  })

  it('A ARMADILHA: um bloco que não cabe NÃO estoura o teto', async () => {
    const u = asUserId('s-estouro')
    await repo.reserve(u, M, W, 100, 99) // 99 de 100 usados
    // Com a condição ingênua `count < cap`, 99 < 100 seria verdade e o total iria a 159.
    expect(await repo.reserve(u, M, W, 100, 60)).toBe(false)
    expect(await repo.get(u, M, W)).toBe(99) // intacto
  })

  it('o bloco que cabe EXATAMENTE é aceito', async () => {
    const u = asUserId('s-exato')
    await repo.reserve(u, M, W, 100, 90)
    expect(await repo.reserve(u, M, W, 100, 10)).toBe(true)
    expect(await repo.get(u, M, W)).toBe(100)
    // E o próximo, nem que seja de 1, não passa.
    expect(await repo.reserve(u, M, W, 100, 1)).toBe(false)
  })

  it('NÃO reserva parcial: ou cabe inteiro, ou não cabe', async () => {
    // Meia transcrição não serve para ninguém, e cobrar por ela seria pior que recusar.
    const u = asUserId('s-parcial')
    await repo.reserve(u, M, W, 50, 45)
    expect(await repo.reserve(u, M, W, 50, 20)).toBe(false)
    expect(await repo.get(u, M, W)).toBe(45)
  })

  it('bloco maior que o teto inteiro é recusado sem criar linha', async () => {
    const u = asUserId('s-gigante')
    expect(await repo.reserve(u, M, W, 30, 500)).toBe(false)
    expect(await repo.get(u, M, W)).toBe(0)
  })

  it('teto infinito (selfhost) passa sem contabilizar', async () => {
    const u = asUserId('s-infinito')
    expect(await repo.reserve(u, M, W, Infinity, 3_600)).toBe(true)
    expect(await repo.get(u, M, W)).toBe(0)
  })

  it('o estorno devolve o MESMO tamanho do bloco, com piso em zero', async () => {
    const u = asUserId('s-estorno')
    await repo.reserve(u, M, W, 100, 30)
    await repo.refund(u, M, W, 30)
    expect(await repo.get(u, M, W)).toBe(0)
    // Estorno sem reserva correspondente não pode virar crédito.
    await repo.refund(u, M, W, 30)
    expect(await repo.get(u, M, W)).toBe(0)
  })

  it('sem `by`, continua sendo a reserva de 1 de sempre', async () => {
    const u = asUserId('s-compat')
    expect(await repo.reserve(u, 'managed_calls', W, 2)).toBe(true)
    expect(await repo.get(u, 'managed_calls', W)).toBe(1)
  })
})
