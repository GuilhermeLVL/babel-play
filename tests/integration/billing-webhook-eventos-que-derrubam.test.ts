/**
 * OS EVENTOS QUE TIRAM O PLANO — atraso, estorno, chargeback, cobrança removida e assinatura
 * removida/inativada (auditoria de cobrança de 02/10/2026).
 *
 * Dois furos, presos aqui antes do conserto:
 *
 * 1. O QUE CAÍA NO `default`. Chargeback pedido (`PAYMENT_CHARGEBACK_REQUESTED`), em disputa
 *    (`PAYMENT_CHARGEBACK_DISPUTE`), revertido a favor do lojista (`PAYMENT_AWAITING_CHARGEBACK_REVERSAL`),
 *    cobrança removida (`PAYMENT_DELETED`) e assinatura inativada (`SUBSCRIPTION_INACTIVATED`) eram
 *    "evento-nao-tratado": quem contestava a compra no cartão ficava com o ano de acesso E com o
 *    dinheiro de volta.
 *
 * 2. O QUE ERA APLICADO SÓ COM O PAYLOAD. O GAP-011 passou a conferir o pagamento CONFIRMADO na API
 *    do Asaas, mas atraso, estorno e assinatura removida continuavam valendo pelo que o corpo dizia —
 *    e o webhook é autenticado por um token estático. Vazado, ele derrubava o plano de qualquer
 *    conta com um POST. Agora a API confirma antes; se não confirma, o evento fica `nao-aplicado`
 *    (fila do admin) e NADA cai.
 *
 * Os verificadores são stubs injetados, como em `billing-webhook-verifica-asaas.test.ts`: nenhum
 * teste fala com o Asaas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let aplicarEvento: any
let subs: any
let ent: any
let credits: any

const DIA = 86_400_000

/** O pagamento como a API o devolve (`GET /payments/{id}`), por id. `undefined` = 404. */
const api =
  (pagamentos: Record<string, Record<string, unknown>>) =>
  async (id: string): Promise<any> =>
    pagamentos[id] ?? null
/** A assinatura como a API a devolve (`GET /subscriptions/{id}`), por id. `undefined` = 404. */
const apiDeAssinaturas = api

/** Não pode ser chamado: prova que um caminho NÃO consulta a API. */
const naoChamar = async (): Promise<any> => {
  throw new Error('a API não devia ter sido consultada')
}

async function assinante(id: string, patch: Record<string, unknown> = {}) {
  await subs.upsert(asUserId(id), {
    plan: 'premium',
    status: 'active',
    provider: 'asaas',
    meio: 'assinatura',
    providerSubscriptionId: `sub_${id}`,
    currentPeriodEnd: Date.now() + 20 * DIA,
    ...patch,
  })
}

const evPagamento = (event: string, userId: string, payment: Record<string, unknown> = {}) => ({
  id: `evt_${event}_${userId}`,
  event,
  payment: { id: `pay_${userId}`, subscription: `sub_${userId}`, externalReference: userId, ...payment },
})
const evAssinatura = (event: string, userId: string, subId = `sub_${userId}`) => ({
  id: `evt_${event}_${userId}`,
  event,
  subscription: { id: subId, externalReference: userId },
})

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  // '' e não `delete`: o dotenv repõe a variável apagada, e com chave o padrão seria a API real.
  process.env.ASAAS_API_KEY = ''
  ;({ aplicarEvento } = (await h.load('../../server/lib/billingEventos')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ creditsRepo: credits } = (await h.load('../../server/db/repositories/credits')) as any)
  ent = (await h.load('../../server/lib/entitlements')) as any
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  await h.cleanup()
})

