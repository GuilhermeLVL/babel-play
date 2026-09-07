/**
 * WEBHOOK DO ASAAS (E3) — os contratos de DINHEIRO, presos por teste antes do sandbox.
 *
 * 1. Evento repetido NÃO promove duas vezes (entrega é at-least-once; a doc do Asaas manda
 *    idempotência pelo id do evento).
 * 2. Token errado = 401; sem token configurado = 501 e NADA processa — qualquer POST da internet
 *    promovendo plano seria o pior bug possível.
 * 3. Pagamento confirma → o plano da INTENÇÃO (gravado por /assinar) ativa; atraso → past_due
 *    (a graça de subConcede mantém o acesso até o fim do período); estorno → canceled.
 * 4. Falha NOSSA depois da marca de idempotência desmarca e responde 500 — senão a reentrega
 *    seria "repetida" e a promoção do assinante se perderia para sempre.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId } from '../../server/lib/authContext'

let h: EphemeralDb
let asaasWebhookRouter: any
let subs: any
let entitlements: any
let eventos: any

const SEGREDO = 'segredo-webhook-teste'

function handler(): (req: any, res: any) => Promise<void> {
  const camada = asaasWebhookRouter.stack.find((l: any) => l.route?.path === '/' && l.route?.methods?.post)
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}
const req = (body: unknown, token: string | undefined = SEGREDO) => ({
  body,
  header: (k: string) => (k.toLowerCase() === 'asaas-access-token' ? token : undefined),
})
/**
 * PAGAMENTO DE ASSINATURA — carrega `payment.subscription`, e é isso que o distingue de uma
 * compra avulsa. Este helper não tinha o campo, o que significa que os testes vinham
 * exercitando a forma AVULSA e recebendo promoção de plano: exatamente o bug que a venda de
 * créditos ia expor em produção (uma compra de R$ 9,90 virava assinatura de graça).
 */
const evento = (id: string, event: string, userId: string) => ({
  id, event, payment: { id: `pay_${id}`, subscription: `sub_${userId}`, externalReference: userId },
})

/** O outro tipo que chega no MESMO webhook: cobrança avulsa (créditos, passe). Sem `subscription`. */
const eventoAvulso = (id: string, event: string, userId: string, paymentId: string) => ({
  id, event, payment: { id: paymentId, externalReference: userId },
})

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  process.env.ASAAS_WEBHOOK_TOKEN = SEGREDO
  ;({ asaasWebhookRouter } = (await h.load('../../server/routes/billing')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ billingEventsRepo: eventos } = (await h.load('../../server/db/repositories/billingEvents')) as any)
  entitlements = (await h.load('../../server/lib/entitlements')) as any
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  delete process.env.ASAAS_WEBHOOK_TOKEN
  await h.cleanup()
})
afterEach(() => vi.restoreAllMocks())

describe('autenticação do webhook', () => {
  it('token errado → 401, e nada é processado', async () => {
    const res = mockRes()
    await handler()(req(evento('evt_a1', 'PAYMENT_CONFIRMED', 'u-w1'), 'token-falso'), res)
    expect(res.statusCode).toBe(401)
    expect(await subs.getActive(asUserId('u-w1'))).toBeNull()
  })

  it('sem segredo configurado → 501, NUNCA processa', async () => {
    delete process.env.ASAAS_WEBHOOK_TOKEN
    const res = mockRes()
    await handler()(req(evento('evt_a2', 'PAYMENT_CONFIRMED', 'u-w2')), res)
    expect(res.statusCode).toBe(501)
    expect(await subs.getActive(asUserId('u-w2'))).toBeNull()
    process.env.ASAAS_WEBHOOK_TOKEN = SEGREDO
  })
})

/**
 * O BUG QUE A VENDA DE MOEDA IA EXPOR (economia-legivel-e-moedas).
 *
 * O `case PAYMENT_CONFIRMED` tratava TODO pagamento como mensalidade e promovia o pagador ao
 * plano 'essencial'. Enquanto só existiam assinaturas, funcionava. Com créditos à venda, uma
 * compra de R$ 9,90 em moeda daria um plano de R$ 9,90/mês de graça — e os dois tipos de evento
 * chegam pelo MESMO webhook.
 */
