/**
 * EXCLUIR A CONTA CANCELA A COBRANÇA ANTES DE APAGAR (Fase 3 do plano de lançamento).
 *
 * Antes, `DELETE /api/me` apagava as 17 tabelas e o Asaas continuava cobrando todo mês um cartão
 * cuja conta já não existia — e, sem a linha em `subscriptions`, nem o suporte saberia de quem era.
 *
 * Contratos:
 * 1. Com assinatura no provedor, a exclusão cancela no Asaas PRIMEIRO; só depois apaga.
 * 2. Se o cancelamento falha, NADA é apagado e a resposta explica (o titular tenta de novo).
 * 3. Sem assinatura, a exclusão segue sem falar com o Asaas.
 * 4. O ANUAL EM 12x passa pelo mesmo caminho (auditoria de cobrança de 02/10/2026). Ele é um
 *    PARCELAMENTO: `providerSubscriptionId` é nulo e o id fica em `providerInstallmentId`. A rota
 *    só olhava o primeiro, então quem comprou o 12x e apagou a conta dentro dos 7 dias perdia o
 *    estorno do arrependimento — e a fatura ainda em aberto de um checkout não pago ficava pagável
 *    no Asaas, em nome de uma conta que já não existia.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let meRouter: any
let subs: any
let users: any

function handler(): (req: any, res: any) => Promise<void> {
  const camada = meRouter.stack.find((l: any) => l.route?.path === '/' && l.route?.methods?.delete)
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
const req = (userId: string) => ({
  userId: asUserId(userId),
  requestId: 'req-teste',
  path: '/',
  body: { confirmar: true },
})
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

beforeAll(async () => {
  h = await setupEphemeralDb()
  // Modo aberto: o vínculo de login não existe, então a exclusão só depende do Asaas.
  process.env.AUTH_REQUIRED = '0'
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  ;({ meRouter } = (await h.load('../../server/routes/me')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ usersRepo: users } = (await h.load('../../server/db/repositories/users')) as any)
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  delete process.env.ASAAS_API_KEY
  await h.cleanup()
})
afterEach(() => vi.restoreAllMocks())

async function assinante(id: string, subId: string) {
  await users.ensure(asUserId(id))
  await subs.upsert(asUserId(id), {
    provider: 'asaas',
    providerCustomerId: `cus_${id}`,
    providerSubscriptionId: subId,
    plan: 'pro',
    status: 'active',
    currentPeriodEnd: Date.now() + 20 * 86_400_000,
  })
}

async function assinanteDo12x(id: string, insId: string, patch: Record<string, unknown> = {}) {
  await users.ensure(asUserId(id))
  await subs.upsert(asUserId(id), {
    provider: 'asaas',
    providerCustomerId: `cus_${id}`,
    providerSubscriptionId: null,
    providerInstallmentId: insId,
    meio: 'parcelamento',
    ciclo: 'anual',
    plan: 'premium',
    status: 'active',
    currentPeriodEnd: Date.now() + 360 * 86_400_000,
    ...patch,
  })
}

const hoje = () => new Date(Date.now()).toISOString().slice(0, 10)
/** As 12 parcelas do cartão, como `GET /installments/{id}/payments` as devolve. */
const parcelas = (insId: string, status: string, confirmadaEm?: string) =>
  Array.from({ length: 12 }, (_, i) => ({
    id: `${insId}_p${i + 1}`,
    status,
    value: i === 11 ? 14.99 : 14.91,
    installmentNumber: i + 1,
    billingType: 'CREDIT_CARD',
    ...(confirmadaEm ? { confirmedDate: confirmadaEm } : {}),
  }))

/** Um Asaas de mentira para o parcelamento: registra `MÉTODO /caminho` e responde por rota. */
function asaasDoParcelamento(lista: unknown[], falha: { estorno?: number; remocao?: number; listagem?: number } = {}) {
  const ordem: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input)
    const metodo = String(init?.method ?? 'GET')
    ordem.push(`${metodo} ${url.replace(/^.*\/v3/, '').replace(/\?.*$/, '')}`)
    if (metodo === 'GET' && /\/installments\/[^/]+\/payments/.test(url))
      return falha.listagem ? json({ errors: [] }, falha.listagem) : json({ data: lista })
    if (metodo === 'POST' && /\/installments\/[^/]+\/refund$/.test(url))
      return falha.estorno
        ? json({ errors: [{ description: 'recusado' }] }, falha.estorno)
        : json({ status: 'REFUNDED' })
    if (metodo === 'DELETE' && /\/installments\//.test(url))
      return falha.remocao ? json({ errors: [{ description: 'instável' }] }, falha.remocao) : json({ deleted: true })
    return json({ erro: 'rota não simulada' }, 404)
  })
  return ordem
}

