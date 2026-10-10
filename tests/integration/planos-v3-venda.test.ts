/**
 * OS QUATRO PLANOS, VENDA FECHADA (change `planos-v3-e-rota-inteligente`, etapa 7; ADR 0013).
 *
 * O Essencial e o Ao Vivo entram na matriz, mas ninguém os compra ainda: a flag `venda_planos_v3`
 * nasce DESLIGADA (migração 0048) e `POST /api/billing/assinar` recusa os dois; o Ao Vivo só é
 * vendável com ela E com `stt_ao_vivo` ligadas — vender o plano sem a rota ao vivo existir seria
 * cobrar por uma promessa. O Premium continua vendável como sempre, e um admin concede qualquer
 * plano. Abrir a venda é ato do dono.
 *
 * Os contratos de DINHEIRO que mudam com vários planos pagos também ficam presos aqui, com o Asaas
 * simulado por URL: o plano concedido é o do VALOR pago (pagar R$ 9,90 com a intenção do Premium
 * concede o Essencial), e quem já assinou QUALQUER plano pago não ganha o teste de 14 dias.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { FLAG_STT_AO_VIVO, FLAG_VENDA_PLANOS_V3, PLAN_MATRIX } from '../../src/core/planos'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let billingRouter: any
let asaasWebhookRouter: any
let adminRouter: any
let subs: any
let ent: any
let idades: any
let users: any
let flags: typeof import('../../server/lib/flags')
/** As linhas das duas flags como a MIGRAÇÃO as deixou — lidas antes de qualquer teste mexer nelas. */
let sementes: Array<Record<string, unknown>>

const SEGREDO = 'segredo-webhook-v3'
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

function rota(router: any, caminho: string, metodo: 'get' | 'post' | 'patch'): (req: any, res: any) => Promise<void> {
  const camada = router.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.[metodo])
  // O último da pilha é a rota; os anteriores são os portões dela (`requireRole`).
  return camada.route.stack.at(-1).handle
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
  path: '/assinar',
  body,
  header: () => undefined,
  ...extra,
})

/** Um Asaas de mentira: cria cliente e assinatura, e devolve os pagamentos que a conferência pede. */
function asaasSimulado(pagamentos: Record<string, Record<string, unknown>> = {}) {
  const chamadas: Array<{ metodo: string; url: string; corpo: any }> = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input)
    const metodo = String(init?.method ?? 'GET')
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined
    chamadas.push({ metodo, url, corpo })
    if (metodo === 'POST' && url.endsWith('/customers')) return json({ id: 'cus_novo' })
    if (metodo === 'POST' && url.endsWith('/subscriptions')) return json({ id: 'sub_novo', cycle: corpo?.cycle })
    if (metodo === 'GET' && /\/subscriptions\/[^/]+\/payments/.test(url))
      return json({ data: [{ id: 'pay_sub_1', invoiceUrl: 'https://sandbox.asaas.com/i/sub1' }] })
    if (metodo === 'GET' && /\/subscriptions\/[^/?]+$/.test(url)) return json({ id: 'sub' })
    const pagamento = /\/payments\/([^/?]+)$/.exec(url)
    if (metodo === 'GET' && pagamento) {
      const p = pagamentos[decodeURIComponent(pagamento[1])]
      return p ? json(p) : json({ errors: [{ code: 'not_found' }] }, 404)
    }
    return json({ erro: 'rota não simulada' }, 404)
  })
  return chamadas
}

const pedido = (plano: string, extra: Record<string, unknown> = {}) => ({
  plano,
  nome: 'Pessoa de Teste',
  cpfCnpj: '24971563792',
  ...extra,
})

async function assinar(userId: string, corpo: Record<string, unknown>) {
  await idades.declarar(asUserId(userId), '1990-01-01')
  const chamadas = asaasSimulado()
  const res = mockRes()
  await rota(billingRouter, '/assinar', 'post')(req(userId, corpo), res)
  return { res, criada: chamadas.find((c) => c.metodo === 'POST' && c.url.endsWith('/subscriptions')), chamadas }
}

