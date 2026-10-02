/**
 * GAP-017 / S26-13 — `billing_events.payload` GUARDA SÓ O QUE O CÓDIGO USA.
 *
 * O webhook gravava o corpo do Asaas como chegava, e ele pode trazer dado pessoal do pagador (nome,
 * CPF, e-mail, telefone, endereço, os últimos dígitos e o token do cartão, o link da fatura) — sem
 * prazo de guarda. O payload existe para UMA coisa: um administrador reaplicar o evento que ficou
 * `nao-aplicado`. Para isso bastam ids, evento, valor, status e datas.
 *
 * Contratos:
 *  1. Na ENTRADA, o que vai para o banco é a forma reduzida — nenhum campo pessoal.
 *  2. O reprocessamento do admin (`POST /api/admin/billing/reprocessar/:id`) continua funcionando
 *     com o payload reduzido.
 *  3. A migração 0047 limpa as linhas ANTIGAS com a mesma lista de campos, e é reexecutável.
 */
import { readFileSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let asaasWebhookRouter: any
let eventos: any
let reduzirPayload: (bruto: unknown) => unknown
let credits: any
let client: any
let server: Server
let base: string

const SEGREDO = 'segredo-webhook-payload'
const MIGRACAO = path.resolve(process.cwd(), 'server', 'db', 'migrations', '0047_billing_events_payload_minimo.sql')

/** O corpo como o Asaas o manda — com tudo o que NÃO deve ficar guardado. */
const corpoDoAsaas = (id: string, paymentId: string, userId: string) => ({
  id,
  event: 'PAYMENT_CONFIRMED',
  dateCreated: '2026-10-02 10:00:00',
  account: { id: 'acc_1', ownerId: null },
  payment: {
    object: 'payment',
    id: paymentId,
    dateCreated: '2026-10-01',
    customer: 'cus_000005219613',
    subscription: undefined,
    installment: undefined,
    value: 9.9,
    netValue: 9.41,
    description: 'Babel Play — 100 créditos para Fulano de Tal',
    billingType: 'CREDIT_CARD',
    status: 'CONFIRMED',
    dueDate: '2026-10-04',
    originalDueDate: '2026-10-04',
    paymentDate: null,
    clientPaymentDate: '2026-10-02',
    confirmedDate: '2026-10-02',
    externalReference: userId,
    invoiceUrl: 'https://sandbox.asaas.com/i/abc',
    invoiceNumber: '0001',
    transactionReceiptUrl: 'https://sandbox.asaas.com/comprovantes/abc',
    deleted: false,
    creditCard: { creditCardNumber: '8829', creditCardBrand: 'MASTERCARD', creditCardToken: 'tok_segredo' },
    // Campos que a doc não promete e que um payload pode trazer: a lista é de PERMITIDOS, não de proibidos.
    customerName: 'Fulano de Tal',
    cpfCnpj: '12345678909',
    email: 'fulano@example.com',
    mobilePhone: '11999990000',
    payer: { name: 'Fulano de Tal', cpfCnpj: '12345678909', address: 'Rua das Flores, 10' },
  },
})

const PESSOAIS = /Fulano|12345678909|fulano@example\.com|11999990000|Rua das Flores|8829|tok_segredo|cus_000005219613/
const LINKS = /sandbox\.asaas\.com/

function handler(): (req: any, res: any) => Promise<void> {
  const camada = asaasWebhookRouter.stack.find((l: any) => l.route?.path === '/' && l.route?.methods?.post)
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
const req = (body: unknown) => ({
  body,
  header: (k: string) => (k.toLowerCase() === 'asaas-access-token' ? SEGREDO : undefined),
})

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  process.env.ASAAS_WEBHOOK_TOKEN = SEGREDO
  // '' e não `delete` (o dotenv repõe): sem chave, o evento vale pelo payload — é ele que está em teste.
  process.env.ASAAS_API_KEY = ''
  ;({ asaasWebhookRouter } = (await h.load('../../server/routes/billing')) as any)
  ;({ billingEventsRepo: eventos, reduzirPayload } = (await h.load(
    '../../server/db/repositories/billingEvents',
  )) as any)
  ;({ creditsRepo: credits } = (await h.load('../../server/db/repositories/credits')) as any)
  ;({ client } = (await h.load('../../server/db/db')) as any)

  const { adminRouter } = (await h.load('../../server/routes/admin')) as any
  const { usersRepo } = (await h.load('../../server/db/repositories/users')) as any
  await usersRepo.ensure(asUserId('admin-pm'))
  await usersRepo.setRole(asUserId('admin-pm'), 'admin')
  const app = express()
  app.use(express.json())
  app.use((r, _res, next) => {
    r.userId = asUserId('admin-pm')
    next()
  })
  app.use('/api/admin', adminRouter)
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  delete process.env.AUTH_REQUIRED
  delete process.env.ASAAS_WEBHOOK_TOKEN
  await h.cleanup()
})

