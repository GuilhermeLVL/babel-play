/**
 * CANCELAR CUMPRE O QUE A TELA PROMETE (Fase 3 do plano de lançamento, CDC art. 49 e Decretos
 * 7.962/2013 e 11.034/2022).
 *
 * Os contratos presos aqui:
 * 1. Cancelar depois dos 7 dias PARA A RENOVAÇÃO e mantém o acesso até o fim do período pago — a
 *    data vem do Asaas (`nextDueDate` da assinatura), não de um palpite.
 * 2. Cancelar com o PRIMEIRO pagamento confirmado há 7 dias ou menos é ARREPENDIMENTO: cancela,
 *    estorna o valor integral no Asaas, revoga o acesso na hora e deixa rastro em `billing_events`.
 * 3. Se o Asaas recusar o estorno (ex.: saldo insuficiente → 400), o pedido NÃO some: vira
 *    `nao-aplicado` na fila do admin e a resposta diz que o reembolso será manual.
 * 4. Repetir o cancelamento não estorna duas vezes (idempotência pelo id do pagamento).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let billingRouter: any
let subs: any
let eventos: any
let ent: any

const DIA = 86_400_000
const dataIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function handler(): (req: any, res: any) => Promise<void> {
  const camada = billingRouter.stack.find((l: any) => l.route?.path === '/cancelar' && l.route?.methods?.post)
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
const req = (userId: string) => ({ userId: asUserId(userId), requestId: 'req-teste', path: '/cancelar', body: {} })
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

interface Cenario {
  pagamentos: Array<{ id: string; status: string; value: number; paymentDate?: string; confirmedDate?: string }>
  nextDueDate?: string
  estorno?: 'ok' | 'saldo-insuficiente'
}

/** Um Asaas de mentira: responde por URL e registra o que foi pedido. */
function asaasSimulado(c: Cenario) {
  const chamadas: Array<{ metodo: string; url: string }> = []
  const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input)
    const metodo = String(init?.method ?? 'GET')
    chamadas.push({ metodo, url })
    if (metodo === 'GET' && /\/subscriptions\/[^/]+\/payments/.test(url)) return json({ data: c.pagamentos })
    if (metodo === 'GET' && /\/subscriptions\/[^/?]+$/.test(url)) return json({ id: 'sub', nextDueDate: c.nextDueDate })
    if (metodo === 'DELETE' && /\/subscriptions\//.test(url)) return json({ deleted: true })
    if (metodo === 'POST' && /\/payments\/[^/]+\/refund$/.test(url)) {
      if (c.estorno === 'saldo-insuficiente')
        return json({ errors: [{ code: 'invalid_action', description: 'Saldo insuficiente' }] }, 400)
      return json({ id: 'pay', status: 'REFUNDED' })
    }
    return json({ erro: 'rota não simulada' }, 404)
  })
  return { f, chamadas }
}

async function assinante(userId: string, subId: string) {
  await subs.upsert(asUserId(userId), {
    provider: 'asaas',
    providerCustomerId: `cus_${userId}`,
    providerSubscriptionId: subId,
    plan: 'pro',
    status: 'active',
    currentPeriodEnd: Date.now() + 30 * DIA,
  })
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  ;({ billingRouter } = (await h.load('../../server/routes/billing')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ billingEventsRepo: eventos } = (await h.load('../../server/db/repositories/billingEvents')) as any)
  ent = await h.load('../../server/lib/entitlements')
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  delete process.env.ASAAS_API_KEY
  await h.cleanup()
})
afterEach(() => vi.restoreAllMocks())