const ligar = (chave: string, habilitada: boolean) => flags.definirFlag(chave, { habilitada }, 'teste')

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  process.env.ASAAS_WEBHOOK_TOKEN = SEGREDO
  ;({ billingRouter, asaasWebhookRouter } = (await h.load('../../server/routes/billing')) as any)
  ;({ adminRouter } = (await h.load('../../server/routes/admin')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ idadesRepo: idades } = (await h.load('../../server/db/repositories/idades')) as any)
  ;({ usersRepo: users } = (await h.load('../../server/db/repositories/users')) as any)
  const { client } = (await h.load('../../server/db/db')) as {
    client: { execute: (q: string) => Promise<{ rows: Array<Record<string, unknown>> }> }
  }
  sementes = (
    await client.execute(
      `SELECT chave, habilitada, regras, atualizado_por FROM flags WHERE chave IN ('${FLAG_VENDA_PLANOS_V3}', '${FLAG_STT_AO_VIVO}')`,
    )
  ).rows
  flags = (await h.load('../../server/lib/flags')) as typeof flags
  ent = await h.load('../../server/lib/entitlements')
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  delete process.env.ASAAS_API_KEY
  delete process.env.ASAAS_WEBHOOK_TOKEN
  await h.cleanup()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await ligar(FLAG_VENDA_PLANOS_V3, false)
  await ligar(FLAG_STT_AO_VIVO, false)
})

describe('as chaves da venda nascem desligadas (migração 0048)', () => {
  it.each([FLAG_VENDA_PLANOS_V3, FLAG_STT_AO_VIVO])('%s: semeada, desligada e sem regra de plano', (chave) => {
    const linha = sementes.find((l) => l.chave === chave)
    expect(linha, 'a migração não semeou a flag').toBeDefined()
    expect(Number(linha?.habilitada)).toBe(0)
    /* Sem `planos` na regra: quem COMPRA um plano novo ainda é Grátis, e uma regra por plano fecharia
       a venda justamente para ele. */
    expect(JSON.parse(String(linha?.regras))).toEqual({})
    expect(linha?.atualizado_por).toBe('semente')
  })

  it('a matriz diz que chaves cada plano pede', () => {
    expect(PLAN_MATRIX.premium.flagsDeVenda).toEqual([])
    expect(PLAN_MATRIX.essencial.flagsDeVenda).toEqual(['venda_planos_v3'])
    expect(PLAN_MATRIX.aovivo.flagsDeVenda).toEqual(['venda_planos_v3', 'stt_ao_vivo'])
  })
})

describe('POST /api/billing/assinar — venda fechada', () => {
  it.each(['essencial', 'aovivo'])('%s: recusado, sem falar com o Asaas e sem gravar intenção', async (plano) => {
    const { res, chamadas } = await assinar(`u-fechado-${plano}`, pedido(plano))
    expect(res.statusCode).toBe(503)
    expect(res.body.code).toBe('plano_indisponivel')
    expect(chamadas).toEqual([])
    expect(await subs.getActive(asUserId(`u-fechado-${plano}`))).toBeNull()
  })

  it('o Premium continua vendável como hoje: MONTHLY a R$ 19,90', async () => {
    const { res, criada } = await assinar('u-premium', pedido('premium'))
    expect(res.statusCode).toBe(200)
    expect(criada?.corpo).toMatchObject({ cycle: 'MONTHLY', value: 19.9 })
    expect(await subs.getActive(asUserId('u-premium'))).toMatchObject({ plan: 'premium', status: 'trialing' })
  })

  it('o anual do Premium sai pelo preço novo: YEARLY a R$ 149,90', async () => {
    const { res, criada } = await assinar('u-premium-anual', pedido('premium', { ciclo: 'anual' }))
    expect(res.statusCode).toBe(200)
    expect(criada?.corpo).toMatchObject({ cycle: 'YEARLY', value: 149.9 })
  })
})