describe('furo 2 — atraso, estorno e assinatura removida são conferidos na API antes de derrubar', () => {
  it('PAYMENT_OVERDUE forjado (a API diz PENDING) não marca atraso', async () => {
    await assinante('u-od-forjado')
    const r = await aplicarEvento(
      evPagamento('PAYMENT_OVERDUE', 'u-od-forjado'),
      'req',
      api({
        'pay_u-od-forjado': {
          id: 'pay_u-od-forjado',
          status: 'PENDING',
          value: 19.9,
          subscription: 'sub_u-od-forjado',
          externalReference: 'u-od-forjado',
        },
      }),
    )
    expect(r.estado).toBe('nao-aplicado')
    expect(r.motivo).toMatch(/status PENDING/)
    expect((await subs.getActive(asUserId('u-od-forjado'))).status).toBe('active')
  })

  it('PAYMENT_OVERDUE de um pagamento que não existe na API não marca atraso', async () => {
    await assinante('u-od-404')
    const r = await aplicarEvento(evPagamento('PAYMENT_OVERDUE', 'u-od-404'), 'req', api({}))
    expect(r.estado).toBe('nao-aplicado')
    expect(r.motivo).toMatch(/não encontrado/)
    expect((await subs.getActive(asUserId('u-od-404'))).status).toBe('active')
  })

  it('PAYMENT_OVERDUE confirmado pela API marca past_due', async () => {
    await assinante('u-od-real')
    const r = await aplicarEvento(
      evPagamento('PAYMENT_OVERDUE', 'u-od-real'),
      'req',
      api({
        'pay_u-od-real': {
          id: 'pay_u-od-real',
          status: 'OVERDUE',
          value: 19.9,
          subscription: 'sub_u-od-real',
          externalReference: 'u-od-real',
        },
      }),
    )
    expect(r.estado).toBe('aplicado')
    expect((await subs.getActive(asUserId('u-od-real'))).status).toBe('past_due')
  })

  it('o atraso que chegou depois de a fatura ser paga é ignorado — nem derruba nem vira pendência', async () => {
    await assinante('u-od-pago')
    const r = await aplicarEvento(
      evPagamento('PAYMENT_OVERDUE', 'u-od-pago'),
      'req',
      api({
        'pay_u-od-pago': {
          id: 'pay_u-od-pago',
          status: 'RECEIVED',
          value: 19.9,
          subscription: 'sub_u-od-pago',
          externalReference: 'u-od-pago',
        },
      }),
    )
    expect(r.estado).toBe('ignorado')
    expect((await subs.getActive(asUserId('u-od-pago'))).status).toBe('active')
  })

  it('o DONO vem da API: atraso real de OUTRA conta com o alvo no payload não toca no alvo', async () => {
    await assinante('u-od-vitima')
    await assinante('u-od-devedor')
    const r = await aplicarEvento(
      // O payload aponta a vítima; o pagamento (real, vencido) é do devedor.
      evPagamento('PAYMENT_OVERDUE', 'u-od-vitima', { id: 'pay_do_devedor' }),
      'req',
      api({
        pay_do_devedor: {
          id: 'pay_do_devedor',
          status: 'OVERDUE',
          value: 19.9,
          subscription: 'sub_u-od-devedor',
          externalReference: 'u-od-devedor',
        },
      }),
    )
    expect(r.estado).toBe('aplicado')
    expect((await subs.getActive(asUserId('u-od-vitima'))).status).toBe('active')
    expect((await subs.getActive(asUserId('u-od-devedor'))).status).toBe('past_due')
  })

  it('a compra de créditos abandonada (avulsa vencida) não põe o assinante em atraso', async () => {
    await assinante('u-od-avulsa')
    const r = await aplicarEvento(
      { id: 'evt_od_av', event: 'PAYMENT_OVERDUE', payment: { id: 'pay_cred_od', externalReference: 'u-od-avulsa' } },
      'req',
      api({ pay_cred_od: { id: 'pay_cred_od', status: 'OVERDUE', value: 9.9, externalReference: 'u-od-avulsa' } }),
    )
    expect(r.estado).toBe('ignorado')
    expect((await subs.getActive(asUserId('u-od-avulsa'))).status).toBe('active')
  })

  it('atraso de uma assinatura ANTIGA (não é a registrada) fica pendente, sem tocar na atual', async () => {
    await assinante('u-od-antiga')
    const r = await aplicarEvento(
      evPagamento('PAYMENT_OVERDUE', 'u-od-antiga', { subscription: 'sub_velha' }),
      'req',
      api({
        'pay_u-od-antiga': {
          id: 'pay_u-od-antiga',
          status: 'OVERDUE',
          value: 19.9,
          subscription: 'sub_velha',
          externalReference: 'u-od-antiga',
        },
      }),
    )
    expect(r.estado).toBe('nao-aplicado')
    expect(r.motivo).toMatch(/divergente/)
    expect((await subs.getActive(asUserId('u-od-antiga'))).status).toBe('active')
  })

  it('PAYMENT_REFUNDED forjado (a API diz RECEIVED) não revoga o plano', async () => {
    await assinante('u-rf-forjado')
    const r = await aplicarEvento(
      evPagamento('PAYMENT_REFUNDED', 'u-rf-forjado'),
      'req',
      api({
        'pay_u-rf-forjado': {
          id: 'pay_u-rf-forjado',
          status: 'RECEIVED',
          value: 19.9,
          subscription: 'sub_u-rf-forjado',
          externalReference: 'u-rf-forjado',
        },
      }),
    )
    expect(r.estado).toBe('nao-aplicado')
    expect(r.motivo).toMatch(/status RECEIVED/)
    expect(await ent.getPlanForUser(asUserId('u-rf-forjado'))).toBe('premium')
  })

  it('PAYMENT_REFUNDED confirmado pela API revoga o período na hora', async () => {
    await assinante('u-rf-real')
    const r = await aplicarEvento(
      evPagamento('PAYMENT_REFUNDED', 'u-rf-real'),
      'req',
      api({
        'pay_u-rf-real': {
          id: 'pay_u-rf-real',
          status: 'REFUNDED',
          value: 19.9,
          subscription: 'sub_u-rf-real',
          externalReference: 'u-rf-real',
        },
      }),
    )
    expect(r.estado).toBe('aplicado')
    expect(await ent.getPlanForUser(asUserId('u-rf-real'))).toBe('free')
  })

  it('estorno forjado de compra de créditos não cancela a compra paga', async () => {
    const u = asUserId('u-rf-credito')
    await credits.registrarCompra(u, { sku: 'c100', creditos: 100, valorCentavos: 990, providerPaymentId: 'pay_cr1' })
    await credits.confirmarPagamento('pay_cr1')
    expect(await credits.saldo(u)).toBe(100)
    const r = await aplicarEvento(
      { id: 'evt_rf_cr', event: 'PAYMENT_REFUNDED', payment: { id: 'pay_cr1', externalReference: 'u-rf-credito' } },
      'req',
      api({ pay_cr1: { id: 'pay_cr1', status: 'RECEIVED', value: 9.9, externalReference: 'u-rf-credito' } }),
    )
    expect(r.estado).toBe('nao-aplicado')
    expect(await credits.saldo(u)).toBe(100)
  })

  it('o payload não decide se é avulsa: parcela de assinatura estornada (API) revoga o plano', async () => {
    await assinante('u-rf-tipo')
    const r = await aplicarEvento(
      // Sem `subscription` no payload: pelo corpo, pareceria estorno de créditos.
      { id: 'evt_rf_tipo', event: 'PAYMENT_REFUNDED', payment: { id: 'pay_tipo', externalReference: 'u-rf-tipo' } },
      'req',
      api({
        pay_tipo: {
          id: 'pay_tipo',
          status: 'REFUNDED',
          value: 19.9,
          subscription: 'sub_u-rf-tipo',
          externalReference: 'u-rf-tipo',
        },
      }),
    )
    expect(r.estado).toBe('aplicado')
    expect(await ent.getPlanForUser(asUserId('u-rf-tipo'))).toBe('free')
  })

  it('SUBSCRIPTION_DELETED forjado (a API diz ACTIVE) não cancela', async () => {
    await assinante('u-sd-forjado')
    const r = await aplicarEvento(
      evAssinatura('SUBSCRIPTION_DELETED', 'u-sd-forjado'),
      'req',
      naoChamar,
      false,
      apiDeAssinaturas({
        'sub_u-sd-forjado': {
          id: 'sub_u-sd-forjado',
          status: 'ACTIVE',
          deleted: false,
          externalReference: 'u-sd-forjado',
        },
      }),
    )
    expect(r.estado).toBe('nao-aplicado')
    expect(r.motivo).toMatch(/ACTIVE/)
    expect((await subs.getActive(asUserId('u-sd-forjado'))).status).toBe('active')
  })

  it('SUBSCRIPTION_DELETED confirmado (removida na API) para a renovação e mantém o período pago', async () => {
    await assinante('u-sd-real')
    const antes = (await subs.getActive(asUserId('u-sd-real'))).currentPeriodEnd
    const r = await aplicarEvento(
      evAssinatura('SUBSCRIPTION_DELETED', 'u-sd-real'),
      'req',
      naoChamar,
      false,
      apiDeAssinaturas({
        'sub_u-sd-real': { id: 'sub_u-sd-real', status: 'ACTIVE', deleted: true, externalReference: 'u-sd-real' },
      }),
    )
    expect(r.estado).toBe('aplicado')
    const s = await subs.getActive(asUserId('u-sd-real'))
    expect(s.status).toBe('canceled')
    expect(s.currentPeriodEnd, 'o que foi pago continua valendo').toBe(antes)
    expect(await ent.getPlanForUser(asUserId('u-sd-real'))).toBe('premium')
  })

  it('SUBSCRIPTION_DELETED da assinatura REGISTRADA que já não existe na API (404) também cancela', async () => {
    await assinante('u-sd-404')
    const r = await aplicarEvento(
      evAssinatura('SUBSCRIPTION_DELETED', 'u-sd-404'),
      'req',
      naoChamar,
      false,
      apiDeAssinaturas({}),
    )
    expect(r.estado).toBe('aplicado')
    expect((await subs.getActive(asUserId('u-sd-404'))).status).toBe('canceled')
  })

  it('SUBSCRIPTION_DELETED de uma assinatura que não é a registrada não cancela a atual', async () => {
    await assinante('u-sd-outra')
    const r = await aplicarEvento(
      evAssinatura('SUBSCRIPTION_DELETED', 'u-sd-outra', 'sub_inventada'),
      'req',
      naoChamar,
      false,
      apiDeAssinaturas({}),
    )
    expect(r.estado).not.toBe('aplicado')
    expect((await subs.getActive(asUserId('u-sd-outra'))).status).toBe('active')
  })

  it('SUBSCRIPTION_DELETED de assinatura que a API diz ser de OUTRO cliente não cancela', async () => {
    // Linha sem id do provedor (concedida pelo admin): só a API poderia dizer de quem é.
    await assinante('u-sd-alheia', { providerSubscriptionId: null, meio: null })
    const r = await aplicarEvento(
      evAssinatura('SUBSCRIPTION_DELETED', 'u-sd-alheia', 'sub_de_outro'),
      'req',
      naoChamar,
      false,
      apiDeAssinaturas({ sub_de_outro: { id: 'sub_de_outro', deleted: true, externalReference: 'outra-conta' } }),
    )
    expect(r.estado).toBe('nao-aplicado')
    expect((await subs.getActive(asUserId('u-sd-alheia'))).status).toBe('active')
  })

  it('API fora do ar: a exceção sobe (o webhook responde 500 e o Asaas reentrega), nada cai', async () => {
    await assinante('u-fora')
    const fora = async (): Promise<any> => {
      throw new Error('Asaas /payments/x → HTTP 503: instável')
    }
    await expect(aplicarEvento(evPagamento('PAYMENT_REFUNDED', 'u-fora'), 'req', fora)).rejects.toThrow(/503/)
    await expect(
      aplicarEvento(evAssinatura('SUBSCRIPTION_DELETED', 'u-fora'), 'req', naoChamar, false, fora),
    ).rejects.toThrow(/503/)
    expect((await subs.getActive(asUserId('u-fora'))).status).toBe('active')
  })
})

