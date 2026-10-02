/**
 * O ANUAL E O 12x (C5 da change `planos-v2`, sondagem real do sandbox em `design.md`).
 *
 * Os contratos de DINHEIRO presos aqui, com o Asaas simulado por URL:
 * 1. `/assinar` com `ciclo: 'anual'` cria a assinatura `YEARLY` de R$ 179 (Pix, boleto ou cartão —
 *    `UNDEFINED`); com `meio: 'parcelamento'` cria o 12x como PARCELAMENTO (`installmentCount: 12`,
 *    `totalValue: 179`) e SÓ no cartão — fora dele cada parcela seria uma cobrança avulsa que a pessoa
 *    pode deixar de pagar, e o ano sairia por R$ 14,91. Pix Automático não está integrado (501).
 * 2. O webhook reconhece a parcela (`installment` presente, `subscription` ausente), CONFERIDA na API
 *    do Asaas (GAP-011): concede o ano (vencimento da 1ª parcela + 370 d), e as outras 11 parcelas —
 *    ou o mesmo evento de novo — não esticam nada.
 * 3. Um pagamento nunca ENCURTA o período já pago (a mensalidade de uma assinatura antiga não
 *    derruba o anual).
 * 4. Arrependimento em 7 dias estorna o anual inteiro e o parcelamento INTEIRO; depois dos 7 dias
 *    cancelar é não renovar — o anual vale até o vencimento do Asaas, o 12x até o fim do ano pago,
 *    sem reembolso proporcional (a validar com o jurídico).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let billingRouter: any
let asaasWebhookRouter: any
let subs: any
let ent: any
let idades: any
let aplicarEvento: any

const DIA = 86_400_000
const SEGREDO = 'segredo-webhook-12x'
const dataIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

function rota(router: any, caminho: string, metodo: 'get' | 'post'): (req: any, res: any) => Promise<void> {
  const camada = router.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.[metodo])
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
  r.setHeader = () => r
  return r
}
const req = (userId: string, body: unknown = {}, caminho = '/assinar') => ({
  userId: asUserId(userId),
  requestId: 'req-teste',
  path: caminho,
  body,
  header: () => undefined,
})
const reqWebhook = (body: unknown) => ({
  body,
  header: (k: string) => (k.toLowerCase() === 'asaas-access-token' ? SEGREDO : undefined),
})

interface Parcela {
  id: string
  status: string
  value: number
  dueDate: string
  installmentNumber: number
  billingType?: string
  confirmedDate?: string
}

/** As 12 parcelas como o Asaas as cobra: 11 × 14,91 + 14,99, vencimentos mensais a partir de `d0`. */
function parcelasDoAno(instId: string, d0: Date, status: string, confirmadaEm?: string): Parcela[] {
  return Array.from({ length: 12 }, (_, i) => {
    const venc = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + i, d0.getUTCDate()))
    return {
      id: `${instId}_p${i + 1}`,
      status,
      value: i === 11 ? 14.99 : 14.91,
      dueDate: dataIso(venc.getTime()),
      installmentNumber: i + 1,
      billingType: 'CREDIT_CARD',
      ...(confirmadaEm ? { confirmedDate: confirmadaEm } : {}),
    }
  })
}

interface Cenario {
  /** Pagamentos que `GET /payments/{id}` devolve (a conferência do GAP-011). */
  pagamentos?: Record<string, Record<string, unknown>>
  /** Parcelas de `GET /installments/{id}/payments`. */
  parcelas?: Parcela[]
  /** Cobranças de `GET /subscriptions/{id}/payments`. */
  cobrancas?: Array<Record<string, unknown>>
  nextDueDate?: string
}

