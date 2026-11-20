/**
 * DOIS CASOS DE BORDA DA COBRANÇA QUE NÃO TINHAM TESTE (plano de garantias, Fase 2):
 *
 * 1. PARCELA AMBÍGUA. R$ 12,49 é a última parcela do 12x do Plus e a parcela padrão do Premium. Sem vínculo
 *    confiável com o plano do parcelamento o webhook NÃO concede por palpite (nem o mais barato): fica `nao-aplicado`
 *    com o porquê e um aviso que alerta (`billing_parcela_ambigua`). Com o plano registrado no parcelamento, o
 *    desempate é dele e o pagamento é aplicado.
 * 2. CONFIRMAÇÃO TARDIA DEPOIS DO ESTORNO. O Asaas reentrega: um `CONFIRMED` que chega quando a API já diz
 *    `REFUNDED` (ou chargeback) não concede nada, e é um caso RESOLVIDO (`ignorado`), não uma pendência: como
 *    `nao-aplicado` ficaria para sempre na fila do admin e deixaria o vigia de saúde vermelho.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let subs: any
let idades: any
let aplicarEvento: any
let eventos: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ idadesRepo: idades } = (await h.load('../../server/db/repositories/idades')) as any)
  ;({ billingEventsRepo: eventos } = (await h.load('../../server/db/repositories/billingEvents')) as any)
  ;({ aplicarEvento } = (await h.load('../../server/lib/billingEventos')) as any)
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  await h.cleanup()
})
afterEach(() => vi.restoreAllMocks())

const adulto = (u: string) => idades.declarar(asUserId(u), '1990-01-01')
const pagamento = (id: string, u: string, extra: Record<string, unknown>) => ({
  id,
  status: 'CONFIRMED',
  value: 12.49,
  installment: `ins_${u}`,
  installmentNumber: 3,
  billingType: 'CREDIT_CARD',
  externalReference: u,
  dueDate: '2026-12-01',
  ...extra,
})
const evento = (id: string, pay: string, u: string, tipo = 'PAYMENT_CONFIRMED') => ({
  id,
  event: tipo,
  payment: { id: pay, externalReference: u },
})

describe('parcela ambígua (R$ 12,49: Plus e Premium)', () => {
  it('sem vínculo com o plano do parcelamento: não concede, fica pendente e avisa', async () => {
    const u = 'u-ambigua'
    await adulto(u)
    await subs.upsert(asUserId(u), { plan: 'premium', status: 'trialing', meio: 'parcelamento' })
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await aplicarEvento(evento('evt_amb_1', 'pay_amb', u), 'req', async () => pagamento('pay_amb', u, {}))
    expect(r.estado).toBe('nao-aplicado')
    expect(r.motivo).toMatch(/parcela-desconhecida/)
    expect(r.motivo).toContain('12.49')
    expect((await subs.getActive(asUserId(u))).status).toBe('trialing')
    expect(aviso.mock.calls.flat().join(' ')).toContain('billing_parcela_ambigua')
  })

  it('com o plano registrado no parcelamento, o desempate é dele e o pagamento é aplicado', async () => {
    for (const plano of ['plus', 'premium'] as const) {
      const u = `u-desempate-${plano}`
      await adulto(u)
      await subs.upsert(asUserId(u), {
        plan: plano,
        planoDaCobranca: plano,
        status: 'trialing',
        meio: 'parcelamento',
        providerInstallmentId: `ins_${u}`,
      })
      const r = await aplicarEvento(evento(`evt_${u}`, `pay_${u}`, u), 'req', async () => pagamento(`pay_${u}`, u, {}))
      expect(r.estado, plano).toBe('aplicado')
      expect((await subs.getActive(asUserId(u))).plan, plano).toBe(plano)
    }
  })
})

describe('confirmação que chega depois do estorno', () => {
  const desfeitos = ['REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE']

  it.each(desfeitos)('API diz %s: não concede, e é `ignorado` (não pendência)', async (status) => {
    const u = `u-tardio-${status}`
    await adulto(u)
    await subs.upsert(asaasUser(u), { plan: 'premium', status: 'trialing' })
    const r = await aplicarEvento(evento(`evt_${u}`, `pay_${u}`, u), 'req', async () =>
      pagamento(`pay_${u}`, u, { status, value: 19.9, installment: undefined, subscription: 'sub_x' }),
    )
    expect(r.estado).toBe('ignorado')
    expect(r.motivo).toContain(status)
    expect((await subs.getActive(asaasUser(u))).status).toBe('trialing')
  })

  it('um status ainda não confirmado (PENDING) continua pendência, não é "desfeito"', async () => {
    const u = 'u-pendente-asaas'
    await adulto(u)
    await subs.upsert(asaasUser(u), { plan: 'premium', status: 'trialing' })
    const r = await aplicarEvento(evento('evt_p', 'pay_p', u), 'req', async () =>
      pagamento('pay_p', u, { status: 'PENDING', value: 19.9, installment: undefined, subscription: 'sub_x' }),
    )
    expect(r.estado).toBe('nao-aplicado')
  })

  it('pelo webhook: o evento fica `ignorado` e NÃO entra na lista de pendências do admin', async () => {
    const id = 'evt_tardio_fila'
    await eventos.marcarSeNovo(id, 'asaas', 'PAYMENT_CONFIRMED', 'u-fila', 'pay_fila', { event: 'PAYMENT_CONFIRMED' })
    await eventos.registrarResultado(id, 'ignorado', 'pagamento pay_fila já REFUNDED no Asaas: nada a conceder')
    const pendentes = await eventos.listarPendentes()
    expect(pendentes.map((p: any) => p.id)).not.toContain(id)
  })
})

function asaasUser(u: string) {
  return asUserId(u)
}