describe('furo 1 — chargeback, cobrança removida e assinatura inativada têm efeito', () => {
  const emDisputa = (id: string, extra: Record<string, unknown>) =>
    api({ [id]: { id, status: 'CHARGEBACK_REQUESTED', value: 19.9, ...extra } })

  it('PAYMENT_CHARGEBACK_REQUESTED de parcela da assinatura termina o acesso agora', async () => {
    await assinante('u-cb')
    const r = await aplicarEvento(
      evPagamento('PAYMENT_CHARGEBACK_REQUESTED', 'u-cb'),
      'req',
      emDisputa('pay_u-cb', { subscription: 'sub_u-cb', externalReference: 'u-cb' }),
    )
    expect(r.estado).toBe('aplicado')
    const s = await subs.getActive(asUserId('u-cb'))
    expect(s.status).toBe('canceled')
    expect(s.currentPeriodEnd).toBeLessThanOrEqual(Date.now())
    expect(await ent.getPlanForUser(asUserId('u-cb'))).toBe('free')
  })

  it('PAYMENT_CHARGEBACK_REQUESTED de parcela do 12x termina o ano', async () => {
    await assinante('u-cb-12x', {
      meio: 'parcelamento',
      ciclo: 'anual',
      providerSubscriptionId: null,
      providerInstallmentId: 'ins_cb',
      currentPeriodEnd: Date.now() + 300 * DIA,
    })
    const r = await aplicarEvento(
      {
        id: 'evt_cb_12x',
        event: 'PAYMENT_CHARGEBACK_REQUESTED',
        payment: { id: 'ins_cb_p3', installment: 'ins_cb', externalReference: 'u-cb-12x' },
      },
      'req',
      emDisputa('ins_cb_p3', { installment: 'ins_cb', installmentNumber: 3, externalReference: 'u-cb-12x' }),
    )
    expect(r.estado).toBe('aplicado')
    expect(await ent.getPlanForUser(asUserId('u-cb-12x'))).toBe('free')
  })

  it('PAYMENT_CHARGEBACK_REQUESTED de compra de créditos cancela a compra', async () => {
    const u = asUserId('u-cb-credito')
    await credits.registrarCompra(u, { sku: 'c100', creditos: 100, valorCentavos: 990, providerPaymentId: 'pay_cb_cr' })
    await credits.confirmarPagamento('pay_cb_cr')
    expect(await credits.saldo(u)).toBe(100)
    const r = await aplicarEvento(
      {
        id: 'evt_cb_cr',
        event: 'PAYMENT_CHARGEBACK_REQUESTED',
        payment: { id: 'pay_cb_cr', externalReference: 'u-cb-credito' },
      },
      'req',
      emDisputa('pay_cb_cr', { externalReference: 'u-cb-credito' }),
    )
    expect(r.estado).toBe('aplicado')
    expect(await credits.saldo(u)).toBe(0)
  })

  it('PAYMENT_CHARGEBACK_DISPUTE (contestamos, o dinheiro segue retido) também termina o acesso', async () => {
    await assinante('u-cb-disputa')
    const r = await aplicarEvento(
      evPagamento('PAYMENT_CHARGEBACK_DISPUTE', 'u-cb-disputa'),
      'req',
      api({
        'pay_u-cb-disputa': {
          id: 'pay_u-cb-disputa',
          status: 'CHARGEBACK_DISPUTE',
          value: 19.9,
          subscription: 'sub_u-cb-disputa',
          externalReference: 'u-cb-disputa',
        },
      }),
    )
    expect(r.estado).toBe('aplicado')
    expect(await ent.getPlanForUser(asUserId('u-cb-disputa'))).toBe('free')
  })

  it('chargeback forjado (a API diz RECEIVED) não derruba', async () => {
    await assinante('u-cb-forjado')
    const r = await aplicarEvento(
      evPagamento('PAYMENT_CHARGEBACK_REQUESTED', 'u-cb-forjado'),
      'req',
      api({
        'pay_u-cb-forjado': {
          id: 'pay_u-cb-forjado',
          status: 'RECEIVED',
          value: 19.9,
          subscription: 'sub_u-cb-forjado',
          externalReference: 'u-cb-forjado',
        },
      }),
    )
    expect(r.estado).toBe('nao-aplicado')
    expect(await ent.getPlanForUser(asUserId('u-cb-forjado'))).toBe('premium')
  })

  it('sem verificador (self-host), o chargeback vale pelo payload — como o estorno', async () => {
    await assinante('u-cb-payload')
    const r = await aplicarEvento(evPagamento('PAYMENT_CHARGEBACK_REQUESTED', 'u-cb-payload'), 'req', undefined)
    expect(r.estado).toBe('aplicado')
    expect(await ent.getPlanForUser(asUserId('u-cb-payload'))).toBe('free')
  })

  it('PAYMENT_AWAITING_CHARGEBACK_REVERSAL (ganhamos a disputa) não derruba nada e não consulta a API', async () => {
    await assinante('u-cb-rev')
    const r = await aplicarEvento(evPagamento('PAYMENT_AWAITING_CHARGEBACK_REVERSAL', 'u-cb-rev'), 'req', naoChamar)
    expect(r.estado).toBe('ignorado')
    expect(r.motivo).toMatch(/chargeback/i)
    expect(r.motivo).not.toMatch(/evento-nao-tratado/)
    expect(await ent.getPlanForUser(asUserId('u-cb-rev'))).toBe('premium')
  })

  it('PAYMENT_DELETED de compra de créditos pendente cancela a compra (a cobrança não existe mais)', async () => {
    const u = asUserId('u-del-credito')
    await credits.registrarCompra(u, {
      sku: 'c100',
      creditos: 100,
      valorCentavos: 990,
      providerPaymentId: 'pay_del_cr',
    })
    const r = await aplicarEvento(
      { id: 'evt_del_cr', event: 'PAYMENT_DELETED', payment: { id: 'pay_del_cr', externalReference: 'u-del-credito' } },
      'req',
      api({
        pay_del_cr: {
          id: 'pay_del_cr',
          status: 'PENDING',
          deleted: true,
          value: 9.9,
          externalReference: 'u-del-credito',
        },
      }),
    )
    expect(r.estado).toBe('aplicado')
    expect((await credits.comprasDoUsuario(u, 5))[0].status).toBe('cancelado')
  })

  it('PAYMENT_DELETED forjado (a cobrança segue de pé na API) não cancela a compra paga', async () => {
    const u = asUserId('u-del-forjado')
    await credits.registrarCompra(u, { sku: 'c100', creditos: 100, valorCentavos: 990, providerPaymentId: 'pay_del_f' })
    await credits.confirmarPagamento('pay_del_f')
    const r = await aplicarEvento(
      { id: 'evt_del_f', event: 'PAYMENT_DELETED', payment: { id: 'pay_del_f', externalReference: 'u-del-forjado' } },
      'req',
      api({
        pay_del_f: {
          id: 'pay_del_f',
          status: 'RECEIVED',
          deleted: false,
          value: 9.9,
          externalReference: 'u-del-forjado',
        },
      }),
    )
    expect(r.estado).toBe('nao-aplicado')
    expect(await credits.saldo(u)).toBe(100)
  })

  it('PAYMENT_DELETED de fatura da assinatura não mexe no plano (quem decide é o evento da assinatura)', async () => {
    await assinante('u-del-fatura')
    const r = await aplicarEvento(
      evPagamento('PAYMENT_DELETED', 'u-del-fatura'),
      'req',
      api({
        'pay_u-del-fatura': {
          id: 'pay_u-del-fatura',
          status: 'PENDING',
          deleted: true,
          value: 19.9,
          subscription: 'sub_u-del-fatura',
          externalReference: 'u-del-fatura',
        },
      }),
    )
    expect(r.estado).toBe('ignorado')
    expect(r.motivo).not.toMatch(/evento-nao-tratado/)
    expect((await subs.getActive(asUserId('u-del-fatura'))).status).toBe('active')
  })

  it('SUBSCRIPTION_INACTIVATED para a renovação e mantém o período pago', async () => {
    await assinante('u-inat')
    const antes = (await subs.getActive(asUserId('u-inat'))).currentPeriodEnd
    const r = await aplicarEvento(
      evAssinatura('SUBSCRIPTION_INACTIVATED', 'u-inat'),
      'req',
      naoChamar,
      false,
      apiDeAssinaturas({
        'sub_u-inat': { id: 'sub_u-inat', status: 'INACTIVE', deleted: false, externalReference: 'u-inat' },
      }),
    )
    expect(r.estado).toBe('aplicado')
    const s = await subs.getActive(asUserId('u-inat'))
    expect(s.status).toBe('canceled')
    expect(s.currentPeriodEnd).toBe(antes)
    expect(await ent.getPlanForUser(asUserId('u-inat'))).toBe('premium')
  })

  it('SUBSCRIPTION_INACTIVATED forjado (a API diz ACTIVE) não cancela', async () => {
    await assinante('u-inat-f')
    const r = await aplicarEvento(
      evAssinatura('SUBSCRIPTION_INACTIVATED', 'u-inat-f'),
      'req',
      naoChamar,
      false,
      apiDeAssinaturas({
        'sub_u-inat-f': { id: 'sub_u-inat-f', status: 'ACTIVE', deleted: false, externalReference: 'u-inat-f' },
      }),
    )
    expect(r.estado).toBe('nao-aplicado')
    expect((await subs.getActive(asUserId('u-inat-f'))).status).toBe('active')
  })
})
