/**
 * FATURAS (GET /api/billing/faturas) — a lista que a aba "Sua assinatura" mostra.
 *
 * É LEITURA, e só da PRÓPRIA conta. Os contratos presos:
 * 1. Sem assinatura, lista vazia — e nem se pergunta ao Asaas.
 * 2. Com assinatura, pergunta ao Asaas pelas cobranças da assinatura DESTE usuário (o id vem do
 *    nosso banco, nunca do cliente): a rota não aceita parâmetro que aponte para outra conta.
 * 3. O que volta é a forma da tela (data, valor, status, meio, recibo), e o link de recibo só
 *    passa se for do Asaas — um `javascript:` ou domínio estranho vira `null`.
 * 4. Sem chave do Asaas, 501; Asaas fora do ar, 502 — nunca uma lista inventada.
 * 5. Nada muda na assinatura: ler faturas não toca em plano, status nem período.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let billingRouter: any
let subs: any

function handler(): (req: any, res: any) => Promise<void> {
  const camada = billingRouter.stack.find((l: any) => l.route?.path === '/faturas' && l.route?.methods?.get)
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => {
    r.statusCode = c
    return r
  }
  r.json = (b: any) => {
    r.body = b
    return r
  }
  return r
}
const req = (userId: string) => ({ userId: asUserId(userId), requestId: 'req-teste', path: '/faturas' })

const respostaAsaas = (data: unknown[]) =>
  new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } })

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  ;({ billingRouter } = (await h.load('../../server/routes/billing')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  await subs.upsert(asUserId('u-fat-a'), {
    provider: 'asaas',
    providerCustomerId: 'cus_a',
    providerSubscriptionId: 'sub_A',
    plan: 'pro',
    status: 'active',
    currentPeriodEnd: 1_800_000_000_000,
  })
  await subs.upsert(asUserId('u-fat-b'), {
    provider: 'asaas',
    providerCustomerId: 'cus_b',
    providerSubscriptionId: 'sub_B',
    plan: 'essencial',
    status: 'past_due',
  })
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  delete process.env.ASAAS_API_KEY
  await h.cleanup()
})
afterEach(() => vi.restoreAllMocks())

describe('GET /api/billing/faturas', () => {
  it('sem assinatura: lista vazia, sem perguntar ao Asaas', async () => {
    const f = vi.spyOn(globalThis, 'fetch')
    const res = mockRes()
    await handler()(req('u-fat-sem'), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ faturas: [] })
    expect(f).not.toHaveBeenCalled()
  })

  it('com assinatura: lê as cobranças da assinatura DESTE usuário e devolve a forma da tela', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      respostaAsaas([
        {
          id: 'pay_2',
          status: 'RECEIVED',
          value: 19.9,
          billingType: 'PIX',
          dueDate: '2026-09-22',
          paymentDate: '2026-09-21',
          transactionReceiptUrl: 'https://sandbox.asaas.com/comprovantes/abc',
          invoiceUrl: 'https://sandbox.asaas.com/i/abc',
        },
        {
          id: 'pay_1',
          status: 'OVERDUE',
          value: 19.9,
          billingType: 'UNDEFINED',
          dueDate: '2026-08-22',
          invoiceUrl: 'https://www.asaas.com/i/def',
        },
        {
          id: 'pay_0',
          status: 'REFUNDED',
          value: 19.9,
          billingType: 'CREDIT_CARD',
          dueDate: '2026-07-22',
          transactionReceiptUrl: 'javascript:alert(1)',
          invoiceUrl: 'https://asaas.com.evil.example/i/x',
        },
        { id: 'pay_z', status: 'PENDING', value: 19.9, billingType: 'BOLETO', dueDate: '2026-10-22' },
      ]),
    )
    const res = mockRes()
    await handler()(req('u-fat-a'), res)
    expect(res.statusCode).toBe(200)
    const url = String(f.mock.calls[0][0])
    expect(url).toContain('/subscriptions/sub_A/payments')
    expect(url).not.toContain('sub_B')
    expect(res.body.faturas).toEqual([
      {
        id: 'pay_2',
        data: '2026-09-21',
        descricao: 'Premium · mensal',
        valor: 19.9,
        metodo: 'pix',
        status: 'paga',
        recibo: 'https://sandbox.asaas.com/comprovantes/abc',
        link: 'https://sandbox.asaas.com/i/abc',
      },
      {
        id: 'pay_1',
        data: '2026-08-22',
        descricao: 'Premium · mensal',
        valor: 19.9,
        metodo: null,
        status: 'falhou',
        recibo: null,
        link: 'https://www.asaas.com/i/def',
      },
      {
        id: 'pay_0',
        data: '2026-07-22',
        descricao: 'Premium · mensal',
        valor: 19.9,
        metodo: 'cartao',
        status: 'estornada',
        recibo: null,
        link: null,
      },
      {
        id: 'pay_z',
        data: '2026-10-22',
        descricao: 'Premium · mensal',
        valor: 19.9,
        metodo: 'boleto',
        status: 'pendente',
        recibo: null,
        link: null,
      },
    ])
  })

  it('outro usuário lê SÓ a própria assinatura', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respostaAsaas([]))
    const res = mockRes()
    await handler()(req('u-fat-b'), res)
    expect(res.statusCode).toBe(200)
    expect(f).toHaveBeenCalledTimes(1)
    const url = String(f.mock.calls[0][0])
    expect(url).toContain('/subscriptions/sub_B/payments')
    expect(url).not.toContain('sub_A')
  })

  it('sem chave do Asaas: 501, sem lista inventada', async () => {
    delete process.env.ASAAS_API_KEY
    const f = vi.spyOn(globalThis, 'fetch')
    const res = mockRes()
    await handler()(req('u-fat-a'), res)
    expect(res.statusCode).toBe(501)
    expect(res.body.faturas).toBeUndefined()
    expect(f).not.toHaveBeenCalled()
    process.env.ASAAS_API_KEY = 'chave-de-teste'
  })

  it('Asaas fora do ar: 502, sem lista inventada', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('pane', { status: 503 }))
    const res = mockRes()
    await handler()(req('u-fat-a'), res)
    expect(res.statusCode).toBe(502)
    expect(res.body.faturas).toBeUndefined()
  })

  it('ler faturas não muda a assinatura', async () => {
    const antes = await subs.getActive(asUserId('u-fat-a'))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      respostaAsaas([{ id: 'p', status: 'RECEIVED', value: 1, dueDate: '2026-01-01' }]),
    )
    await handler()(req('u-fat-a'), mockRes())
    const depois = await subs.getActive(asUserId('u-fat-a'))
    expect(depois).toEqual(antes)
  })
})
