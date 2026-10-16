/**
 * O PERÍODO PAGO É O LIMITE DO ACESSO (auditoria de 15/10/2026, bloqueio B1).
 *
 * Os furos presos aqui:
 * 1. `subConcede` devolvia `true` para `active` SEM olhar `currentPeriodEnd`. Uma linha do Asaas que
 *    ficasse `active` sem o evento seguinte chegar (o 12x depois da 12ª parcela, a assinatura removida
 *    no Asaas) virava Premium para sempre.
 * 2. No cartão, o `PAYMENT_RECEIVED` chega uns 30 dias depois do `PAYMENT_CONFIRMED`. Se a pessoa
 *    cancelou no meio (cancelada, com `cancelAtPeriodEnd = 1`), o RECEIVED atrasado — que passa na
 *    conferência da API, porque o pagamento é mesmo `RECEIVED` e a assinatura é a registrada —
 *    regravava `active` e `cancelAtPeriodEnd = 0`: a cancelada voltava a "renovar".
 *
 * O que continua igual: o plano dado pelo admin, SEM período, concede como sempre concedeu.
 *
 * Os verificadores da API são stubs injetados (como em billing-webhook-eventos-que-derrubam).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let aplicarEvento: any
let subs: any
let users: any
let idades: any
let ent: any
let adminRouter: any
let billingRouter: any

const DIA = 86_400_000
const dataIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

/** O pagamento como a API o devolve (`GET /payments/{id}`), por id. Ausente = 404. */
const api =
  (pagamentos: Record<string, Record<string, unknown>>) =>
  async (id: string): Promise<any> =>
    pagamentos[id] ?? null

function rota(router: any, caminho: string, metodo: 'get' | 'post' | 'patch'): (req: any, res: any) => Promise<void> {
  const camada = router.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.[metodo])
  // O último da pilha é a rota; os anteriores são os portões dela (`requireRole`).
  return camada.route.stack[camada.route.stack.length - 1].handle
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
const req = (userId: string, body: unknown = {}, extra: Record<string, unknown> = {}) => ({
  userId: asUserId(userId),
  requestId: 'req-teste',
  path: '/',
  body,
  header: () => undefined,
  ...extra,
})

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  // '' e não `delete`: o dotenv repõe a variável apagada, e com chave o padrão seria a API real.
  process.env.ASAAS_API_KEY = ''
  ;({ aplicarEvento } = (await h.load('../../server/lib/billingEventos')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ usersRepo: users } = (await h.load('../../server/db/repositories/users')) as any)
  ;({ idadesRepo: idades } = (await h.load('../../server/db/repositories/idades')) as any)
  ;({ adminRouter } = (await h.load('../../server/routes/admin')) as any)
  ;({ billingRouter } = (await h.load('../../server/routes/billing')) as any)
  ent = (await h.load('../../server/lib/entitlements')) as any
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  await h.cleanup()
})
afterEach(() => vi.restoreAllMocks())

describe('assinatura active do Asaas obedece ao período', () => {
  it('assinatura active do Asaas com período vencido não concede', async () => {
    const u = asUserId('u-ativa-vencida')
    await subs.upsert(u, {
      plan: 'premium',
      status: 'active',
      provider: 'asaas',
      meio: 'assinatura',
      providerSubscriptionId: 'sub_vencida',
      currentPeriodEnd: Date.now() - DIA,
    })
    expect(await ent.getPlanForUser(u), 'o período pago acabou ontem: sem plano').toBe('free')
  })

  it('a mesma linha com o período à frente concede', async () => {
    const u = asUserId('u-ativa-em-dia')
    await subs.upsert(u, {
      plan: 'premium',
      status: 'active',
      provider: 'asaas',
      meio: 'assinatura',
      providerSubscriptionId: 'sub_em_dia',
      currentPeriodEnd: Date.now() + DIA,
    })
    expect(await ent.getPlanForUser(u)).toBe('premium')
  })
})