describe('POST /api/billing/assinar — venda aberta', () => {
  it('com `venda_planos_v3` ligada o Essencial é vendido pelo preço dele, e iniciar não concede nada', async () => {
    await ligar(FLAG_VENDA_PLANOS_V3, true)
    const { res, criada } = await assinar('u-essencial', pedido('essencial'))
    expect(res.statusCode).toBe(200)
    expect(criada?.corpo).toMatchObject({ cycle: 'MONTHLY', value: 9.9 })
    expect(await subs.getActive(asUserId('u-essencial'))).toMatchObject({ plan: 'essencial', status: 'trialing' })
    expect(await ent.getPlanForUser(asUserId('u-essencial'))).toBe('free')

    const anual = await assinar('u-essencial-anual', pedido('essencial', { ciclo: 'anual' }))
    expect(anual.criada?.corpo).toMatchObject({ cycle: 'YEARLY', value: 79.9 })
  })

  it('só `venda_planos_v3` não vende o Ao Vivo: falta a nuvem ao vivo existir', async () => {
    await ligar(FLAG_VENDA_PLANOS_V3, true)
    const { res, chamadas } = await assinar('u-aovivo-cedo', pedido('aovivo'))
    expect(res.statusCode).toBe(503)
    expect(res.body.code).toBe('plano_indisponivel')
    expect(chamadas).toEqual([])
  })

  it('só `stt_ao_vivo` também não: a venda dos planos novos continua fechada', async () => {
    await ligar(FLAG_STT_AO_VIVO, true)
    const { res } = await assinar('u-aovivo-sem-venda', pedido('aovivo'))
    expect(res.statusCode).toBe(503)
    expect((await assinar('u-essencial-sem-venda', pedido('essencial'))).res.statusCode).toBe(503)
  })

  it('com as DUAS ligadas o Ao Vivo é vendido a R$ 39,90 — e só no mensal', async () => {
    await ligar(FLAG_VENDA_PLANOS_V3, true)
    await ligar(FLAG_STT_AO_VIVO, true)
    const { res, criada } = await assinar('u-aovivo', pedido('aovivo'))
    expect(res.statusCode).toBe(200)
    expect(criada?.corpo).toMatchObject({ cycle: 'MONTHLY', value: 39.9 })

    const anual = await assinar('u-aovivo-anual', pedido('aovivo', { ciclo: 'anual' }))
    expect(anual.res.statusCode).toBe(400)
    expect(anual.criada).toBeUndefined()
  })
})

describe('GET /api/billing/status — os planos à venda', () => {
  const status = async (userId: string) => {
    asaasSimulado()
    const res = mockRes()
    await rota(billingRouter, '/status', 'get')(req(userId, {}, { path: '/status' }), res)
    return res.body
  }

  it('venda fechada: só o Premium', async () => {
    expect((await status('u-status')).planosAVenda).toEqual(['premium'])
  })

  it('venda aberta: Essencial e Premium; o Ao Vivo entra com a nuvem ao vivo', async () => {
    await ligar(FLAG_VENDA_PLANOS_V3, true)
    expect((await status('u-status')).planosAVenda).toEqual(['essencial', 'premium'])
    await ligar(FLAG_STT_AO_VIVO, true)
    expect((await status('u-status')).planosAVenda).toEqual(['essencial', 'premium', 'aovivo'])
  })
})

describe('o admin concede qualquer plano, com a venda fechada', () => {
  it.each(['essencial', 'aovivo', 'premium'] as const)('%s', async (plano) => {
    const alvo = `u-admin-${plano}`
    await users.ensure(asUserId(alvo))
    const res = mockRes()
    await rota(adminRouter, '/users/:id/plan', 'patch')(req('admin', { plan: plano }, { params: { id: alvo } }), res)
    expect(res.statusCode).toBe(200)
    expect(await ent.getPlanForUser(asUserId(alvo))).toBe(plano)
    expect(await ent.getEntitlementsForUser(asUserId(alvo))).toMatchObject(PLAN_MATRIX[plano].entitlements)
  })
})