describe('o payload guardado é o mínimo', () => {
  it('o webhook grava só ids, evento, valor, status e datas — nenhum dado pessoal, nenhum link', async () => {
    const res = mockRes()
    await handler()(req(corpoDoAsaas('evt_pm1', 'pay_pm1', 'u-pm1')), res)
    expect(res.statusCode).toBe(200)

    const linha = await eventos.ler('evt_pm1')
    expect(linha.payload).not.toMatch(PESSOAIS)
    expect(linha.payload).not.toMatch(LINKS)
    expect(JSON.parse(linha.payload)).toEqual({
      id: 'evt_pm1',
      event: 'PAYMENT_CONFIRMED',
      dateCreated: '2026-10-02 10:00:00',
      payment: {
        id: 'pay_pm1',
        dateCreated: '2026-10-01',
        value: 9.9,
        netValue: 9.41,
        billingType: 'CREDIT_CARD',
        status: 'CONFIRMED',
        dueDate: '2026-10-04',
        originalDueDate: '2026-10-04',
        clientPaymentDate: '2026-10-02',
        confirmedDate: '2026-10-02',
        externalReference: 'u-pm1',
        deleted: false,
      },
    })
  })

  it('assinatura, parcelamento e número da parcela ficam (é o que decide o ramo no reprocessamento)', () => {
    expect(
      reduzirPayload({
        id: 'evt_x',
        event: 'PAYMENT_CONFIRMED',
        payment: { id: 'p', installment: 'ins_1', installmentNumber: 3, subscription: 'sub_1', description: 'Fulano' },
        subscription: {
          id: 'sub_1',
          externalReference: 'u',
          status: 'ACTIVE',
          nextDueDate: '2026-11-01',
          customer: 'cus_1',
        },
      }),
    ).toEqual({
      id: 'evt_x',
      event: 'PAYMENT_CONFIRMED',
      payment: { id: 'p', installment: 'ins_1', installmentNumber: 3, subscription: 'sub_1' },
      subscription: { id: 'sub_1', externalReference: 'u', status: 'ACTIVE', nextDueDate: '2026-11-01' },
    })
  })

  it('objeto escondido numa chave permitida não passa; texto longo demais também não', () => {
    expect(
      reduzirPayload({
        id: 'evt_y',
        event: 'X',
        payment: { id: { nome: 'Fulano' }, externalReference: 'u'.repeat(201), status: 'OK' },
        subscription: 'não é objeto',
      }),
    ).toEqual({ id: 'evt_y', event: 'X', payment: { status: 'OK' } })
    expect(reduzirPayload(null)).toBeNull()
    expect(reduzirPayload('texto')).toBeNull()
  })

  it('o evento INTERNO do arrependimento atravessa inteiro (é o que o admin reaplica)', () => {
    const interno = {
      id: 'arrependimento:parcelamento:ins_1',
      event: 'ESTORNO_ARREPENDIMENTO',
      payment: { id: 'pay_1', installment: 'ins_1', externalReference: 'u-1', value: 179 },
    }
    expect(reduzirPayload(interno)).toEqual(interno)
  })
})

describe('o admin reprocessa com o payload reduzido', () => {
  it('avulso pendente → compra registrada depois → reprocessar credita', async () => {
    const u = asUserId('u-pm-rep')
    const res = mockRes()
    await handler()(req(corpoDoAsaas('evt_pm_rep', 'pay_pm_rep', 'u-pm-rep')), res)
    expect(res.body.estado).toBe('nao-aplicado')
    expect((await eventos.ler('evt_pm_rep')).payload).not.toMatch(PESSOAIS)

    await credits.registrarCompra(u, {
      sku: 'c100',
      creditos: 100,
      valorCentavos: 990,
      providerPaymentId: 'pay_pm_rep',
    })
    const r = await fetch(`${base}/api/admin/billing/reprocessar/evt_pm_rep`, { method: 'POST' })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ ok: true, estado: 'aplicado' })
    expect(await credits.saldo(u)).toBe(100)
  })

  it('parcela de assinatura pendente (sem valor, assinatura divergente) é reaplicável depois', async () => {
    const { subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any
    const u = asUserId('u-pm-sub')
    await subs.upsert(u, {
      plan: 'premium',
      status: 'trialing',
      provider: 'asaas',
      providerSubscriptionId: 'sub_outra',
    })
    const corpo: any = corpoDoAsaas('evt_pm_sub', 'pay_pm_sub', 'u-pm-sub')
    corpo.payment.subscription = 'sub_paga'
    delete corpo.payment.value
    const res = mockRes()
    await handler()(req(corpo), res)
    expect(res.body.estado).toBe('nao-aplicado')

    // O admin acerta o registro (a assinatura que pagou passa a ser a registrada) e reaplica.
    await subs.upsert(u, { providerSubscriptionId: 'sub_paga' })
    const r = await fetch(`${base}/api/admin/billing/reprocessar/evt_pm_sub`, { method: 'POST' })
    expect(await r.json()).toMatchObject({ ok: true, estado: 'aplicado' })
    const s = await subs.getActive(u)
    expect(s.status).toBe('active')
    // O vencimento do payload reduzido ancorou o período: 04/10 + 35 dias.
    expect(s.currentPeriodEnd).toBe(Date.parse('2026-10-04T12:00:00Z') + 35 * 86_400_000)
  })
})

