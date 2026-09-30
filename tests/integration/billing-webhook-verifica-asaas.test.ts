/**
 * GAP-011 (auditoria 2026-09-13). O webhook do Asaas chega autenticado só por um token estático; se
 * ele vazar, o payload (`value`/`status`/`subscription`/`dueDate`) é forjável. `aplicarEvento` agora
 * CONFERE o pagamento na API do Asaas (fonte autoritativa) antes de conceder. Aqui o verificador é
 * injetado (stub) — em produção o default é `buscarPagamento` quando `ASAAS_API_KEY` está definida.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let aplicarEvento: any
let subs: any

const evento = (over: Record<string, unknown> = {}) => ({
  id: 'evt_ver',
  event: 'PAYMENT_CONFIRMED',
  payment: {
    id: 'pay_ver',
    subscription: 'sub_1',
    externalReference: 'u-ver',
    value: 39.9,
    dueDate: '2026-10-01',
    ...over,
  },
})

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ aplicarEvento } = (await h.load('../../server/lib/billingEventos')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  await h.cleanup()
})

describe('GAP-011 — o webhook confere o pagamento na API do Asaas', () => {
  it('vale o VALOR REAL da API, não o do payload (payload diz 19,90 — um mês; Asaas diz 179 — o ano)', async () => {
    const u = asUserId('u-ver')
    await subs.upsert(u, { plan: 'premium', status: 'trialing', provider: 'asaas', providerSubscriptionId: 'sub_1' })
    const verificar = async () => ({
      id: 'pay_ver',
      status: 'CONFIRMED',
      value: 179,
      subscription: 'sub_1',
      externalReference: 'u-ver',
    })
    const r = await aplicarEvento(evento({ value: 19.9 }), 'req-t', verificar)
    expect(r.estado).toBe('aplicado')
    const s = await subs.getActive(u)
    expect(s.status).toBe('active')
    expect(s.plan).toBe('premium')
    expect(s.ciclo, 'o valor autoritativo (179) decide o ciclo, não o payload (19,90)').toBe('anual')
  })

  it('payload forja CONFIRMED, mas o Asaas diz PENDING → não aplica, não concede', async () => {
    const u = asUserId('u-ver')
    await subs.upsert(u, { plan: 'premium', status: 'trialing', provider: 'asaas', providerSubscriptionId: 'sub_1' })
    const verificar = async () => ({
      id: 'pay_ver',
      status: 'PENDING',
      value: 39.9,
      subscription: 'sub_1',
      externalReference: 'u-ver',
    })
    const r = await aplicarEvento(evento(), 'req-t', verificar)
    expect(r.estado).toBe('nao-aplicado')
    expect(r.motivo).toMatch(/status PENDING/)
    expect((await subs.getActive(u))?.status).not.toBe('active')
  })

  it('pagamento inexistente no Asaas (evento forjado) → não aplica', async () => {
    const verificar = async () => null
    const r = await aplicarEvento(evento(), 'req-t', verificar)
    expect(r.estado).toBe('nao-aplicado')
    expect(r.motivo).toMatch(/não encontrado/)
  })

  it('sem verificador (self-host/webhook desligado) → comportamento antigo pelo payload', async () => {
    const u = asUserId('u-sem-ver')
    await subs.upsert(u, { plan: 'essencial', status: 'trialing', provider: 'asaas', providerSubscriptionId: 'sub_2' })
    const r = await aplicarEvento(
      {
        id: 'evt_sv',
        event: 'PAYMENT_CONFIRMED',
        payment: { id: 'pay_sv', subscription: 'sub_2', externalReference: 'u-sem-ver', value: 19.9 },
      },
      'req-t',
      undefined,
    )
    expect(r.estado).toBe('aplicado')
    // A intenção era o nome antigo (`essencial`, antes da 0041): o pagamento de 19,90 concede o Premium.
    expect((await subs.getActive(u)).plan).toBe('premium')
  })
})