describe('o webhook concede o plano do VALOR pago', () => {
  const webhook = async (id: string, userId: string, sub: string, value: number) => {
    asaasSimulado({
      [`pay_${id}`]: { id: `pay_${id}`, status: 'CONFIRMED', value, subscription: sub, externalReference: userId },
    })
    const res = mockRes()
    await rota(
      asaasWebhookRouter,
      '/',
      'post',
    )(
      {
        body: {
          id,
          event: 'PAYMENT_CONFIRMED',
          payment: { id: `pay_${id}`, subscription: sub, externalReference: userId, value },
        },
        header: (k: string) => (k.toLowerCase() === 'asaas-access-token' ? SEGREDO : undefined),
      },
      res,
    )
    return res
  }

  /* O cenário da especificação: assinar é de graça, então a INTENÇÃO não decide nada. */
  it('pagar o barato com a intenção do caro: intenção Premium, pagou R$ 9,90 → Essencial', async () => {
    const u = asUserId('u-barato')
    await subs.upsert(u, { plan: 'premium', status: 'trialing', provider: 'asaas', providerSubscriptionId: 'sub_b' })
    const res = await webhook('evt_barato', 'u-barato', 'sub_b', 9.9)
    expect(res.body.estado).toBe('aplicado')
    expect(res.body.motivo).toMatch(/plano-divergente/)
    expect(await subs.getActive(u)).toMatchObject({ plan: 'essencial', ciclo: 'mensal', status: 'active' })
    expect(await ent.getEntitlementsForUser(u)).toMatchObject({ plan: 'essencial', interpreteAutomatico: false })
  })

  it('R$ 39,90 é o Ao Vivo (não mais "o Pro antigo" lido como Premium)', async () => {
    const u = asUserId('u-aovivo-pago')
    await subs.upsert(u, { plan: 'aovivo', status: 'trialing', provider: 'asaas', providerSubscriptionId: 'sub_av' })
    const res = await webhook('evt_aovivo', 'u-aovivo-pago', 'sub_av', 39.9)
    expect(res.body.estado).toBe('aplicado')
    expect(await subs.getActive(u)).toMatchObject({ plan: 'aovivo', ciclo: 'mensal', status: 'active' })
    expect(await ent.hasEntitlement(u, 'sttAoVivo')).toBe(true)
  })

  /* O valor que não é de plano nenhum cai na intenção gravada (o comportamento de sempre do webhook
     para evento sem valor reconhecível) — e no CICLO dela: R$ 179 não compra mais um ano. */
  it('o anual antigo (R$ 179) não concede mais o ano: vale a intenção gravada, no ciclo dela', async () => {
    const u = asUserId('u-179')
    await subs.upsert(u, { plan: 'premium', status: 'trialing', provider: 'asaas', providerSubscriptionId: 'sub_179' })
    await webhook('evt_179', 'u-179', 'sub_179', 179)
    const sub = await subs.getActive(u)
    expect(sub).toMatchObject({ plan: 'premium', ciclo: 'mensal' })
    expect(sub.currentPeriodEnd).toBeLessThan(Date.now() + 40 * 86_400_000)
  })
})

describe('o teste de 14 dias', () => {
  it('quem já assinou QUALQUER plano pago não ganha o teste', async () => {
    for (const plano of ['essencial', 'aovivo'] as const) {
      const id = `u-ja-${plano}`
      await idades.declarar(asUserId(id), '1990-01-01')
      await subs.upsert(asUserId(id), { plan: plano, status: 'canceled', currentPeriodEnd: Date.now() - 1000 })
      asaasSimulado()
      const res = mockRes()
      await rota(billingRouter, '/status', 'get')(req(id, {}, { path: '/status' }), res)
      expect(res.body.teste, plano).toMatchObject({ estado: 'indisponivel', motivo: 'ja_assinante' })
    }
  })

  it('o checkout só iniciado (`trialing`) não conta como ter assinado', async () => {
    const id = 'u-so-iniciou'
    await idades.declarar(asUserId(id), '1990-01-01')
    await subs.upsert(asUserId(id), { plan: 'essencial', status: 'trialing' })
    asaasSimulado()
    const res = mockRes()
    await rota(billingRouter, '/status', 'get')(req(id, {}, { path: '/status' }), res)
    expect(res.body.teste?.motivo).not.toBe('ja_assinante')
  })
})