describe('compra avulsa não vira assinatura', () => {
  it('pagamento sem `subscription` NÃO promove plano nenhum', async () => {
    const u = asUserId('u-avulso')
    const res = mockRes()
    await handler()(req(eventoAvulso('evt_av1', 'PAYMENT_CONFIRMED', 'u-avulso', 'pay_desconhecido')), res)
    expect(res.statusCode).toBe(200)
    // Antes desta correção, aqui havia uma assinatura 'essencial' ativa que ninguém contratou.
    expect(await subs.getActive(u)).toBeNull()
    // A05: e o pagamento nao some num `break` — fica pendente, com motivo e payload guardados.
    expect(res.body.estado).toBe('nao-aplicado')
    const linha = await eventos.ler('evt_av1')
    expect(linha.estado).toBe('nao-aplicado')
    expect(linha.motivo).toMatch(/avulso-desconhecido/)
    expect(JSON.parse(linha.payload).payment.id).toBe('pay_desconhecido')
  })

  it('um avulso pendente é reaplicado depois de a compra ser registrada — uma vez só', async () => {
    const { creditsRepo } = (await h.load('../../server/db/repositories/credits')) as any
    const { aplicarEvento, eventoSchema } = (await h.load('../../server/lib/billingEventos')) as any
    const u = asUserId('u-tardio')
    const res = mockRes()
    await handler()(req(eventoAvulso('evt_av3', 'PAYMENT_CONFIRMED', 'u-tardio', 'pay_tardio')), res)
    expect(res.body.estado).toBe('nao-aplicado')

    // A compra e registrada DEPOIS (ex.: o checkout gravou tarde). Reaplicar o payload guardado
    // com a logica atual credita o pacote — e o estado muda, para nao creditar duas vezes.
    await creditsRepo.registrarCompra(u, { sku: 'c100', creditos: 100, valorCentavos: 990, providerPaymentId: 'pay_tardio' })
    const linha = await eventos.ler('evt_av3')
    const r = await aplicarEvento(eventoSchema.parse(JSON.parse(linha.payload)))
    expect(r.estado).toBe('aplicado')
    await eventos.registrarResultado('evt_av3', r.estado, r.motivo)
    expect(await creditsRepo.saldo(u)).toBe(100)
    expect((await eventos.listarPendentes()).map((e: any) => e.id)).not.toContain('evt_av3')

    // Reentrega do mesmo id pelo provedor continua 200 e sem efeito duplo.
    const res2 = mockRes()
    await handler()(req(eventoAvulso('evt_av3', 'PAYMENT_CONFIRMED', 'u-tardio', 'pay_tardio')), res2)
    expect(res2.body.repetido).toBe(true)
    expect(await creditsRepo.saldo(u)).toBe(100)
  })

  it('e a compra registrada é confirmada, creditando o pacote', async () => {
    const { creditsRepo } = (await h.load('../../server/db/repositories/credits')) as any
    const u = asUserId('u-comprador')
    await creditsRepo.registrarCompra(u, { sku: 'c300', creditos: 300, valorCentavos: 2490, providerPaymentId: 'pay_credito' })
    expect(await creditsRepo.saldo(u)).toBe(0)

    const res = mockRes()
    await handler()(req(eventoAvulso('evt_av2', 'PAYMENT_CONFIRMED', 'u-comprador', 'pay_credito')), res)
    expect(res.statusCode).toBe(200)
    expect(await creditsRepo.saldo(u)).toBe(300)
    // E continua sem virar assinante.
    expect(await subs.getActive(u)).toBeNull()
  })
})