describe('POST /api/billing/cancelar — depois dos 7 dias', () => {
  it('para a renovação e mantém o acesso até o fim do período que o Asaas informa', async () => {
    await assinante('u-cx-velho', 'sub_velho')
    const fim = Date.now() + 12 * DIA
    const { chamadas } = asaasSimulado({
      pagamentos: [{ id: 'pay_v1', status: 'RECEIVED', value: 39.9, paymentDate: dataIso(Date.now() - 20 * DIA) }],
      nextDueDate: dataIso(fim),
    })
    const res = mockRes()
    await handler()(req('u-cx-velho'), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.arrependimento).toBeNull()
    expect(chamadas.some((c) => c.metodo === 'DELETE' && c.url.includes('/subscriptions/sub_velho'))).toBe(true)
    expect(
      chamadas.some((c) => c.url.includes('/refund')),
      'fora dos 7 dias não estorna',
    ).toBe(false)

    const sub = await subs.getActive(asUserId('u-cx-velho'))
    expect(sub.status).toBe('canceled')
    // O fim do período é o do Asaas (o dia do próximo vencimento), e a resposta devolve o mesmo.
    // (vale até o fim daquele dia em Brasília — por isso a data é lida no fuso -03:00)
    expect(dataIso(sub.currentPeriodEnd - 3 * 3_600_000)).toBe(dataIso(fim))
    expect(res.body.valeAte).toBe(sub.currentPeriodEnd)
    // E o acesso CONTINUA: cancelado com período pago no futuro ainda concede o plano.
    expect(await ent.getPlanForUser(asUserId('u-cx-velho'))).toBe('pro')
  })
})

