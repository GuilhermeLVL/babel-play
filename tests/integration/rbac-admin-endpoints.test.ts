/**
 * SaaS Fatia 2 — endpoints ADMIN cross-tenant (superfície A01). Prova: usuário comum barrado (403),
 * admin lê/escreve dado de OUTRO dono, support só lê (PATCH→403), guarda anti-self-lockout, e 404.
 * Express in-process + stub injetando req.userId (o requireRole real lê o papel do banco efêmero).
 */
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { afterAll,beforeAll, describe, expect, it } from 'vitest'

import { asUserId, type UserId } from '../../server/lib/authContext'
import { type EphemeralDb,setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let server: Server
let base: string
let currentUser: UserId

beforeAll(async () => {
  h = await setupEphemeralDb()
  const { adminRouter } = (await h.load('../../server/routes/admin')) as any
  const { usersRepo } = (await h.load('../../server/db/repositories/users')) as any
  await usersRepo.ensure(asUserId('admin')); await usersRepo.setRole(asUserId('admin'), 'admin')
  await usersRepo.ensure(asUserId('support')); await usersRepo.setRole(asUserId('support'), 'support')
  await usersRepo.ensure(asUserId('alice'), 'alice@x.com') // alvo cross-tenant

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.userId = currentUser; next() })
  app.use('/api/admin', adminRouter)
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await h.cleanup()
})

async function call(user: UserId, method: string, path: string, body?: any): Promise<{ status: number; body: any }> {
  currentUser = user
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

const ADMIN = asUserId('admin'), SUPPORT = asUserId('support'), USER = asUserId('regular')

describe('SaaS Fatia 2 — endpoints admin cross-tenant', () => {
  it('usuário comum é barrado (403) em listar e ver', async () => {
    expect((await call(USER, 'GET', '/api/admin/users')).status).toBe(403)
    expect((await call(USER, 'GET', '/api/admin/users/alice')).status).toBe(403)
  })

  it('admin lista contas', async () => {
    const r = await call(ADMIN, 'GET', '/api/admin/users')
    expect(r.status).toBe(200)
    expect(r.body.map((u: any) => u.id)).toContain('alice')
  })

  it('support LÊ (200) mas não ESCREVE (403)', async () => {
    expect((await call(SUPPORT, 'GET', '/api/admin/users/alice')).status).toBe(200)
    expect((await call(SUPPORT, 'PATCH', '/api/admin/users/alice', { role: 'support' })).status).toBe(403)
  })

  it('admin muda role/status de OUTRO dono (cross-tenant)', async () => {
    const r = await call(ADMIN, 'PATCH', '/api/admin/users/alice', { status: 'suspended' })
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('suspended')
  })

  it('admin muda o plano de outro dono (subscriptions)', async () => {
    const r = await call(ADMIN, 'PATCH', '/api/admin/users/alice/plan', { plan: 'pro' })
    expect(r.status).toBe(200)
    expect(r.body.plan).toBe('pro')
  })

  it('anti-self-lockout: admin não remove o próprio acesso (400)', async () => {
    expect((await call(ADMIN, 'PATCH', '/api/admin/users/admin', { role: 'user' })).status).toBe(400)
    expect((await call(ADMIN, 'PATCH', '/api/admin/users/admin', { status: 'suspended' })).status).toBe(400)
  })

  it('ver usuário inexistente → 404', async () => {
    expect((await call(ADMIN, 'GET', '/api/admin/users/naoexiste')).status).toBe(404)
  })

  it('PATCH em id inexistente → 404 (não cria conta-fantasma nem pré-atribui admin)', async () => {
    expect((await call(ADMIN, 'PATCH', '/api/admin/users/fantasma', { role: 'admin' })).status).toBe(404)
    expect((await call(ADMIN, 'PATCH', '/api/admin/users/fantasma/plan', { plan: 'pro' })).status).toBe(404)
    // e a conta-fantasma NÃO foi criada:
    expect((await call(ADMIN, 'GET', '/api/admin/users/fantasma')).status).toBe(404)
  })
})

/**
 * EVENTOS DE COBRANÇA PENDENTES (auditoria de 2026-09-07, A05): a fila do que o webhook não
 * conseguiu aplicar e a acao de reaplicar com a logica atual. Leitura para admin e support;
 * reprocessar so admin. Idempotente: evento ja aplicado responde `repetido`.
 */
describe('eventos de cobrança pendentes', () => {
  it('a fila e o reprocessamento respeitam os papéis e aplicam uma vez só', async () => {
    const { billingEventsRepo } = (await h.load('../../server/db/repositories/billingEvents')) as any
    const { creditsRepo } = (await h.load('../../server/db/repositories/credits')) as any

    // Um avulso que chegou antes de a compra existir: pendente, com payload guardado.
    const payload = { id: 'evt_pend', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_pend', externalReference: 'alice' } }
    await billingEventsRepo.marcarSeNovo('evt_pend', 'asaas', 'PAYMENT_CONFIRMED', 'alice', 'pay_pend', payload)
    await billingEventsRepo.registrarResultado('evt_pend', 'nao-aplicado', 'avulso-desconhecido: teste')

    expect((await call(USER, 'GET', '/api/admin/billing/pendentes')).status).toBe(403)
    const lista = await call(SUPPORT, 'GET', '/api/admin/billing/pendentes')
    expect(lista.status).toBe(200)
    expect(lista.body.map((e: any) => e.id)).toContain('evt_pend')

    // Support lê, não reprocessa.
    expect((await call(SUPPORT, 'POST', '/api/admin/billing/reprocessar/evt_pend')).status).toBe(403)
    expect((await call(ADMIN, 'POST', '/api/admin/billing/reprocessar/nao_existe')).status).toBe(404)

    // Ainda sem compra registrada: reaplicar continua pendente (e diz por quê).
    const ainda = await call(ADMIN, 'POST', '/api/admin/billing/reprocessar/evt_pend')
    expect(ainda.status).toBe(200)
    expect(ainda.body.estado).toBe('nao-aplicado')

    // Compra registrada: reaplicar credita e o evento sai da fila.
    await creditsRepo.registrarCompra(asUserId('alice'), { sku: 'c100', creditos: 100, valorCentavos: 990, providerPaymentId: 'pay_pend' })
    const ok = await call(ADMIN, 'POST', '/api/admin/billing/reprocessar/evt_pend')
    expect(ok.status).toBe(200)
    expect(ok.body.estado).toBe('aplicado')
    expect(await creditsRepo.saldo(asUserId('alice'))).toBe(100)
    expect((await call(SUPPORT, 'GET', '/api/admin/billing/pendentes')).body.map((e: any) => e.id)).not.toContain('evt_pend')

    // Segunda vez: repetido, sem segundo crédito.
    const de_novo = await call(ADMIN, 'POST', '/api/admin/billing/reprocessar/evt_pend')
    expect(de_novo.body.repetido).toBe(true)
    expect(await creditsRepo.saldo(asUserId('alice'))).toBe(100)
  })
})
