/**
 * O CRÉDITO COMPRADO GANHA DESTINO (mudança credito-com-destino).
 *
 * O que este arquivo prende, e por que ele não existia: `creditsRepo.debitar` estava escrito,
 * testado e NUNCA CHAMADO por rota nenhuma. Dava para comprar Créditos e não havia onde gastá-los
 * — quem pagasse R$ 49,90 pelos 700 recebia um número que aparecia no cabeçalho e não comprava
 * nada. E o Passe anunciava "1.134 Créditos ao longo da trilha" com a fileira premium renderizada
 * como `role="img"`, sem handler: ninguém creditava.
 *
 * A régua do gasto é a mesma das Seeds, e com mais razão: esta moeda custou dinheiro.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'
import { CATALOGO_DA_LOJA } from '../../src/core/loja'
import { totalPremiumEmCreditos } from '../../src/core/passe'

let h: EphemeralDb
let billingRouter: any
let creditsRepo: any

function handler(caminho: string): (req: any, res: any) => Promise<void> {
  const camada = billingRouter.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.post)
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}
const req = (body: unknown, u: string) => ({ userId: asUserId(u), body, requestId: 'req-cc', path: '/x' })

const PREMIUM = CATALOGO_DA_LOJA.find((i) => i.precoCreditos !== undefined)!

/** Dá saldo pelo caminho legítimo: uma compra confirmada pelo webhook. */
async function darCreditos(u: string, quanto: number, id: string): Promise<void> {
  const uid = asUserId(u)
  await creditsRepo.registrarCompra(uid, { sku: 'c300', creditos: quanto, valorCentavos: 2490, providerPaymentId: id })
  await creditsRepo.confirmarPagamento(id)
}

const gastar = async (corpo: unknown, u: string) => {
  const r = mockRes()
  await handler('/gastar')(req(corpo, u), r)
  return r
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  ;({ billingRouter } = (await h.load('../../server/routes/billing')) as any)
  ;({ creditsRepo } = (await h.load('../../server/db/repositories/credits')) as any)
})
afterAll(async () => { await h.cleanup(); delete process.env.ASAAS_API_KEY })

describe('gastar Créditos', () => {
  it('o catálogo tem item vendido em Créditos — senão a moeda não teria destino', () => {
    expect(PREMIUM, 'nenhum item com precoCreditos').toBeTruthy()
    expect(PREMIUM.precoSeeds, 'item premium não pode ter as duas moedas').toBeUndefined()
  })

  it('com saldo, o gasto passa e debita o preço DO CATÁLOGO', async () => {
    await darCreditos('u-cc1', 500, 'pay-cc1')
    const r = await gastar({ spendId: 'cc-compra-001', amount: PREMIUM.precoCreditos, reason: `premium:${PREMIUM.id}` }, 'u-cc1')
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({ jaExistia: false, gasto: PREMIUM.precoCreditos })
    expect(r.body.saldo).toBe(500 - PREMIUM.precoCreditos!)
  })

  it('o reenvio é idempotente e não cobra de novo', async () => {
    const r = await gastar({ spendId: 'cc-compra-001', amount: PREMIUM.precoCreditos, reason: `premium:${PREMIUM.id}` }, 'u-cc1')
    expect(r.body.jaExistia).toBe(true)
    expect(r.body.saldo).toBe(500 - PREMIUM.precoCreditos!)
  })

  it('sem saldo, 402 dizendo quanto falta', async () => {
    const r = await gastar({ spendId: 'cc-sem-saldo1', amount: PREMIUM.precoCreditos, reason: `premium:${PREMIUM.id}` }, 'u-cc2')
    expect(r.statusCode).toBe(402)
    expect(r.body.falta).toBe(PREMIUM.precoCreditos)
  })

  it('preço abaixo do catálogo é recusado, e a resposta diz o certo', async () => {
    await darCreditos('u-cc3', 500, 'pay-cc3')
    const r = await gastar({ spendId: 'cc-barato-001', amount: 1, reason: `premium:${PREMIUM.id}` }, 'u-cc3')
    expect(r.statusCode).toBe(400)
    expect(r.body.preco).toBe(PREMIUM.precoCreditos)
  })

  it('motivo desconhecido e item que não é premium são recusados', async () => {
    await darCreditos('u-cc4', 500, 'pay-cc4')
    const deSeeds = CATALOGO_DA_LOJA.find((i) => i.precoSeeds !== undefined)!
    expect((await gastar({ spendId: 'cc-x0000001', amount: 150, reason: 'presente' }, 'u-cc4')).statusCode).toBe(400)
    expect((await gastar({ spendId: 'cc-x0000002', amount: 150, reason: `premium:${deSeeds.id}` }, 'u-cc4')).statusCode).toBe(400)
  })

  it('a posse do que se pagou vem do SERVIDOR, derivada do log', async () => {
    const itens = await creditsRepo.itensPremium(asUserId('u-cc1'))
    expect(itens).toContain(PREMIUM.id)
    expect(await creditsRepo.itensPremium(asUserId('u-cc2'))).toEqual([])
  })
})

describe('a trilha paga entrega o que promete', () => {
  it('SEM o passe, nada é creditado — a fileira continua vitrine honesta', async () => {
    const r = mockRes()
    await handler('/creditar-passe')(req({}, 'u-sem-passe'), r)
    expect(r.body).toMatchObject({ creditado: 0, temPasse: false })
    expect(await creditsRepo.saldo(asUserId('u-sem-passe'))).toBe(0)
  })

  it('COM o passe, as casas alcançadas creditam — e uma segunda chamada não credita de novo', async () => {
    const u = 'u-com-passe'
    const uid = asUserId(u)
    await creditsRepo.registrarCompra(uid, { sku: 'passe-t1', creditos: 0, valorCentavos: 1490, providerPaymentId: 'pay-passe-1' })
    await creditsRepo.confirmarPagamento('pay-passe-1')

    const r1 = mockRes()
    await handler('/creditar-passe')(req({}, u), r1)
    expect(r1.body.temPasse).toBe(true)
    // Nível 1 (conta nova) alcança a casa 1, que vale Créditos na curva.
    expect(r1.body.creditado).toBeGreaterThan(0)
    const saldo = await creditsRepo.saldo(uid)

    const r2 = mockRes()
    await handler('/creditar-passe')(req({}, u), r2)
    expect(r2.body.creditado, 'reabrir a tela não pode creditar de novo').toBe(0)
    expect(await creditsRepo.saldo(uid)).toBe(saldo)
  })

  it('a promessa da tela bate com a curva: o passe devolve mais do que custa', () => {
    // R$ 14,90 pelo passe; a trilha devolve isto em Créditos. Se um dia deixar de ser verdade,
    // o CTA "devolve mais do que custa" vira mentira — e é o teste que avisa.
    expect(totalPremiumEmCreditos()).toBeGreaterThan(1000)
  })
})

describe('as variantes douradas passam a existir', () => {
  it('cada marco de dezena tem o item que o passe promete pelo nome', () => {
    for (let d = 1; d <= 10; d++) {
      const casa = d * 10
      const item = CATALOGO_DA_LOJA.find((i) => i.exclusivoDoPasse === casa)
      expect(item, `nenhuma variante para a casa ${casa}`).toBeTruthy()
      expect(item!.precoCreditos, `variante da casa ${casa} sem preço avulso`).toBeGreaterThan(0)
    }
  })
})
