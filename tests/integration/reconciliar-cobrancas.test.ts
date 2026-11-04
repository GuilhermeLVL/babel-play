/**
 * Reconciliação Asaas × banco: o pagamento que confirmou no Asaas e nunca gerou evento (webhook perdido) é
 * achado, avisado e — no modo `apply` — reaplicado pelo mesmo caminho do webhook, sem conceder em dobro.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let reconciliar: any
let aplicarEvento: any
let subs: any
let eventos: any

const AGORA = Date.parse('2026-11-03T12:00:00Z')
const dia = (n: number) => new Date(AGORA - n * 86_400_000).toISOString().slice(0, 10)
const paga = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  status: 'CONFIRMED',
  value: 39.9,
  dueDate: dia(2),
  paymentDate: dia(2),
  ...over,
})
const verificador = (u: string) => async (id: string) => ({
  id,
  status: 'CONFIRMED',
  value: 39.9,
  subscription: 'sub_r',
  externalReference: u,
  dueDate: dia(2),
})
const deps = (lista: unknown[], u = 'u-rec') => ({
  listarDaAssinatura: async () => lista as any,
  listarDoParcelamento: async () => [],
  aplicar: (ev: any) => aplicarEvento(ev, 'req-t', verificador(u)),
})

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ reconciliarCobrancas: reconciliar } = (await h.load('../../server/lib/reconciliarCobrancas')) as any)
  ;({ aplicarEvento } = (await h.load('../../server/lib/billingEventos')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ billingEventsRepo: eventos } = (await h.load('../../server/db/repositories/billingEvents')) as any)
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  await h.cleanup()
})
beforeEach(async () => {
  await subs.upsert(asUserId('u-rec'), {
    plan: 'premium',
    status: 'trialing',
    provider: 'asaas',
    providerSubscriptionId: 'sub_r',
  })
})

describe('reconciliarCobrancas', () => {
  it('report: acha o pagamento sem evento, conta e NÃO concede', async () => {
    const r = await reconciliar({ agora: AGORA, modo: 'report', deps: deps([paga('pay_a')]) })
    expect(r).toMatchObject({ assinaturas: 1, cobrancas: 1, divergentes: 1, reaplicadas: 0 })
    expect((await subs.getActive(asUserId('u-rec'))).status).toBe('trialing')
  })

  it('apply: reaplica, concede, e a segunda passada não acha mais nada', async () => {
    const r = await reconciliar({ agora: AGORA, modo: 'apply', deps: deps([paga('pay_b')]) })
    expect(r).toMatchObject({ divergentes: 1, reaplicadas: 1, falhas: 0 })
    expect((await subs.getActive(asUserId('u-rec'))).status).toBe('active')
    const de_novo = await reconciliar({ agora: AGORA, modo: 'apply', deps: deps([paga('pay_b')]) })
    expect(de_novo).toMatchObject({ divergentes: 0, reaplicadas: 0 })
  })

  it('o webhook tardio do mesmo pagamento não concede em dobro', async () => {
    await reconciliar({ agora: AGORA, modo: 'apply', deps: deps([paga('pay_c')]) })
    const antes = await subs.getActive(asUserId('u-rec'))
    const ev = {
      id: 'evt_tardio',
      event: 'PAYMENT_CONFIRMED',
      payment: { id: 'pay_c', subscription: 'sub_r', externalReference: 'u-rec', value: 39.9, dueDate: dia(2) },
    }
    await aplicarEvento(ev, 'req-t', verificador('u-rec'))
    const depois = await subs.getActive(asUserId('u-rec'))
    expect(depois.currentPeriodEnd).toBe(antes.currentPeriodEnd)
    expect(depois.plan).toBe(antes.plan)
  })

  it('pagamento que já tem evento no banco não é divergente', async () => {
    await eventos.marcarSeNovo('evt_ok', 'asaas', 'PAYMENT_RECEIVED', 'u-rec', 'pay_d', null)
    const r = await reconciliar({ agora: AGORA, modo: 'apply', deps: deps([paga('pay_d', { status: 'RECEIVED' })]) })
    expect(r).toMatchObject({ cobrancas: 1, divergentes: 0 })
  })

  it('ignora pendente, estornado e pagamento com mais de 45 dias', async () => {
    const lista = [
      paga('pay_e', { status: 'PENDING' }),
      paga('pay_f', { status: 'REFUNDED' }),
      paga('pay_g', { dueDate: dia(60), paymentDate: dia(60) }),
    ]
    const r = await reconciliar({ agora: AGORA, modo: 'apply', deps: deps(lista) })
    expect(r).toMatchObject({ cobrancas: 0, divergentes: 0 })
  })

  it('o Asaas fora do ar conta falha e não derruba a passada', async () => {
    const d = { ...deps([]), listarDaAssinatura: async () => Promise.reject(new Error('HTTP 503')) }
    const r = await reconciliar({ agora: AGORA, modo: 'report', deps: d })
    expect(r).toMatchObject({ falhas: 1, divergentes: 0 })
  })
})