/** Um Asaas de mentira: responde por URL e registra o que foi pedido (método, caminho e corpo). */
function asaasSimulado(c: Cenario = {}) {
  const chamadas: Array<{ metodo: string; url: string; corpo: any }> = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input)
    const metodo = String(init?.method ?? 'GET')
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined
    chamadas.push({ metodo, url, corpo })
    if (metodo === 'POST' && url.endsWith('/customers')) return json({ id: 'cus_novo' })
    if (metodo === 'POST' && url.endsWith('/subscriptions')) return json({ id: 'sub_novo', cycle: corpo?.cycle })
    if (metodo === 'GET' && /\/subscriptions\/[^/]+\/payments/.test(url))
      return json({ data: c.cobrancas ?? [{ id: 'pay_sub_1', invoiceUrl: 'https://sandbox.asaas.com/i/sub1' }] })
    if (metodo === 'GET' && /\/subscriptions\/[^/?]+$/.test(url)) return json({ id: 'sub', nextDueDate: c.nextDueDate })
    if (metodo === 'DELETE' && /\/subscriptions\//.test(url)) return json({ deleted: true })
    if (metodo === 'POST' && url.endsWith('/payments'))
      return json({ id: 'pay_p1', installment: 'ins_novo', invoiceUrl: 'https://sandbox.asaas.com/i/p1' })
    if (metodo === 'GET' && /\/installments\/[^/]+\/payments/.test(url)) return json({ data: c.parcelas ?? [] })
    if (metodo === 'POST' && /\/installments\/[^/]+\/refund$/.test(url)) return json({ id: 'ins', status: 'REFUNDED' })
    if (metodo === 'DELETE' && /\/installments\//.test(url)) return json({ deleted: true })
    if (metodo === 'POST' && /\/payments\/[^/]+\/refund$/.test(url)) return json({ id: 'pay', status: 'REFUNDED' })
    const pagamento = /\/payments\/([^/?]+)$/.exec(url)
    if (metodo === 'GET' && pagamento) {
      const p = c.pagamentos?.[decodeURIComponent(pagamento[1])]
      return p ? json(p) : json({ errors: [{ code: 'not_found' }] }, 404)
    }
    return json({ erro: 'rota não simulada' }, 404)
  })
  return chamadas
}

async function adulto(userId: string) {
  await idades.declarar(asUserId(userId), '1990-01-01')
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  process.env.ASAAS_WEBHOOK_TOKEN = SEGREDO
  ;({ billingRouter, asaasWebhookRouter } = (await h.load('../../server/routes/billing')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ idadesRepo: idades } = (await h.load('../../server/db/repositories/idades')) as any)
  ;({ aplicarEvento } = (await h.load('../../server/lib/billingEventos')) as any)
  ent = await h.load('../../server/lib/entitlements')
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  delete process.env.ASAAS_API_KEY
  delete process.env.ASAAS_WEBHOOK_TOKEN
  await h.cleanup()
})
afterEach(() => vi.restoreAllMocks())

const pedido = { plano: 'premium', nome: 'Pessoa de Teste', cpfCnpj: '24971563792' }