describe('o RECEIVED atrasado do cartão não reativa a cancelada', () => {
  /* O que `encerrarAssinatura` grava ao cancelar depois dos 7 dias: cancelada, sem renovar, com o
     fim do período que o Asaas informou. */
  async function cancelada(id: string, fim: number) {
    await subs.upsert(asUserId(id), {
      plan: 'premium',
      status: 'canceled',
      cancelAtPeriodEnd: 1,
      provider: 'asaas',
      meio: 'assinatura',
      providerSubscriptionId: `sub_${id}`,
      currentPeriodEnd: fim,
    })
  }
  const received = (id: string, venc: number) => ({
    evento: {
      id: `evt_received_${id}`,
      event: 'PAYMENT_RECEIVED',
      payment: { id: `pay_${id}`, subscription: `sub_${id}`, externalReference: id },
    },
    api: api({
      [`pay_${id}`]: {
        id: `pay_${id}`,
        status: 'RECEIVED',
        value: 19.9,
        subscription: `sub_${id}`,
        dueDate: dataIso(venc),
        billingType: 'CREDIT_CARD',
        externalReference: id,
      },
    }),
  })

  it('RECEIVED 30 dias depois do cancelamento não reativa', async () => {
    const id = 'u-rec-depois'
    const fim = Date.now() + 2 * DIA
    await cancelada(id, fim)
    const r = received(id, Date.now() - 28 * DIA)
    const res = await aplicarEvento(r.evento, 'req', r.api)
    expect(res.estado).toBe('aplicado')
    const sub = await subs.getActive(asUserId(id))
    expect(sub.status, 'continua cancelada').toBe('canceled')
    expect(sub.cancelAtPeriodEnd, 'continua sem renovar').toBe(1)
    expect(sub.currentPeriodEnd, 'nunca encurta o que já foi pago').toBeGreaterThanOrEqual(fim)
    // O mês pago continua valendo até o fim.
    expect(await ent.getPlanForUser(asUserId(id))).toBe('premium')
  })

  it('RECEIVED que chega depois de o período da cancelada acabar não devolve o plano', async () => {
    const id = 'u-rec-tarde'
    await cancelada(id, Date.now() - 3 * DIA)
    const r = received(id, Date.now() - 40 * DIA)
    await aplicarEvento(r.evento, 'req', r.api)
    const sub = await subs.getActive(asUserId(id))
    expect(sub.status).toBe('canceled')
    expect(await ent.getPlanForUser(asUserId(id)), 'nada de Premium vitalício').toBe('free')
  })

  it('a pessoa que cancelou e ASSINOU DE NOVO é reativada pelo pagamento da assinatura nova', async () => {
    const id = 'u-reassinou'
    const u = asUserId(id)
    await users.ensure(u)
    await idades.declarar(u, '1990-01-01')
    await cancelada(id, Date.now() + 2 * DIA)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = String(input)
      const metodo = String(init?.method ?? 'GET')
      if (metodo === 'POST' && url.endsWith('/customers')) return json({ id: 'cus_novo' })
      if (metodo === 'POST' && url.endsWith('/subscriptions')) return json({ id: 'sub_nova' })
      if (metodo === 'GET' && /\/subscriptions\/[^/]+\/payments/.test(url))
        return json({ data: [{ id: 'pay_nova_1', invoiceUrl: 'https://sandbox.asaas.com/i/n1' }] })
      return json({ erro: 'rota não simulada' }, 404)
    })
    process.env.ASAAS_API_KEY = 'chave-de-teste'
    try {
      const res = mockRes()
      await rota(
        billingRouter,
        '/assinar',
        'post',
      )(req(id, { plano: 'premium', nome: 'Pessoa de Teste', cpfCnpj: '24971563792' }), res)
      expect(res.statusCode).toBe(200)
    } finally {
      process.env.ASAAS_API_KEY = ''
    }
    expect((await subs.getActive(u)).providerSubscriptionId).toBe('sub_nova')

    const r = await aplicarEvento(
      {
        id: 'evt_conf_nova',
        event: 'PAYMENT_CONFIRMED',
        payment: { id: 'pay_nova_1', subscription: 'sub_nova', externalReference: id },
      },
      'req',
      api({
        pay_nova_1: {
          id: 'pay_nova_1',
          status: 'CONFIRMED',
          value: 19.9,
          subscription: 'sub_nova',
          dueDate: dataIso(Date.now()),
          externalReference: id,
        },
      }),
    )
    expect(r.estado).toBe('aplicado')
    const sub = await subs.getActive(u)
    expect(sub).toMatchObject({ status: 'active', cancelAtPeriodEnd: 0 })
  })
})