describe('POST /api/billing/cancelar — arrependimento em até 7 dias (CDC art. 49)', () => {
  it('cancela, estorna o pagamento inteiro, revoga o acesso na hora e registra', async () => {
    await assinante('u-cx-novo', 'sub_novo')
    const { chamadas } = asaasSimulado({
      pagamentos: [{ id: 'pay_n1', status: 'CONFIRMED', value: 39.9, confirmedDate: dataIso(Date.now() - 3 * DIA) }],
      nextDueDate: dataIso(Date.now() + 27 * DIA),
    })
    const res = mockRes()
    await handler()(req('u-cx-novo'), res)

    expect(res.statusCode).toBe(200)
    expect(chamadas.some((c) => c.metodo === 'DELETE' && c.url.includes('/subscriptions/sub_novo'))).toBe(true)
    expect(chamadas.some((c) => c.metodo === 'POST' && c.url.endsWith('/payments/pay_n1/refund'))).toBe(true)
    expect(res.body.arrependimento).toMatchObject({ estornado: true, valor: 39.9 })
    expect(typeof res.body.arrependimento.protocolo).toBe('string')
    expect(res.body.valeAte).toBeNull()

    // Reembolsado = sem período pago: o plano cai para free AGORA.
    expect(await ent.getPlanForUser(asUserId('u-cx-novo'))).toBe('free')
    // E o pedido fica registrado como aplicado, fora da fila do admin.
    const linha = await eventos.ler('arrependimento:pay_n1')
    expect(linha).toMatchObject({ estado: 'aplicado', userId: 'u-cx-novo', providerRef: 'pay_n1' })
  })

  it('repetir o cancelamento não estorna duas vezes', async () => {
    const { chamadas } = asaasSimulado({
      pagamentos: [{ id: 'pay_n1', status: 'CONFIRMED', value: 39.9, confirmedDate: dataIso(Date.now() - 3 * DIA) }],
    })
    const res = mockRes()
    await handler()(req('u-cx-novo'), res)
    expect(res.statusCode).toBe(200)
    expect(chamadas.some((c) => c.url.includes('/refund'))).toBe(false)
    expect(res.body.arrependimento).toMatchObject({ estornado: true })
  })

  it('no 7º dia ainda vale; no 9º, não', async () => {
    await assinante('u-cx-d7', 'sub_d7')
    const a = asaasSimulado({
      pagamentos: [{ id: 'pay_d7', status: 'RECEIVED', value: 19.9, paymentDate: dataIso(Date.now() - 7 * DIA) }],
    })
    const r7 = mockRes()
    await handler()(req('u-cx-d7'), r7)
    expect(a.chamadas.some((c) => c.url.endsWith('/payments/pay_d7/refund'))).toBe(true)
    vi.restoreAllMocks()

    await assinante('u-cx-d9', 'sub_d9')
    const b = asaasSimulado({
      pagamentos: [{ id: 'pay_d9', status: 'RECEIVED', value: 19.9, paymentDate: dataIso(Date.now() - 9 * DIA) }],
      nextDueDate: dataIso(Date.now() + 21 * DIA),
    })
    const r9 = mockRes()
    await handler()(req('u-cx-d9'), r9)
    expect(b.chamadas.some((c) => c.url.includes('/refund'))).toBe(false)
    expect(r9.body.arrependimento).toBeNull()
  })

  it('o Asaas recusa o estorno: a assinatura cancela, o pedido vai para a fila do admin e a tela sabe', async () => {
    await assinante('u-cx-sem-saldo', 'sub_sem_saldo')
    asaasSimulado({
      pagamentos: [{ id: 'pay_s1', status: 'RECEIVED', value: 19.9, paymentDate: dataIso(Date.now() - 1 * DIA) }],
      estorno: 'saldo-insuficiente',
    })
    const res = mockRes()
    await handler()(req('u-cx-sem-saldo'), res)

    expect(res.statusCode).toBe(200)
    expect(res.body.arrependimento).toMatchObject({ estornado: false, valor: 19.9 })
    expect(res.body.arrependimento.prazoManualDias).toBeGreaterThan(0)
    expect(await ent.getPlanForUser(asUserId('u-cx-sem-saldo'))).toBe('free')

    const pendentes = await eventos.listarPendentes()
    const meu = pendentes.find((p: any) => p.id === 'arrependimento:pay_s1')
    expect(meu, 'o estorno que falhou precisa aparecer na fila do admin').toBeTruthy()
    expect(meu.motivo).toMatch(/estorno/i)
  })

  it('o admin reprocessa o estorno pendente e ele sai da fila', async () => {
    const { chamadas } = asaasSimulado({ pagamentos: [], estorno: 'ok' })
    const { aplicarEvento, eventoSchema } = (await h.load('../../server/lib/billingEventos')) as any
    const linha = await eventos.ler('arrependimento:pay_s1')
    const r = await aplicarEvento(eventoSchema.parse(JSON.parse(linha.payload)), 'req-admin', undefined, true)
    expect(r.estado).toBe('aplicado')
    expect(chamadas.some((c) => c.url.endsWith('/payments/pay_s1/refund'))).toBe(true)
  })

  it('o webhook não aceita o evento interno de estorno (só o admin o reaplica)', async () => {
    const { chamadas } = asaasSimulado({ pagamentos: [], estorno: 'ok' })
    const { aplicarEvento } = (await h.load('../../server/lib/billingEventos')) as any
    const r = await aplicarEvento(
      { id: 'evt_forjado', event: 'ESTORNO_ARREPENDIMENTO', payment: { id: 'pay_x', externalReference: 'u-x' } },
      'req-webhook',
      undefined,
    )
    expect(r.estado).toBe('ignorado')
    expect(chamadas).toHaveLength(0)
  })
})

describe('estorno de assinatura avisado pelo Asaas', () => {
  it('PAYMENT_REFUNDED de parcela revoga o período pago na hora', async () => {
    await assinante('u-refund-wh', 'sub_rw')
    const { aplicarEvento } = (await h.load('../../server/lib/billingEventos')) as any
    await aplicarEvento(
      {
        id: 'evt_rw',
        event: 'PAYMENT_REFUNDED',
        payment: { id: 'pay_rw', subscription: 'sub_rw', externalReference: 'u-refund-wh' },
      },
      'req',
      undefined,
    )
    expect(await ent.getPlanForUser(asUserId('u-refund-wh'))).toBe('free')
  })
})