describe('migração 0047 — limpa as linhas antigas', () => {
  const instrucoes = () =>
    readFileSync(MIGRACAO, 'utf8')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)

  const inserirCru = (id: string, payload: string | null) =>
    client.execute({
      sql: `INSERT INTO billing_events (id, created_at, provider, event, user_id, provider_ref, estado, motivo, payload)
            VALUES (?, ?, 'asaas', 'PAYMENT_CONFIRMED', 'u-antigo', 'pay_antigo', 'nao-aplicado', 'teste', ?)`,
      args: [id, Date.now(), payload],
    })
  const payloadDe = async (id: string): Promise<string | null> =>
    (await client.execute({ sql: 'SELECT payload FROM billing_events WHERE id = ?', args: [id] })).rows[0]?.payload as
      | string
      | null

  it('reduz o payload bruto antigo ao mesmo resultado da entrada, e rodar de novo não muda nada', async () => {
    const bruto: any = corpoDoAsaas('evt_antigo', 'pay_antigo', 'u-antigo')
    bruto.payment.subscription = 'sub_antiga'
    bruto.payment.installmentNumber = 2
    bruto.subscription = {
      id: 'sub_antiga',
      externalReference: 'u-antigo',
      customer: 'cus_1',
      description: 'Fulano',
      deleted: true,
    }
    await inserirCru('evt_antigo', JSON.stringify(bruto))
    await inserirCru('evt_antigo_lixo', 'isto não é JSON — Fulano de Tal 12345678909')
    await inserirCru('evt_antigo_lista', JSON.stringify(['Fulano de Tal']))
    await inserirCru('evt_antigo_nulo', null)

    for (const sql of instrucoes()) await client.execute(sql)

    const limpo = await payloadDe('evt_antigo')
    expect(limpo).not.toMatch(PESSOAIS)
    expect(limpo).not.toMatch(LINKS)
    expect(JSON.parse(limpo as string), 'a migração e a entrada usam a MESMA lista de campos').toEqual(
      reduzirPayload(bruto),
    )
    // Os tipos sobrevivem ao SQL: número é número, booleano é booleano.
    expect(JSON.parse(limpo as string).payment).toMatchObject({ value: 9.9, installmentNumber: 2, deleted: false })
    expect(JSON.parse(limpo as string).subscription).toEqual({
      id: 'sub_antiga',
      externalReference: 'u-antigo',
      deleted: true,
    })
    // O que não dá para reduzir com segurança sai inteiro (o reprocessamento já respondia 409 para ele).
    expect(await payloadDe('evt_antigo_lixo')).toBeNull()
    expect(await payloadDe('evt_antigo_lista')).toBeNull()
    expect(await payloadDe('evt_antigo_nulo')).toBeNull()

    for (const sql of instrucoes()) await client.execute(sql)
    expect(JSON.parse((await payloadDe('evt_antigo')) as string)).toEqual(reduzirPayload(bruto))
  })

  it('a linha antiga limpa continua reprocessável', async () => {
    const u = asUserId('u-antigo-rep')
    const bruto = corpoDoAsaas('evt_antigo_rep', 'pay_antigo_rep', 'u-antigo-rep')
    await client.execute({
      sql: `INSERT INTO billing_events (id, created_at, provider, event, user_id, provider_ref, estado, motivo, payload)
            VALUES ('evt_antigo_rep', ?, 'asaas', 'PAYMENT_CONFIRMED', 'u-antigo-rep', 'pay_antigo_rep', 'nao-aplicado', 'avulso-desconhecido', ?)`,
      args: [Date.now(), JSON.stringify(bruto)],
    })
    for (const sql of instrucoes()) await client.execute(sql)

    await credits.registrarCompra(u, {
      sku: 'c100',
      creditos: 100,
      valorCentavos: 990,
      providerPaymentId: 'pay_antigo_rep',
    })
    const r = await fetch(`${base}/api/admin/billing/reprocessar/evt_antigo_rep`, { method: 'POST' })
    expect(await r.json()).toMatchObject({ ok: true, estado: 'aplicado' })
    expect(await credits.saldo(u)).toBe(100)
  })
})
