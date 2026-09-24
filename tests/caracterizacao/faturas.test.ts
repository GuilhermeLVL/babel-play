/**
 * CARACTERIZAÇÃO — `GET /api/billing/faturas` (aba "Sua assinatura"), por HTTP, no modo público.
 *
 * O Asaas é simulado no `fetch` global: as chamadas ao servidor de teste passam direto, as que vão
 * ao Asaas recebem a lista abaixo e ficam registradas — é assim que o teste prova QUAL assinatura
 * foi consultada. A rota não recebe parâmetro nenhum: o id da assinatura vem do nosso banco, pela
 * conta do token, então cada pessoa só enxerga as próprias faturas.
 *
 * O detalhe do mapeamento (status, meio, link de recibo só do Asaas) está em
 * `tests/integration/billing-faturas.test.ts`; aqui fica o contrato HTTP.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { type AppDeTeste, resposta, subirApp } from './_app'

describe('GET /api/billing/faturas (modo publico)', () => {
  let s: AppDeTeste
  const real = globalThis.fetch
  let urlsDoAsaas: string[] = []

  beforeAll(async () => {
    s = await subirApp({ modo: 'publico' })
    const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
    const { asUserId } = await s.load('../../server/lib/authContext')
    await subscriptionsRepo.upsert(asUserId('assinante-a'), {
      provider: 'asaas',
      providerCustomerId: 'cus_a',
      providerSubscriptionId: 'sub_DA_CONTA_A',
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: Date.now() + 20 * 86_400_000,
    })
    await subscriptionsRepo.upsert(asUserId('assinante-b'), {
      provider: 'asaas',
      providerCustomerId: 'cus_b',
      providerSubscriptionId: 'sub_DA_CONTA_B',
      plan: 'essencial',
      status: 'active',
      currentPeriodEnd: Date.now() + 20 * 86_400_000,
    })
  })

  function simularAsaas(resposta: () => Response) {
    urlsDoAsaas = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (entrada, init) => {
      const url = String(entrada instanceof Request ? entrada.url : entrada)
      if (url.startsWith(s.base)) return real(entrada, init)
      urlsDoAsaas.push(url)
      return resposta()
    })
  }
  const listaDoAsaas = () =>
    new Response(
      JSON.stringify({
        data: [
          {
            id: 'pay_1',
            status: 'RECEIVED',
            value: 29.9,
            billingType: 'PIX',
            dueDate: '2026-09-10',
            paymentDate: '2026-09-09',
            invoiceUrl: 'https://sandbox.asaas.com/i/pay_1',
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.ASAAS_API_KEY
  })
  afterAll(async () => {
    await s.encerrar()
  })

  it('sem token: 401', async () => {
    expect((await s.get('/api/billing/faturas')).status).toBe(401)
  })

  it('sem ASAAS_API_KEY no servidor: 501, sem lista inventada', async () => {
    const r = await s.get('/api/billing/faturas', await s.token('assinante-a'))
    expect(r.status).toBe(501)
    expect((await r.json()).error).toMatch(/ASAAS_API_KEY/)
  })

  it('conta sem assinatura: lista vazia, e o Asaas nem e consultado', async () => {
    process.env.ASAAS_API_KEY = 'chave-de-teste'
    simularAsaas(listaDoAsaas)
    const r = await s.get('/api/billing/faturas', await s.token('sem-assinatura'))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ faturas: [] })
    expect(urlsDoAsaas).toEqual([])
  })

  it('assinante: consulta so a assinatura DELE e devolve a forma da tela', async () => {
    process.env.ASAAS_API_KEY = 'chave-de-teste'
    simularAsaas(listaDoAsaas)
    const r = await s.get('/api/billing/faturas', await s.token('assinante-a'))
    expect(r.status).toBe(200)
    expect(urlsDoAsaas).toHaveLength(1)
    expect(urlsDoAsaas[0]).toContain('/subscriptions/sub_DA_CONTA_A/payments')
    expect(urlsDoAsaas[0]).not.toContain('sub_DA_CONTA_B')
    const corpo = await r.clone().json()
    expect(corpo.faturas[0]).toMatchObject({ id: 'pay_1', valor: 29.9, status: 'paga' })
    await expect(JSON.stringify(await resposta(r), null, 2)).toMatchFileSnapshot(
      '__snapshots__/get.billing.faturas.json',
    )
  })

  it('a query string nao escolhe a conta: outro assinante continua vendo so a propria', async () => {
    process.env.ASAAS_API_KEY = 'chave-de-teste'
    simularAsaas(listaDoAsaas)
    const r = await s.get(
      '/api/billing/faturas?assinatura=sub_DA_CONTA_A&userId=assinante-a',
      await s.token('assinante-b'),
    )
    expect(r.status).toBe(200)
    expect(urlsDoAsaas).toHaveLength(1)
    expect(urlsDoAsaas[0]).toContain('/subscriptions/sub_DA_CONTA_B/payments')
    expect(urlsDoAsaas[0]).not.toContain('sub_DA_CONTA_A')
  })

  it('Asaas fora do ar: 502, nunca uma lista vazia que pareca "sem faturas"', async () => {
    process.env.ASAAS_API_KEY = 'chave-de-teste'
    simularAsaas(() => new Response('{"errors":[]}', { status: 500 }))
    const r = await s.get('/api/billing/faturas', await s.token('assinante-a'))
    expect(r.status).toBe(502)
    expect((await r.json()).faturas).toBeUndefined()
  })
})