describe('DELETE /api/me com o anual em 12x (parcelamento, sem `providerSubscriptionId`)', () => {
  it('dentro dos 7 dias: estorna o parcelamento inteiro ANTES de apagar, e a resposta traz o arrependimento', async () => {
    await assinanteDo12x('u-del-12x', 'ins_del')
    const ordem = asaasDoParcelamento(parcelas('ins_del', 'CONFIRMED', hoje()))
    const res = mockRes()
    await handler()(req('u-del-12x'), res)

    expect(res.statusCode).toBe(200)
    expect(ordem).toContain('POST /installments/ins_del/refund')
    expect(res.body.assinatura).toMatchObject({
      cancelada: true,
      arrependimento: { valor: 179, estornado: true, protocolo: 'arrependimento:parcelamento:ins_del' },
    })
    expect(await subs.getActive(asUserId('u-del-12x'))).toBeNull()
  })

  it('checkout do 12x não pago: a fatura em aberto é removida no Asaas antes de apagar', async () => {
    await assinanteDo12x('u-del-12x-aberto', 'ins_aberto', { status: 'trialing', currentPeriodEnd: null })
    const ordem = asaasDoParcelamento(parcelas('ins_aberto', 'PENDING'))
    const res = mockRes()
    await handler()(req('u-del-12x-aberto'), res)

    expect(res.statusCode).toBe(200)
    expect(ordem, 'ninguém pode pagar depois a fatura de uma conta apagada').toContain(
      'DELETE /installments/ins_aberto',
    )
    expect(ordem).not.toContain('POST /installments/ins_aberto/refund')
    expect(res.body.assinatura).toMatchObject({ cancelada: true })
    expect(await subs.getActive(asUserId('u-del-12x-aberto'))).toBeNull()
  })

  it('se o Asaas não remover a fatura em aberto, nada é apagado', async () => {
    await assinanteDo12x('u-del-12x-falha', 'ins_falha', { status: 'trialing', currentPeriodEnd: null })
    asaasDoParcelamento(parcelas('ins_falha', 'PENDING'), { remocao: 503 })
    const res = mockRes()
    await handler()(req('u-del-12x-falha'), res)

    expect(res.statusCode).toBe(502)
    expect(res.body.code).toBe('assinatura_nao_cancelada')
    expect(res.body.error).toMatch(/nada foi apagado/i)
    expect(await subs.getActive(asUserId('u-del-12x-falha')), 'a conta continua de pé').not.toBeNull()
  })

  it('se o Asaas não listar as parcelas, nada é apagado', async () => {
    await assinanteDo12x('u-del-12x-fora', 'ins_fora')
    asaasDoParcelamento([], { listagem: 503 })
    const res = mockRes()
    await handler()(req('u-del-12x-fora'), res)

    expect(res.statusCode).toBe(502)
    expect(await subs.getActive(asUserId('u-del-12x-fora'))).not.toBeNull()
  })

  it('depois dos 7 dias: nada a estornar nem a remover (o ano é compromisso do cartão); a conta é apagada', async () => {
    await assinanteDo12x('u-del-12x-velho', 'ins_velho')
    const haUmMes = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    const ordem = asaasDoParcelamento(parcelas('ins_velho', 'CONFIRMED', haUmMes))
    const res = mockRes()
    await handler()(req('u-del-12x-velho'), res)

    expect(res.statusCode).toBe(200)
    expect(ordem).toEqual(['GET /installments/ins_velho/payments'])
    expect(res.body.assinatura).toEqual({ cancelada: true })
    expect(await subs.getActive(asUserId('u-del-12x-velho'))).toBeNull()
  })

  it('12x sem `ASAAS_API_KEY` no servidor: 503 e nada é apagado', async () => {
    await assinanteDo12x('u-del-12x-semchave', 'ins_semchave')
    process.env.ASAAS_API_KEY = ''
    try {
      const res = mockRes()
      await handler()(req('u-del-12x-semchave'), res)
      expect(res.statusCode).toBe(503)
      expect(res.body.code).toBe('assinatura_nao_cancelada')
      expect(await subs.getActive(asUserId('u-del-12x-semchave'))).not.toBeNull()
    } finally {
      process.env.ASAAS_API_KEY = 'chave-de-teste'
    }
  })
})

describe('DELETE /api/me com assinatura', () => {
  it('cancela no Asaas antes de apagar', async () => {
    await assinante('u-del-ok', 'sub_del_ok')
    const ordem: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = String(input)
      const metodo = String(init?.method ?? 'GET')
      ordem.push(`${metodo} ${url.replace(/^.*\/v3/, '')}`)
      if (metodo === 'GET' && url.includes('/payments')) return json({ data: [] })
      if (metodo === 'GET') return json({ id: 'sub_del_ok', nextDueDate: '2099-01-01' })
      return json({ deleted: true })
    })
    const res = mockRes()
    await handler()(req('u-del-ok'), res)

    expect(res.statusCode).toBe(200)
    expect(ordem).toContain('DELETE /subscriptions/sub_del_ok')
    expect(res.body.assinatura).toMatchObject({ cancelada: true })
    expect(await subs.getActive(asUserId('u-del-ok'))).toBeNull()
  })

  it('se o Asaas não cancelar, nada é apagado e a resposta explica', async () => {
    await assinante('u-del-falha', 'sub_del_falha')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const metodo = String(init?.method ?? 'GET')
      if (metodo === 'GET' && String(input).includes('/payments')) return json({ data: [] })
      if (metodo === 'GET') return json({ id: 'x', nextDueDate: '2099-01-01' })
      return json({ errors: [{ description: 'instável' }] }, 503)
    })
    const res = mockRes()
    await handler()(req('u-del-falha'), res)

    expect(res.statusCode).toBe(502)
    expect(res.body.error).toMatch(/assinatura/i)
    expect(res.body.error).toMatch(/nada foi apagado/i)
    const sub = await subs.getActive(asUserId('u-del-falha'))
    expect(sub, 'a conta continua de pé para o titular tentar de novo').not.toBeNull()
    expect(sub.status).toBe('active')
  })

  it('sem assinatura, apaga sem falar com o Asaas', async () => {
    await users.ensure(asUserId('u-del-gratis'))
    const f = vi.spyOn(globalThis, 'fetch')
    const res = mockRes()
    await handler()(req('u-del-gratis'), res)
    expect(res.statusCode).toBe(200)
    expect(f).not.toHaveBeenCalled()
  })
})
