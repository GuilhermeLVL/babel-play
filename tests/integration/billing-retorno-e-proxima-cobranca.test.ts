/**
 * A VOLTA DO ASAAS E A PRÓXIMA COBRANÇA (funil de venda, 2026-09-29).
 *
 * 1. `criarAssinatura` pede ao Asaas para devolver o pagador a `/plano/assinado` (`callback`) SÓ
 *    quando o endereço público do app é https de verdade: o Asaas recusa localhost e domínio que
 *    não esteja cadastrado, e uma assinatura recusada é venda perdida.
 * 2. `GET /api/billing/status` devolve `proximaCobranca` (o `nextDueDate` do Asaas) para a
 *    assinatura ativa — com cache curto por assinatura e, se o Asaas falhar, o status sai igual,
 *    sem o campo. "Acesso até" (`valeAte`, com a graça) continua separado.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

describe('criarAssinatura — callback de volta ao app', () => {
  let asaas: typeof import('../../server/lib/asaas')
  beforeAll(async () => {
    process.env.ASAAS_API_KEY = 'chave-de-teste'
    asaas = await import('../../server/lib/asaas')
  })
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.APP_URL
  })
  afterAll(() => {
    delete process.env.ASAAS_API_KEY
  })

  async function corpoEnviado(): Promise<any> {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ id: 'sub_1' }))
    await asaas.criarAssinatura(asUserId('u-cb'), 'cus_1', 19.9, 'Babel Play Pro')
    return JSON.parse(String(f.mock.calls[0][1]?.body))
  }

  it('APP_URL https: manda o callback para /plano/assinado com autoRedirect', async () => {
    process.env.APP_URL = 'https://babel.exemplo.com.br/'
    const corpo = await corpoEnviado()
    expect(corpo.callback).toEqual({ successUrl: 'https://babel.exemplo.com.br/plano/assinado', autoRedirect: true })
    expect(corpo.billingType).toBe('UNDEFINED')
  })

  it.each([undefined, 'http://babel.exemplo.com.br', 'https://localhost:5173', 'http://127.0.0.1:3000', 'lixo'])(
    'APP_URL %s: não manda callback',
    async (url) => {
      if (url !== undefined) process.env.APP_URL = url
      const corpo = await corpoEnviado()
      expect(corpo.callback).toBeUndefined()
    },
  )

  it('Asaas recusa o callback (400): cria de novo sem ele, e a venda não se perde', async () => {
    process.env.APP_URL = 'https://babel.exemplo.com.br'
    const f = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ errors: [{ description: 'domínio não cadastrado' }] }, 400))
      .mockResolvedValueOnce(json({ id: 'sub_2' }))
    const a = await asaas.criarAssinatura(asUserId('u-cb'), 'cus_1', 19.9, 'Babel Play Pro')
    expect(a.id).toBe('sub_2')
    expect(f).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(f.mock.calls[0][1]?.body)).callback).toBeDefined()
    expect(JSON.parse(String(f.mock.calls[1][1]?.body)).callback).toBeUndefined()
  })
})

describe('GET /api/billing/status — proximaCobranca', () => {
  let h: EphemeralDb
  let billingRouter: any
  let subs: any

  function handler(): (req: any, res: any) => Promise<void> {
    const camada = billingRouter.stack.find((l: any) => l.route?.path === '/status' && l.route?.methods?.get)
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
  const req = (userId: string) => ({ userId: asUserId(userId), requestId: 'req-teste', path: '/status' })
  async function status(userId: string) {
    const res = mockRes()
    await handler()(req(userId), res)
    return res
  }
  const assinante = (id: string, sub: string, extra: Record<string, unknown> = {}) =>
    subs.upsert(asUserId(id), {
      provider: 'asaas',
      providerCustomerId: 'cus_' + id,
      providerSubscriptionId: sub,
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: 1_800_000_000_000,
      ...extra,
    })

  beforeAll(async () => {
    h = await setupEphemeralDb()
    process.env.AUTH_REQUIRED = '1'
    process.env.ASAAS_API_KEY = 'chave-de-teste'
    ;({ billingRouter } = (await h.load('../../server/routes/billing')) as any)
    ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
    await assinante('u-st-a', 'sub_st_A')
    await assinante('u-st-b', 'sub_st_B')
    await assinante('u-st-c', 'sub_st_C', { status: 'canceled' })
    await assinante('u-st-d', 'sub_st_D')
  })
  afterAll(async () => {
    delete process.env.AUTH_REQUIRED
    delete process.env.ASAAS_API_KEY
    await h.cleanup()
  })
  afterEach(() => vi.restoreAllMocks())

  it('assinatura ativa: devolve o nextDueDate do Asaas, sem mexer no valeAte', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ id: 'sub_st_A', nextDueDate: '2026-10-30' }))
    const res = await status('u-st-a')
    expect(res.statusCode).toBe(200)
    expect(String(f.mock.calls[0][0])).toContain('/subscriptions/sub_st_A')
    expect(res.body.proximaCobranca).toBe('2026-10-30')
    expect(res.body.assinatura.valeAte).toBe(1_800_000_000_000)
  })

  it('pergunta ao Asaas no máximo uma vez a cada 10 min por assinatura', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ id: 'sub_st_D', nextDueDate: '2026-11-02' }))
    expect((await status('u-st-d')).body.proximaCobranca).toBe('2026-11-02')
    expect((await status('u-st-d')).body.proximaCobranca).toBe('2026-11-02')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('Asaas fora do ar: o status sai igual, sem o campo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('pane', { status: 503 }))
    const res = await status('u-st-b')
    expect(res.statusCode).toBe(200)
    expect(res.body.assinatura.status).toBe('active')
    expect(res.body).not.toHaveProperty('proximaCobranca')
  })

  it('data fora do formato não passa', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ id: 'x', nextDueDate: '<b>amanhã</b>' }))
    await assinante('u-st-e', 'sub_st_E')
    expect((await status('u-st-e')).body).not.toHaveProperty('proximaCobranca')
  })

  it('assinatura cancelada, ou sem assinatura: nem pergunta ao Asaas', async () => {
    const f = vi.spyOn(globalThis, 'fetch')
    expect((await status('u-st-c')).body).not.toHaveProperty('proximaCobranca')
    expect((await status('u-st-nada')).body).toEqual({ configurado: true, assinatura: null })
    expect(f).not.toHaveBeenCalled()
  })
})
