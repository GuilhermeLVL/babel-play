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