describe('POST /api/billing/assinar — o ciclo e o meio', () => {
  it('sem ciclo continua o mensal de sempre: MONTHLY a R$ 19,90', async () => {
    await adulto('u-mensal')
    const chamadas = asaasSimulado()
    const res = mockRes()
    await rota(billingRouter, '/assinar', 'post')(req('u-mensal', pedido), res)
    expect(res.statusCode).toBe(200)
    const criar = chamadas.find((c) => c.metodo === 'POST' && c.url.endsWith('/subscriptions'))
    expect(criar?.corpo).toMatchObject({ cycle: 'MONTHLY', value: 19.9, billingType: 'UNDEFINED' })
  })

  it('anual em uma vez: assinatura YEARLY de R$ 179, com Pix, boleto ou cartão', async () => {
    await adulto('u-anual')
    const chamadas = asaasSimulado()
    const res = mockRes()
    await rota(billingRouter, '/assinar', 'post')(req('u-anual', { ...pedido, ciclo: 'anual' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.linkDePagamento).toBe('https://sandbox.asaas.com/i/sub1')
    const criar = chamadas.find((c) => c.metodo === 'POST' && c.url.endsWith('/subscriptions'))
    expect(criar?.corpo).toMatchObject({ cycle: 'YEARLY', value: 179, billingType: 'UNDEFINED' })
    expect(
      chamadas.some((c) => c.metodo === 'POST' && c.url.endsWith('/payments')),
      'anual não é parcelamento',
    ).toBe(false)
    const sub = await subs.getActive(asUserId('u-anual'))
    expect(sub).toMatchObject({
      status: 'trialing',
      ciclo: 'anual',
      meio: 'assinatura',
      providerSubscriptionId: 'sub_novo',
    })
    // Iniciar o checkout continua não concedendo nada (GAP-001).
    expect(await ent.getPlanForUser(asUserId('u-anual'))).toBe('free')
  })

  it('12x: PARCELAMENTO de R$ 179 em 12 vezes, SÓ no cartão, sem assinatura recorrente', async () => {
    await adulto('u-12x')
    const chamadas = asaasSimulado()
    const res = mockRes()
    await rota(
      billingRouter,
      '/assinar',
      'post',
    )(req('u-12x', { ...pedido, ciclo: 'anual', meio: 'parcelamento' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.linkDePagamento).toBe('https://sandbox.asaas.com/i/p1')
    const criar = chamadas.find((c) => c.metodo === 'POST' && c.url.endsWith('/payments'))
    expect(criar?.corpo).toMatchObject({
      billingType: 'CREDIT_CARD',
      installmentCount: 12,
      totalValue: 179,
      externalReference: 'u-12x',
    })
    expect(criar?.corpo.value, 'o valor da parcela quem calcula é o Asaas (trunca e joga a diferença na última)').toBe(
      undefined,
    )
    expect(chamadas.some((c) => c.metodo === 'POST' && c.url.endsWith('/subscriptions'))).toBe(false)
    const sub = await subs.getActive(asUserId('u-12x'))
    expect(sub).toMatchObject({
      status: 'trialing',
      ciclo: 'anual',
      meio: 'parcelamento',
      providerInstallmentId: 'ins_novo',
      providerSubscriptionId: null,
    })
  })

  it('o 12x é só do anual: parcelar o mensal é 400 e nada é criado no Asaas', async () => {
    await adulto('u-12x-mensal')
    const chamadas = asaasSimulado()
    const res = mockRes()
    await rota(billingRouter, '/assinar', 'post')(req('u-12x-mensal', { ...pedido, meio: 'parcelamento' }), res)
    expect(res.statusCode).toBe(400)
    expect(chamadas).toHaveLength(0)
  })

  it('Pix Automático não está integrado (exige conta PJ elegível): 501, nada criado', async () => {
    await adulto('u-pix-auto')
    const chamadas = asaasSimulado()
    const res = mockRes()
    await rota(
      billingRouter,
      '/assinar',
      'post',
    )(req('u-pix-auto', { ...pedido, ciclo: 'anual', meio: 'pix_automatico' }), res)
    expect(res.statusCode).toBe(501)
    expect(res.body.code).toBe('pix_automatico_indisponivel')
    expect(chamadas).toHaveLength(0)
  })

  it('quem já paga (ativa no Asaas) não abre uma segunda cobrança: 409, nada criado', async () => {
    const u = asUserId('u-ja-paga')
    await adulto('u-ja-paga')
    await subs.upsert(u, {
      provider: 'asaas',
      providerCustomerId: 'cus_jp',
      providerSubscriptionId: 'sub_jp',
      meio: 'assinatura',
      plan: 'premium',
      status: 'active',
      currentPeriodEnd: Date.now() + 20 * DIA,
    })
    const chamadas = asaasSimulado()
    const res = mockRes()
    await rota(billingRouter, '/assinar', 'post')(req('u-ja-paga', { ...pedido, ciclo: 'anual' }), res)
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('ja_assinante')
    expect(chamadas).toHaveLength(0)
  })
})

describe('webhook — o ramo do parcelamento', () => {
  const d0 = new Date(Date.UTC(2026, 9, 1)) // 01/10/2026
  const parcelas = parcelasDoAno('ins_w', d0, 'CONFIRMED')
  const pagamentos = Object.fromEntries(
    parcelas.map((p) => [p.id, { ...p, installment: 'ins_w', externalReference: 'u-wh-12x' }]),
  )
  const evento = (id: string, pagamentoId: string) => ({
    id,
    event: 'PAYMENT_CONFIRMED',
    // O payload pode mentir (GAP-011): o valor e o vencimento que valem são os da API do Asaas.
    payment: {
      id: pagamentoId,
      installment: 'ins_w',
      externalReference: 'u-wh-12x',
      value: 179,
      dueDate: '2030-01-01',
    },
  })

  it('a 1ª parcela, conferida na API, concede o ANO: vencimento da 1ª parcela + 370 dias', async () => {
    const u = asUserId('u-wh-12x')
    await subs.upsert(u, {
      provider: 'asaas',
      plan: 'premium',
      status: 'trialing',
      ciclo: 'anual',
      meio: 'parcelamento',
      providerInstallmentId: 'ins_w',
    })
    const chamadas = asaasSimulado({ pagamentos })
    const res = mockRes()
    await rota(asaasWebhookRouter, '/', 'post')(reqWebhook(evento('evt_12x_1', 'ins_w_p1')), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.estado).toBe('aplicado')
    expect(
      chamadas.some((c) => c.url.endsWith('/payments/ins_w_p1')),
      'GAP-011: conferiu na API',
    ).toBe(true)
    const sub = await subs.getActive(u)
    expect(sub).toMatchObject({ status: 'active', plan: 'premium', ciclo: 'anual', meio: 'parcelamento' })
    expect(sub.currentPeriodEnd).toBe(Date.parse('2026-10-01T12:00:00Z') + 370 * DIA)
    expect(await ent.getPlanForUser(u)).toBe('premium')
  })

  it('as outras parcelas (e a última, de R$ 14,99) não esticam o ano', async () => {
    const u = asUserId('u-wh-12x')
    const fim = (await subs.getActive(u)).currentPeriodEnd
    asaasSimulado({ pagamentos })
    for (const n of [2, 7, 12]) {
      const res = mockRes()
      await rota(asaasWebhookRouter, '/', 'post')(reqWebhook(evento(`evt_12x_${n}`, `ins_w_p${n}`)), res)
      expect(res.body.estado, `parcela ${n}`).toBe('aplicado')
    }
    expect((await subs.getActive(u)).currentPeriodEnd).toBe(fim)
  })

  it('o MESMO evento de novo é repetido: nenhum efeito', async () => {
    asaasSimulado({ pagamentos })
    const res = mockRes()
    await rota(asaasWebhookRouter, '/', 'post')(reqWebhook(evento('evt_12x_1', 'ins_w_p1')), res)
    expect(res.body.repetido).toBe(true)
  })

  it('parcela que não é do anual (valor de outra conta) não concede nada e fica pendente', async () => {
    const u = asUserId('u-wh-12x-errado')
    await subs.upsert(u, { plan: 'premium', status: 'trialing', meio: 'parcelamento', providerInstallmentId: 'ins_e' })
    const verificar = async () => ({
      id: 'pay_e1',
      status: 'CONFIRMED',
      value: 9.9,
      installment: 'ins_e',
      installmentNumber: 1,
      billingType: 'CREDIT_CARD',
      externalReference: 'u-wh-12x-errado',
      dueDate: '2026-10-01',
    })
    const r = await aplicarEvento(
      { id: 'evt_e1', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_e1', externalReference: 'u-wh-12x-errado' } },
      'req',
      verificar,
    )
    expect(r.estado).toBe('nao-aplicado')
    expect(r.motivo).toMatch(/parcela/)
    expect((await subs.getActive(u)).status).toBe('trialing')
  })

  it('parcelamento fora do cartão (carnê) não concede o ano: fica para o admin', async () => {
    const u = asUserId('u-wh-carne')
    await subs.upsert(u, { plan: 'premium', status: 'trialing', meio: 'parcelamento', providerInstallmentId: 'ins_c' })
    const verificar = async () => ({
      id: 'pay_c1',
      status: 'RECEIVED',
      value: 14.91,
      installment: 'ins_c',
      installmentNumber: 1,
      billingType: 'PIX',
      externalReference: 'u-wh-carne',
      dueDate: '2026-10-01',
    })
    const r = await aplicarEvento(
      { id: 'evt_c1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_c1', externalReference: 'u-wh-carne' } },
      'req',
      verificar,
    )
    expect(r.estado).toBe('nao-aplicado')
    expect(r.motivo).toMatch(/cartão/)
    expect(await ent.getPlanForUser(u)).toBe('free')
  })

  it('a parcela NÃO vira compra de créditos (não há `subscription`, mas há `installment`)', async () => {
    const u = asUserId('u-wh-nao-credito')
    await subs.upsert(u, { plan: 'premium', status: 'trialing', meio: 'parcelamento', providerInstallmentId: 'ins_nc' })
    const verificar = async () => ({
      id: 'pay_nc1',
      status: 'CONFIRMED',
      value: 14.91,
      installment: 'ins_nc',
      installmentNumber: 1,
      billingType: 'CREDIT_CARD',
      externalReference: 'u-wh-nao-credito',
      dueDate: '2026-10-01',
    })
    const r = await aplicarEvento(
      { id: 'evt_nc1', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_nc1', externalReference: 'u-wh-nao-credito' } },
      'req',
      verificar,
    )
    expect(r.estado).toBe('aplicado')
    expect(r.motivo ?? '').not.toMatch(/avulso/)
  })

  it('estorno de uma parcela revoga o ano na hora (não é estorno de créditos)', async () => {
    const u = asUserId('u-wh-12x')
    /* O estorno é CONFERIDO na API antes de revogar (auditoria de cobrança de 02/10/2026): sem o
       pagamento `REFUNDED` do lado de lá, o evento ficaria `nao-aplicado` e o ano continuaria. */
    asaasSimulado({
      pagamentos: {
        ins_w_p1: {
          id: 'ins_w_p1',
          status: 'REFUNDED',
          value: 14.91,
          installment: 'ins_w',
          installmentNumber: 1,
          billingType: 'CREDIT_CARD',
          externalReference: 'u-wh-12x',
        },
      },
    })
    const r = await aplicarEvento(
      {
        id: 'evt_12x_ref',
        event: 'PAYMENT_REFUNDED',
        payment: { id: 'ins_w_p1', installment: 'ins_w', externalReference: 'u-wh-12x' },
      },
      'req',
      undefined,
    )
    expect(r.estado).toBe('aplicado')
    expect(await ent.getPlanForUser(u)).toBe('free')
  })
})

describe('um pagamento nunca encurta o período já pago', () => {
  it('a mensalidade de uma assinatura antiga não derruba o anual que vale até o ano que vem', async () => {
    const u = asUserId('u-nao-encolhe')
    const fimDoAno = Date.now() + 300 * DIA
    await subs.upsert(u, {
      provider: 'asaas',
      plan: 'premium',
      status: 'active',
      ciclo: 'anual',
      meio: 'assinatura',
      providerSubscriptionId: 'sub_anual',
      currentPeriodEnd: fimDoAno,
    })
    const pagamento = {
      id: 'pay_mv',
      status: 'CONFIRMED',
      subscription: 'sub_mensal_velha',
      externalReference: 'u-nao-encolhe',
      value: 19.9,
      dueDate: dataIso(Date.now()),
    }
    // A conferência do GAP-011 passa pelo Asaas simulado (nunca pela rede).
    asaasSimulado({ pagamentos: { pay_mv: pagamento } })
    const r = await aplicarEvento({ id: 'evt_mensal_velho', event: 'PAYMENT_CONFIRMED', payment: pagamento }, 'req')
    expect(r.estado).toBe('aplicado')
    const sub = await subs.getActive(u)
    expect(sub.currentPeriodEnd).toBe(fimDoAno)
    expect(sub.ciclo).toBe('anual')
  })
})

describe('POST /api/billing/cancelar — anual e 12x', () => {
  const cancelar = async (userId: string) => {
    const res = mockRes()
    await rota(billingRouter, '/cancelar', 'post')(req(userId, {}, '/cancelar'), res)
    return res
  }

  it('anual em até 7 dias: arrependimento estorna os R$ 179 e o acesso acaba agora', async () => {
    const u = asUserId('u-cx-anual-novo')
    await subs.upsert(u, {
      provider: 'asaas',
      providerSubscriptionId: 'sub_an_n',
      meio: 'assinatura',
      plan: 'premium',
      ciclo: 'anual',
      status: 'active',
      currentPeriodEnd: Date.now() + 360 * DIA,
    })
    const chamadas = asaasSimulado({
      cobrancas: [{ id: 'pay_an_n', status: 'CONFIRMED', value: 179, confirmedDate: dataIso(Date.now() - 2 * DIA) }],
    })
    const res = await cancelar('u-cx-anual-novo')
    expect(res.statusCode).toBe(200)
    expect(res.body.arrependimento).toMatchObject({ estornado: true, valor: 179 })
    expect(chamadas.some((c) => c.metodo === 'POST' && c.url.endsWith('/payments/pay_an_n/refund'))).toBe(true)
    expect(chamadas.some((c) => c.metodo === 'DELETE' && c.url.includes('/subscriptions/sub_an_n'))).toBe(true)
    expect(await ent.getPlanForUser(u)).toBe('free')
  })

  it('anual depois de 7 dias: para a renovação e vale até o vencimento de daqui a um ano, sem estorno', async () => {
    const u = asUserId('u-cx-anual-velho')
    await subs.upsert(u, {
      provider: 'asaas',
      providerSubscriptionId: 'sub_an_v',
      meio: 'assinatura',
      plan: 'premium',
      ciclo: 'anual',
      status: 'active',
      currentPeriodEnd: Date.now() + 340 * DIA,
    })
    const renova = Date.now() + 335 * DIA
    const chamadas = asaasSimulado({
      cobrancas: [{ id: 'pay_an_v', status: 'RECEIVED', value: 179, paymentDate: dataIso(Date.now() - 30 * DIA) }],
      nextDueDate: dataIso(renova),
    })
    const res = await cancelar('u-cx-anual-velho')
    expect(res.statusCode).toBe(200)
    expect(res.body.arrependimento).toBeNull()
    expect(
      chamadas.some((c) => c.url.includes('/refund')),
      'sem reembolso proporcional',
    ).toBe(false)
    const sub = await subs.getActive(u)
    expect(dataIso(sub.currentPeriodEnd - 3 * 3_600_000)).toBe(dataIso(renova))
    expect(await ent.getPlanForUser(u)).toBe('premium')
  })

  it('12x em até 7 dias: estorna o PARCELAMENTO INTEIRO de uma vez e o acesso acaba agora', async () => {
    const u = asUserId('u-cx-12x-novo')
    await subs.upsert(u, {
      provider: 'asaas',
      providerInstallmentId: 'ins_n',
      meio: 'parcelamento',
      plan: 'premium',
      ciclo: 'anual',
      status: 'active',
      currentPeriodEnd: Date.now() + 365 * DIA,
    })
    const chamadas = asaasSimulado({
      parcelas: parcelasDoAno('ins_n', new Date(Date.now() - 3 * DIA), 'CONFIRMED', dataIso(Date.now() - 3 * DIA)),
    })
    const res = await cancelar('u-cx-12x-novo')
    expect(res.statusCode).toBe(200)
    expect(res.body.arrependimento).toMatchObject({ estornado: true, valor: 179 })
    const estornos = chamadas.filter((c) => c.url.includes('/refund'))
    expect(estornos.map((c) => c.url.replace(/^.*\/v3/, ''))).toEqual(['/installments/ins_n/refund'])
    expect(await ent.getPlanForUser(u)).toBe('free')
  })

  it('repetir o cancelamento do 12x não estorna de novo', async () => {
    const chamadas = asaasSimulado({
      parcelas: parcelasDoAno('ins_n', new Date(Date.now() - 3 * DIA), 'CONFIRMED', dataIso(Date.now() - 3 * DIA)),
    })
    const u = asUserId('u-cx-12x-novo')
    // A linha ficou cancelada; um segundo clique (ou a exclusão da conta) não pode estornar outra vez.
    await subs.upsert(u, { status: 'canceled', currentPeriodEnd: Date.now() })
    const res = await cancelar('u-cx-12x-novo')
    expect(res.statusCode).toBe(200)
    expect(chamadas.some((c) => c.url.includes('/refund'))).toBe(false)
    expect(res.body.arrependimento).toMatchObject({ estornado: true })
  })

  it('12x depois de 7 dias: nada muda no cartão, o ano pago vale até o fim, sem reembolso proporcional', async () => {
    const u = asUserId('u-cx-12x-velho')
    const fim = Date.now() + 200 * DIA
    await subs.upsert(u, {
      provider: 'asaas',
      providerInstallmentId: 'ins_v',
      meio: 'parcelamento',
      plan: 'premium',
      ciclo: 'anual',
      status: 'active',
      currentPeriodEnd: fim,
    })
    const chamadas = asaasSimulado({
      parcelas: parcelasDoAno('ins_v', new Date(Date.now() - 160 * DIA), 'CONFIRMED', dataIso(Date.now() - 160 * DIA)),
    })
    const res = await cancelar('u-cx-12x-velho')
    expect(res.statusCode).toBe(200)
    expect(res.body.arrependimento).toBeNull()
    expect(res.body.valeAte).toBe(fim)
    expect(
      chamadas.filter((c) => c.metodo !== 'GET'),
      'nenhuma escrita no Asaas',
    ).toHaveLength(0)
    const sub = await subs.getActive(u)
    expect(sub).toMatchObject({ status: 'canceled', cancelAtPeriodEnd: 1, currentPeriodEnd: fim })
    expect(await ent.getPlanForUser(u)).toBe('premium')
  })
})

describe('status e faturas do 12x', () => {
  it('/status diz o meio e que o 12x não renova sozinho; o anual recorrente renova', async () => {
    const u12 = asUserId('u-st-12x')
    await subs.upsert(u12, {
      provider: 'asaas',
      providerInstallmentId: 'ins_st',
      meio: 'parcelamento',
      plan: 'premium',
      ciclo: 'anual',
      status: 'active',
      currentPeriodEnd: Date.now() + 300 * DIA,
    })
    const chamadas = asaasSimulado({ nextDueDate: '2027-10-01' })
    const res = mockRes()
    await rota(billingRouter, '/status', 'get')(req('u-st-12x', {}, '/status'), res)
    expect(res.body.assinatura).toMatchObject({ ciclo: 'anual', meio: 'parcelamento', renovacaoAutomatica: false })
    expect(res.body.proximaCobranca, 'o 12x não tem "próxima cobrança" nossa').toBeUndefined()
    expect(chamadas.some((c) => c.url.includes('/subscriptions/'))).toBe(false)

    const uAn = asUserId('u-st-anual')
    await subs.upsert(uAn, {
      provider: 'asaas',
      providerSubscriptionId: 'sub_st_an',
      meio: 'assinatura',
      plan: 'premium',
      ciclo: 'anual',
      status: 'active',
      currentPeriodEnd: Date.now() + 300 * DIA,
    })
    const r2 = mockRes()
    await rota(billingRouter, '/status', 'get')(req('u-st-anual', {}, '/status'), r2)
    expect(r2.body.assinatura).toMatchObject({ ciclo: 'anual', meio: 'assinatura', renovacaoAutomatica: true })
    expect(r2.body.proximaCobranca).toBe('2027-10-01')
  })

  it('/faturas do 12x lista as parcelas do parcelamento', async () => {
    asaasSimulado({ parcelas: parcelasDoAno('ins_st', new Date(Date.UTC(2026, 9, 1)), 'CONFIRMED', '2026-10-01') })
    const res = mockRes()
    await rota(billingRouter, '/faturas', 'get')(req('u-st-12x', {}, '/faturas'), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.faturas).toHaveLength(12)
    expect(res.body.faturas[0]).toMatchObject({ valor: 14.91, status: 'paga', metodo: 'cartao' })
    expect(res.body.faturas[11].valor).toBe(14.99)
  })
})