/**
 * A ESCALADA DE PLANO COM DINHEIRO REAL (auditoria de 01/09, fechada em `servidor-e-autoridade`).
 *
 * `POST /api/billing/assinar` grava a INTENÇÃO e é de graça: dá para criar quantas assinaturas se
 * quiser no provedor. O webhook concedia `atual.plan` sem conferir NEM qual assinatura pagou NEM
 * quanto foi pago. A sequência era:
 *
 *   1. assinar `essencial` (R$ 9,90) — o provedor cria a assinatura S1
 *   2. assinar `pro` (R$ 19,90) — cria S2 e a intenção gravada vira `pro`
 *   3. pagar SÓ a parcela de S1
 *   4. o webhook lê a intenção (`pro`) e concede Pro por R$ 9,90
 *
 * As duas defesas: a assinatura que pagou tem de ser a registrada, e o PLANO SAI DO VALOR PAGO.
 */
describe('a assinatura concedida é a que foi paga', () => {
  /**
   * A05 (auditoria de 2026-09-07): este caso caía num `break` e respondia 200 — o pagante tinha
   * pago e ficava sem plano, sem reentrega e sem trilha. Agora o plano sai do VALOR PAGO (a
   * intenção `pro` não vale nada: pagou 9,90, recebe essencial) e a divergência fica escrita no
   * evento. Só quando não há valor para deduzir o plano é que o evento fica pendente.
   */
  it('parcela de OUTRA assinatura concede o plano do valor pago e registra a divergência', async () => {
    const u = asUserId('u-esc1')
    await subs.upsert(u, { plan: 'pro', status: 'trialing', provider: 'asaas', providerSubscriptionId: 'sub_S2' })
    const res = mockRes()
    await handler()(req({
      id: 'evt_esc1', event: 'PAYMENT_CONFIRMED',
      payment: { id: 'pay_esc1', subscription: 'sub_S1', externalReference: 'u-esc1', value: 9.9 },
    }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.estado).toBe('aplicado')
    expect(res.body.motivo).toMatch(/assinatura-divergente/)
    const sub = await subs.getActive(u)
    expect(sub.status).toBe('active')
    expect(sub.plan, 'pagou 9,90 pela outra assinatura — recebe o que pagou, nunca o pro da intenção').toBe('essencial')
    expect((await eventos.ler('evt_esc1')).estado).toBe('aplicado')
  })

  it('parcela de OUTRA assinatura SEM valor fica pendente, não some', async () => {
    const u = asUserId('u-esc4')
    await subs.upsert(u, { plan: 'pro', status: 'trialing', provider: 'asaas', providerSubscriptionId: 'sub_S9' })
    const res = mockRes()
    await handler()(req({
      id: 'evt_esc4', event: 'PAYMENT_CONFIRMED',
      payment: { id: 'pay_esc4', subscription: 'sub_S8', externalReference: 'u-esc4' },
    }), res)
    expect(res.statusCode).toBe(200) // 200 para o provedor não reentregar; o efeito é a fila
    expect(res.body.estado).toBe('nao-aplicado')
    expect((await subs.getActive(u))?.status).not.toBe('active')
    const pendentes = await eventos.listarPendentes()
    expect(pendentes.map((e: any) => e.id)).toContain('evt_esc4')
  })

  it('pagar o preço do essencial concede ESSENCIAL, mesmo com a intenção em pro', async () => {
    const u = asUserId('u-esc2')
    await subs.upsert(u, { plan: 'pro', status: 'trialing', provider: 'asaas', providerSubscriptionId: 'sub_S1' })
    const res = mockRes()
    await handler()(req({
      id: 'evt_esc2', event: 'PAYMENT_CONFIRMED',
      payment: { id: 'pay_esc2', subscription: 'sub_S1', externalReference: 'u-esc2', value: 9.9 },
    }), res)
    expect(res.statusCode).toBe(200)
    const sub = await subs.getActive(u)
    expect(sub.status).toBe('active')
    expect(sub.plan, 'pagou 9,90 — não pode receber Pro').toBe('essencial')
  })

  it('pagar o preço do Pro concede PRO', async () => {
    const u = asUserId('u-esc3')
    await subs.upsert(u, { plan: 'essencial', status: 'trialing', provider: 'asaas', providerSubscriptionId: 'sub_S3' })
    const res = mockRes()
    await handler()(req({
      id: 'evt_esc3', event: 'PAYMENT_CONFIRMED',
      payment: { id: 'pay_esc3', subscription: 'sub_S3', externalReference: 'u-esc3', value: 19.9 },
    }), res)
    expect((await subs.getActive(u)).plan).toBe('pro')
  })
})

describe('o ciclo de vida do plano', () => {
  it('pagamento confirmado ativa o plano da INTENÇÃO gravada por /assinar', async () => {
    const u = asUserId('u-ciclo')
    await subs.upsert(u, { plan: 'pro', status: 'trialing', provider: 'asaas' })
    const res = mockRes()
    await handler()(req(evento('evt_c1', 'PAYMENT_CONFIRMED', 'u-ciclo')), res)
    expect(res.statusCode).toBe(200)
    const sub = await subs.getActive(u)
    expect(sub.plan).toBe('pro')
    expect(sub.status).toBe('active')
    expect(sub.currentPeriodEnd).toBeGreaterThan(Date.now())
    // E o entitlement REAL passa a valer — o que o assinante comprou.
    expect(await entitlements.hasEntitlement(u, 'managedCloudStt')).toBe(true)
  })

  it('IDEMPOTÊNCIA: o mesmo evento duas vezes = uma promoção, segunda resposta marca repetido', async () => {
    const u = asUserId('u-idem')
    await subs.upsert(u, { plan: 'essencial', status: 'trialing' })
    await handler()(req(evento('evt_i1', 'PAYMENT_CONFIRMED', 'u-idem')), mockRes())
    const primeiraJanela = (await subs.getActive(u)).currentPeriodEnd

    const res2 = mockRes()
    await handler()(req(evento('evt_i1', 'PAYMENT_CONFIRMED', 'u-idem')), res2)
    expect(res2.statusCode).toBe(200)
    expect(res2.body?.repetido).toBe(true)
    // O período NÃO foi re-esticado: o efeito aconteceu uma vez só.
    expect((await subs.getActive(u)).currentPeriodEnd).toBe(primeiraJanela)
  })

  it('atraso → past_due; estorno → canceled', async () => {
    const u = asUserId('u-vida')
    await subs.upsert(u, { plan: 'pro', status: 'active' })
    await handler()(req(evento('evt_v1', 'PAYMENT_OVERDUE', 'u-vida')), mockRes())
    expect((await subs.getActive(u)).status).toBe('past_due')
    await handler()(req(evento('evt_v2', 'PAYMENT_REFUNDED', 'u-vida')), mockRes())
    expect((await subs.getActive(u)).status).toBe('canceled')
  })

  it('evento sem externalReference é auditado e não tem efeito', async () => {
    const res = mockRes()
    await handler()(req({ id: 'evt_s1', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_x' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body?.semUsuario).toBe(true)
  })
})

describe('falha nossa depois da marca', () => {
  it('desmarca e responde 500 — a reentrega do Asaas NÃO é tratada como repetida', async () => {
    const u = asUserId('u-falha')
    await subs.upsert(u, { plan: 'pro', status: 'trialing' })

    // 1ª entrega: o upsert do plano falha DEPOIS da marca de idempotência.
    const original = subs.upsert
    const spy = vi.spyOn(subs, 'upsert').mockRejectedValueOnce(new Error('banco caiu'))
    const res1 = mockRes()
    await handler()(req(evento('evt_f1', 'PAYMENT_CONFIRMED', 'u-falha')), res1)
    expect(res1.statusCode).toBe(500)
    spy.mockRestore()
    subs.upsert = original

    // Reentrega: se a marca tivesse ficado presa, isto viria como `repetido` e o assinante
    // pagaria sem receber. Tem de PROCESSAR.
    const res2 = mockRes()
    await handler()(req(evento('evt_f1', 'PAYMENT_CONFIRMED', 'u-falha')), res2)
    expect(res2.statusCode).toBe(200)
    expect(res2.body?.repetido).toBeUndefined()
    expect((await subs.getActive(asUserId('u-falha'))).status).toBe('active')
  })
})
