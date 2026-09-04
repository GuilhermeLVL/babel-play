/**
 * O RAZÃO DOS CRÉDITOS — a moeda comprada com dinheiro (economia-legivel-e-moedas).
 *
 * O que estes testes protegem é dinheiro, não pixel:
 *  · saldo é DERIVADO (compras pagas − gastos), então reembolso é evento inverso e não UPDATE;
 *  · crédito só entra CONFIRMADO — pendente vale zero, senão quem abandona o checkout leva;
 *  · a reentrega do webhook (que o Asaas faz sempre que não recebe 200) não credita duas vezes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

const A = asUserId('user-A')
const B = asUserId('user-B')

let h: EphemeralDb
let repo: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ creditsRepo: repo } = await h.load('../../server/db/repositories/credits'))
})
afterAll(async () => { await h.cleanup() })

describe('compra de créditos', () => {
  it('compra pendente NÃO concede saldo — só a confirmação concede', async () => {
    await repo.registrarCompra(A, { sku: 'c300', creditos: 300, valorCentavos: 2490, providerPaymentId: 'pay_1' })
    expect(await repo.saldo(A)).toBe(0)

    const paga = await repo.confirmarPagamento('pay_1')
    expect(paga?.status).toBe('pago')
    expect(await repo.saldo(A)).toBe(300)
  })

  it('webhook reentregue não credita duas vezes', async () => {
    // O Asaas reenvia o mesmo evento até receber 200; o UPDATE filtra `pendente`, então a
    // segunda passada não tem o que promover.
    await repo.confirmarPagamento('pay_1')
    await repo.confirmarPagamento('pay_1')
    expect(await repo.saldo(A)).toBe(300)
  })

  it('pagamento que não é nosso devolve null — e o chamador não trata como sucesso', async () => {
    expect(await repo.confirmarPagamento('pay_de_outro_sistema')).toBeNull()
  })

  it('o saldo é isolado por usuário', async () => {
    await repo.registrarCompra(B, { sku: 'c100', creditos: 100, valorCentavos: 990, providerPaymentId: 'pay_2' })
    await repo.confirmarPagamento('pay_2')
    expect(await repo.saldo(A)).toBe(300)
    expect(await repo.saldo(B)).toBe(100)
  })
})

describe('gasto e estorno', () => {
  it('gastar debita, e o mesmo spendId não cobra de novo', async () => {
    const r1 = await repo.debitar(A, { spendId: 'kit-neon', amount: 180, reason: 'loja:kit-neon' })
    expect(r1.jaExistia).toBe(false)
    expect(await repo.saldo(A)).toBe(120)

    const r2 = await repo.debitar(A, { spendId: 'kit-neon', amount: 180, reason: 'loja:kit-neon' })
    expect(r2.jaExistia).toBe(true)
    expect(await repo.saldo(A)).toBe(120) // não virou -60
  })

  it('estorno é evento inverso: a compra deixa de conceder, o gasto permanece no razão', async () => {
    await repo.cancelarCompra('pay_1')
    // 300 comprados viraram 0; 180 gastos continuam gravados. O piso impede saldo negativo.
    expect(await repo.totalComprado(A)).toBe(0)
    expect(await repo.totalGasto(A)).toBe(180)
    expect(await repo.saldo(A)).toBe(0)
  })
})