describe('o 12x acaba no fim do ano pago', () => {
  it('12x expira depois do ano', async () => {
    const id = 'u-12x-velho'
    const u = asUserId(id)
    // A 1ª parcela venceu há 380 dias: o ano pago (vencimento + 370 dias) já acabou.
    const primeira = Date.now() - 380 * DIA
    await subs.upsert(u, {
      provider: 'asaas',
      plan: 'premium',
      status: 'trialing',
      ciclo: 'anual',
      meio: 'parcelamento',
      providerInstallmentId: 'ins_velho',
    })
    const r = await aplicarEvento(
      {
        id: 'evt_12x_velho',
        event: 'PAYMENT_CONFIRMED',
        payment: { id: 'ins_velho_p1', installment: 'ins_velho', externalReference: id },
      },
      'req',
      api({
        ins_velho_p1: {
          id: 'ins_velho_p1',
          status: 'CONFIRMED',
          value: 12.49,
          installment: 'ins_velho',
          installmentNumber: 1,
          billingType: 'CREDIT_CARD',
          dueDate: dataIso(primeira),
          externalReference: id,
        },
      }),
    )
    expect(r.estado).toBe('aplicado')
    const sub = await subs.getActive(u)
    expect(sub.currentPeriodEnd, 'o ano tem fim gravado').toBeLessThan(Date.now())
    expect(await ent.getPlanForUser(u), 'o 12x não renova: depois do ano, sem plano').toBe('free')
  })

  it('quem teve o 12x vencido pode comprar de novo (não é "já assinante")', async () => {
    const id = 'u-12x-recompra'
    const u = asUserId(id)
    await users.ensure(u)
    await idades.declarar(u, '1990-01-01')
    await subs.upsert(u, {
      provider: 'asaas',
      plan: 'premium',
      status: 'active',
      ciclo: 'anual',
      meio: 'parcelamento',
      providerInstallmentId: 'ins_acabou',
      currentPeriodEnd: Date.now() - DIA,
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = String(input)
      const metodo = String(init?.method ?? 'GET')
      if (metodo === 'POST' && url.endsWith('/customers')) return json({ id: 'cus_novo' })
      if (metodo === 'POST' && url.endsWith('/subscriptions')) return json({ id: 'sub_recompra' })
      if (metodo === 'GET' && /\/subscriptions\/[^/]+\/payments/.test(url))
        return json({ data: [{ id: 'pay_r1', invoiceUrl: 'https://sandbox.asaas.com/i/r1' }] })
      return json({ erro: 'rota não simulada' }, 404)
    })
    process.env.ASAAS_API_KEY = 'chave-de-teste'
    try {
      const res = mockRes()
      await rota(
        billingRouter,
        '/assinar',
        'post',
      )(req(id, { plano: 'premium', nome: 'Pessoa de Teste', cpfCnpj: '24971563792' }), res)
      expect(res.statusCode, JSON.stringify(res.body)).toBe(200)
    } finally {
      process.env.ASAAS_API_KEY = ''
    }
  })
})

describe('o plano dado pelo admin, sem período, continua concedendo', () => {
  it('admin sem período continua concedendo', async () => {
    const alvo = 'u-admin-sem-periodo'
    await users.ensure(asUserId(alvo))
    const res = mockRes()
    await rota(
      adminRouter,
      '/users/:id/plan',
      'patch',
    )(req('admin', { plan: 'premium' }, { params: { id: alvo } }), res)
    expect(res.statusCode).toBe(200)
    const sub = await subs.getActive(asUserId(alvo))
    expect(sub.currentPeriodEnd).toBeNull()
    expect(await ent.getPlanForUser(asUserId(alvo))).toBe('premium')
  })

  it('o admin concede por cima de uma assinatura do Asaas que já venceu', async () => {
    const alvo = 'u-admin-sobre-vencida'
    const u = asUserId(alvo)
    await users.ensure(u)
    await subs.upsert(u, {
      plan: 'premium',
      status: 'active',
      provider: 'asaas',
      meio: 'assinatura',
      providerSubscriptionId: 'sub_admin_vencida',
      currentPeriodEnd: Date.now() - 10 * DIA,
    })
    expect(await ent.getPlanForUser(u)).toBe('free')
    const res = mockRes()
    await rota(
      adminRouter,
      '/users/:id/plan',
      'patch',
    )(req('admin', { plan: 'premium' }, { params: { id: alvo } }), res)
    expect(res.statusCode).toBe(200)
    expect(await ent.getPlanForUser(u), 'a concessão do operador não tem fim').toBe('premium')
  })
})
