/**
 * PLANOS v4, ETAPA 1 — A VENDA, O WEBHOOK E O TESTE DE 14 DIAS NO SERVIDOR (Task 2).
 *
 * Com `venda_planos_v4` ligada o servidor vende o Plus (R$ 14,90 / R$ 149,00) e para de vender o Essencial,
 * o Premium e o Ao Vivo — quem já os tem segue com eles. A Família e o Pro só abrem com as chaves deles
 * (`venda_familia`, `venda_pro4`), que nesta etapa ficam desligadas.
 *
 * O CONTRATO DE DINHEIRO QUE MAIS PESA: a parcela de R$ 12,49 é a ÚLTIMA do 12x do Plus (149,00) e a PADRÃO
 * do 12x do Premium (149,90). O valor sozinho não decide; quem desempata é o plano gravado PARA ESTE
 * parcelamento (`/assinar` grava o plano junto com o id do parcelamento). Sem esse vínculo a parcela não
 * concede nada e fica pendente para o admin — nunca um palpite, nunca o plano mais barato.
 *
 * O teste de 14 dias dá `planoDoTeste(flag)` avaliado no INÍCIO e gravado: Plus com a v4, Premium sem ela;
 * quem começou no Premium segue no Premium até o fim.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { FLAG_VENDA_FAMILIA, FLAG_VENDA_PLANOS_V3, FLAG_VENDA_PLANOS_V4, FLAG_VENDA_PRO4 } from '../../src/core/planos'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const DIA = 86_400_000
let h: EphemeralDb
let billingRouter: any
let subs: any
let ent: any
let idades: any
let testes: any
let aplicarEvento: any
let flags: typeof import('../../server/lib/flags')

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })

function rota(router: any, caminho: string, metodo: 'get' | 'post'): (req: any, res: any) => Promise<void> {
  const camada = router.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.[metodo])
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

/** Um JWT só para `emailDoToken` ler o e-mail (o authMiddleware, que confere a assinatura, não roda aqui). */
const tokenCom = (email: string) =>
  `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.x`

const req = (userId: string, body: unknown = {}, extra: Record<string, unknown> = {}) => ({
  userId: asUserId(userId),
  requestId: 'req-teste',
  path: '/assinar',
  body,
  header: (k: string) =>
    k.toLowerCase() === 'authorization' ? `Bearer ${tokenCom(`${userId}@exemplo.com`)}` : undefined,
  ...extra,
})

/** O Asaas de mentira: cliente, assinatura, parcelamento (`POST /payments`) e troca de valor. */
function asaasSimulado(parcelamento = 'ins_novo') {
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
    if (metodo === 'POST' && url.endsWith('/payments'))
      return json({ id: 'pay_p1', installment: parcelamento, invoiceUrl: 'https://sandbox.asaas.com/i/p1' })
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

async function assinar(userId: string, corpo: Record<string, unknown>, parcelamento?: string) {
  await idades.declarar(asUserId(userId), '1990-01-01')
  const chamadas = asaasSimulado(parcelamento)
  const res = mockRes()
  await rota(billingRouter, '/assinar', 'post')(req(userId, corpo), res)
  return { res, chamadas }
}

/** A parcela do 12x confirmada, conferida por um verificador que devolve o que a API diria dela. */
async function parcela(userId: string, evento: string, parcelamento: string, valor: number, numero = 1) {
  const pagamento = {
    id: `pay_${evento}`,
    status: 'CONFIRMED',
    value: valor,
    installment: parcelamento,
    installmentNumber: numero,
    billingType: 'CREDIT_CARD',
    dueDate: '2026-11-01',
    externalReference: userId,
  }
  return aplicarEvento(
    {
      id: evento,
      event: 'PAYMENT_CONFIRMED',
      payment: { id: pagamento.id, installment: parcelamento, externalReference: userId, value: valor },
    },
    'req-teste',
    async () => pagamento,
  )
}

const ligar = (chave: string, habilitada: boolean) => flags.definirFlag(chave, { habilitada }, 'teste')

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  process.env.ANUAL_ENABLED = '1'
  ;({ billingRouter } = (await h.load('../../server/routes/billing')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ idadesRepo: idades } = (await h.load('../../server/db/repositories/idades')) as any)
  ;({ testesPremiumRepo: testes } = (await h.load('../../server/db/repositories/testesPremium')) as any)
  ;({ aplicarEvento } = (await h.load('../../server/lib/billingEventos')) as any)
  flags = (await h.load('../../server/lib/flags')) as typeof flags
  ent = await h.load('../../server/lib/entitlements')
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  delete process.env.ASAAS_API_KEY
  delete process.env.ANUAL_ENABLED
  await h.cleanup()
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const chave of [FLAG_VENDA_PLANOS_V4, FLAG_VENDA_FAMILIA, FLAG_VENDA_PRO4, FLAG_VENDA_PLANOS_V3])
    await ligar(chave, false)
})

describe('POST /api/billing/assinar com `venda_planos_v4` ligada', () => {
  it('o Plus mensal sai a R$ 14,90 e grava a intenção `plus` sem conceder', async () => {
    await ligar(FLAG_VENDA_PLANOS_V4, true)
    const { res, chamadas } = await assinar('v4-plus-mensal', pedido('plus'))
    expect(res.statusCode).toBe(200)
    const criada = chamadas.find((c) => c.metodo === 'POST' && c.url.endsWith('/subscriptions'))
    expect(criada?.corpo).toMatchObject({ cycle: 'MONTHLY', value: 14.9 })
    const u = asUserId('v4-plus-mensal')
    expect(await subs.getActive(u)).toMatchObject({ plan: 'plus', status: 'trialing', planoDaCobranca: 'plus' })
    expect(await ent.getPlanForUser(u)).toBe('free')
  })

  it('o Plus anual em 12x é um parcelamento de R$ 149,00 com o plano gravado junto do id', async () => {
    await ligar(FLAG_VENDA_PLANOS_V4, true)
    const { res, chamadas } = await assinar(
      'v4-plus-12x',
      pedido('plus', { ciclo: 'anual', meio: 'parcelamento' }),
      'ins_plus_12x',
    )
    expect(res.statusCode).toBe(200)
    const criar = chamadas.find((c) => c.metodo === 'POST' && c.url.endsWith('/payments'))
    expect(criar?.corpo).toMatchObject({ installmentCount: 12, totalValue: 149 })
    expect(await subs.getActive(asUserId('v4-plus-12x'))).toMatchObject({
      plan: 'plus',
      status: 'trialing',
      ciclo: 'anual',
      meio: 'parcelamento',
      providerInstallmentId: 'ins_plus_12x',
      planoDaCobranca: 'plus',
    })
  })

  it.each(['premium', 'essencial', 'familia', 'pro4'])(
    '%s: 503 sem falar com o Asaas nem gravar intenção',
    async (plano) => {
      await ligar(FLAG_VENDA_PLANOS_V4, true)
      await ligar(FLAG_VENDA_PLANOS_V3, true)
      const { res, chamadas } = await assinar(`v4-fechado-${plano}`, pedido(plano))
      expect(res.statusCode).toBe(503)
      expect(res.body.code).toBe('plano_indisponivel')
      expect(chamadas).toEqual([])
      expect(await subs.getActive(asUserId(`v4-fechado-${plano}`))).toBeNull()
    },
  )

  it('a Família e o Pro abrem só com a chave deles', async () => {
    await ligar(FLAG_VENDA_PLANOS_V4, true)
    await ligar(FLAG_VENDA_FAMILIA, true)
    expect((await assinar('v4-familia-aberta', pedido('familia'))).res.statusCode).toBe(200)
    expect((await assinar('v4-pro-fechado', pedido('pro4'))).res.statusCode).toBe(503)
  })

  it('sem a v4 o Plus, a Família e o Pro não estão à venda; o Premium segue como hoje', async () => {
    for (const plano of ['plus', 'familia', 'pro4']) {
      const { res, chamadas } = await assinar(`v3-${plano}`, pedido(plano))
      expect(res.statusCode, plano).toBe(503)
      expect(chamadas).toEqual([])
    }
    expect((await assinar('v3-premium', pedido('premium'))).res.statusCode).toBe(200)
  })
})

describe('POST /api/billing/trocar com a v4', () => {
  it('trocar o Premium mensal pelo Premium encerrado não vale, nem pela Família fechada: 503', async () => {
    await ligar(FLAG_VENDA_PLANOS_V4, true)
    const u = asUserId('v4-trocar')
    await idades.declarar(u, '1990-01-01')
    await subs.upsert(u, {
      plan: 'plus',
      status: 'active',
      provider: 'asaas',
      meio: 'assinatura',
      providerSubscriptionId: 'sub_trocar',
      currentPeriodEnd: Date.now() + 20 * DIA,
    })
    for (const plano of ['premium', 'familia', 'pro4', 'essencial']) {
      const chamadas = asaasSimulado()
      const res = mockRes()
      await rota(billingRouter, '/trocar', 'post')(req('v4-trocar', { plano }, { path: '/trocar' }), res)
      expect(res.statusCode, plano).toBe(503)
      expect(res.body.code).toBe('plano_indisponivel')
      expect(chamadas).toEqual([])
    }
  })
})

describe('GET /api/billing/status com a v4', () => {
  const status = async (userId: string) => {
    asaasSimulado()
    const res = mockRes()
    await rota(billingRouter, '/status', 'get')(req(userId, {}, { path: '/status' }), res)
    return res.body
  }

  it('à venda só o Plus; quem tem o Premium continua vendo a assinatura dele', async () => {
    await ligar(FLAG_VENDA_PLANOS_V4, true)
    const u = asUserId('v4-status-premium')
    await subs.upsert(u, { plan: 'premium', status: 'active', currentPeriodEnd: Date.now() + 10 * DIA })
    const corpo = await status('v4-status-premium')
    expect(corpo.planosAVenda).toEqual(['plus'])
    expect(corpo.assinatura).toMatchObject({ plano: 'premium', status: 'active' })
  })

  it('o teste disponível diz que plano ele dá: Plus com a v4, Premium sem ela', async () => {
    await idades.declarar(asUserId('v4-status-teste'), '1990-01-01')
    expect((await status('v4-status-teste')).teste).toMatchObject({ estado: 'disponivel', plano: 'premium' })
    await ligar(FLAG_VENDA_PLANOS_V4, true)
    expect((await status('v4-status-teste')).teste).toMatchObject({ estado: 'disponivel', plano: 'plus' })
  })
})

/** O pagamento de uma assinatura (mensal ou anual à vista) confirmado, conferido pelo verificador. */
async function pagamentoDeAssinatura(userId: string, evento: string, assinatura: string, valor: number) {
  const pagamento = {
    id: `pay_${evento}`,
    status: 'CONFIRMED',
    value: valor,
    subscription: assinatura,
    billingType: 'CREDIT_CARD',
    dueDate: '2026-11-01',
    externalReference: userId,
  }
  return aplicarEvento(
    {
      id: evento,
      event: 'PAYMENT_CONFIRMED',
      payment: { id: pagamento.id, subscription: assinatura, externalReference: userId, value: valor },
    },
    'req-teste',
    async () => pagamento,
  )
}

describe('webhook — o pagamento do Plus chega como `plus` com o ciclo certo', () => {
  it('mensal R$ 14,90 → plus, ciclo mensal', async () => {
    await ligar(FLAG_VENDA_PLANOS_V4, true)
    await assinar('v4-wh-plus-mensal', pedido('plus'))
    const r = await pagamentoDeAssinatura('v4-wh-plus-mensal', 'evt_wh_plus_mensal', 'sub_novo', 14.9)
    expect(r.estado).toBe('aplicado')
    const u = asUserId('v4-wh-plus-mensal')
    expect(await subs.getActive(u)).toMatchObject({ plan: 'plus', status: 'active', ciclo: 'mensal' })
    expect(await ent.getPlanForUser(u)).toBe('plus')
  })

  it('anual à vista R$ 149,00 → plus, ciclo anual', async () => {
    await ligar(FLAG_VENDA_PLANOS_V4, true)
    await assinar('v4-wh-plus-anual', pedido('plus', { ciclo: 'anual' }))
    const r = await pagamentoDeAssinatura('v4-wh-plus-anual', 'evt_wh_plus_anual', 'sub_novo', 149)
    expect(r.estado).toBe('aplicado')
    const u = asUserId('v4-wh-plus-anual')
    expect(await subs.getActive(u)).toMatchObject({ plan: 'plus', status: 'active', ciclo: 'anual' })
    expect(await ent.getPlanForUser(u)).toBe('plus')
  })
})

describe('webhook — a parcela ambígua de R$ 12,49', () => {
  it('do checkout do Plus 12x → Plus (o vínculo é o plano gravado para ESTE parcelamento)', async () => {
    await ligar(FLAG_VENDA_PLANOS_V4, true)
    await assinar('v4-wh-plus', pedido('plus', { ciclo: 'anual', meio: 'parcelamento' }), 'ins_wh_plus')
    const r = await parcela('v4-wh-plus', 'evt_wh_plus_12', 'ins_wh_plus', 12.49, 12)
    expect(r.estado).toBe('aplicado')
    const u = asUserId('v4-wh-plus')
    expect(await subs.getActive(u)).toMatchObject({ plan: 'plus', status: 'active', ciclo: 'anual' })
    expect(await ent.getPlanForUser(u)).toBe('plus')
  })

  it('do parcelamento do Premium → Premium', async () => {
    const u = asUserId('v4-wh-premium')
    await subs.upsert(u, {
      plan: 'premium',
      status: 'trialing',
      provider: 'asaas',
      ciclo: 'anual',
      meio: 'parcelamento',
      providerInstallmentId: 'ins_wh_prem',
      planoDaCobranca: 'premium',
    })
    const r = await parcela('v4-wh-premium', 'evt_wh_prem_1', 'ins_wh_prem', 12.49)
    expect(r.estado).toBe('aplicado')
    expect(await subs.getActive(u)).toMatchObject({ plan: 'premium', status: 'active' })
  })

  it('sem linha nenhuma (sem intenção) → não concede, fica pendente e nada é criado', async () => {
    const r = await parcela('v4-wh-sem', 'evt_wh_sem', 'ins_wh_sem', 12.49)
    expect(r.estado).toBe('nao-aplicado')
    expect(r.motivo).toMatch(/parcela/)
    expect(await subs.getActive(asUserId('v4-wh-sem'))).toBeNull()
  })

  it('linha de OUTRO parcelamento → não concede e não mexe na linha', async () => {
    const u = asUserId('v4-wh-outro')
    await subs.upsert(u, {
      plan: 'premium',
      status: 'trialing',
      provider: 'asaas',
      meio: 'parcelamento',
      providerInstallmentId: 'ins_registrado',
      planoDaCobranca: 'premium',
    })
    const r = await parcela('v4-wh-outro', 'evt_wh_outro', 'ins_desconhecido', 12.49)
    expect(r.estado).toBe('nao-aplicado')
    expect(await subs.getActive(u)).toMatchObject({
      plan: 'premium',
      status: 'trialing',
      providerInstallmentId: 'ins_registrado',
    })
  })

  it('linha com o plano gravado Grátis → não concede', async () => {
    const u = asUserId('v4-wh-free')
    await subs.upsert(u, { plan: 'free', status: 'active', meio: 'parcelamento', providerInstallmentId: 'ins_free' })
    const r = await parcela('v4-wh-free', 'evt_wh_free', 'ins_free', 12.49)
    expect(r.estado).toBe('nao-aplicado')
    expect(await subs.getActive(u)).toMatchObject({ plan: 'free' })
  })

  it('a parcela que não colide decide sozinha: 12,41 é Plus', async () => {
    const u = asUserId('v4-wh-unicos')
    const r1 = await parcela('v4-wh-unicos', 'evt_wh_u1', 'ins_u', 12.41)
    expect(r1.estado).toBe('aplicado')
    expect(await subs.getActive(u)).toMatchObject({ plan: 'plus', planoDaCobranca: 'plus' })
  })
})

describe('Premium 12x de antes + /assinar do Plus: a parcela do Premium não rebaixa, nem o contrário', () => {
  const premium12x = async (id: string, status: 'active' | 'canceled') => {
    const u = asUserId(id)
    await idades.declarar(u, '1990-01-01')
    await subs.upsert(u, {
      plan: 'premium',
      status,
      provider: 'asaas',
      providerCustomerId: 'cus_velho',
      ciclo: 'anual',
      meio: 'parcelamento',
      providerInstallmentId: 'ins_prem_velho',
      planoDaCobranca: 'premium',
      currentPeriodEnd: Date.now() + 200 * DIA,
      cancelAtPeriodEnd: status === 'canceled' ? 1 : 0,
    })
    return u
  }

  it('em andamento: /assinar do Plus é 409 e a parcela 12,49 do Premium segue Premium', async () => {
    await ligar(FLAG_VENDA_PLANOS_V4, true)
    const u = await premium12x('v4-cruz-ativo', 'active')
    const { res, chamadas } = await assinar('v4-cruz-ativo', pedido('plus', { ciclo: 'anual', meio: 'parcelamento' }))
    expect(res.statusCode).toBe(409)
    expect(chamadas).toEqual([])
    const r = await parcela('v4-cruz-ativo', 'evt_cruz_ativo', 'ins_prem_velho', 12.49, 3)
    expect(r.estado).toBe('aplicado')
    expect(await subs.getActive(u)).toMatchObject({ plan: 'premium' })
  })

  it('cancelado: parcela 12,49 do Premium antes da do Plus → não concede; a do Plus dá o Plus', async () => {
    await ligar(FLAG_VENDA_PLANOS_V4, true)
    const u = await premium12x('v4-cruz-a', 'canceled')
    const { res } = await assinar(
      'v4-cruz-a',
      pedido('plus', { ciclo: 'anual', meio: 'parcelamento' }),
      'ins_plus_novo',
    )
    expect(res.statusCode).toBe(200)
    // `/assinar` NÃO troca `plan` de uma linha existente (GAP-001): o vínculo vem do plano DA COBRANÇA.
    expect(await subs.getActive(u)).toMatchObject({
      plan: 'premium',
      providerInstallmentId: 'ins_plus_novo',
      planoDaCobranca: 'plus',
    })

    const velha = await parcela('v4-cruz-a', 'evt_cruz_a_prem', 'ins_prem_velho', 12.49, 4)
    expect(velha.estado).toBe('nao-aplicado')
    expect(await subs.getActive(u)).toMatchObject({ plan: 'premium', providerInstallmentId: 'ins_plus_novo' })

    const nova = await parcela('v4-cruz-a', 'evt_cruz_a_plus', 'ins_plus_novo', 12.49, 12)
    expect(nova.estado).toBe('aplicado')
    expect(await subs.getActive(u)).toMatchObject({ plan: 'plus', status: 'active' })
  })

  it('cancelado: a do Plus antes, a do Premium depois → segue Plus', async () => {
    await ligar(FLAG_VENDA_PLANOS_V4, true)
    const u = await premium12x('v4-cruz-b', 'canceled')
    await assinar('v4-cruz-b', pedido('plus', { ciclo: 'anual', meio: 'parcelamento' }), 'ins_plus_b')
    expect((await parcela('v4-cruz-b', 'evt_cruz_b_plus', 'ins_plus_b', 12.49, 12)).estado).toBe('aplicado')
    expect((await parcela('v4-cruz-b', 'evt_cruz_b_prem', 'ins_prem_velho', 12.49, 5)).estado).toBe('nao-aplicado')
    expect(await subs.getActive(u)).toMatchObject({
      plan: 'plus',
      status: 'active',
      providerInstallmentId: 'ins_plus_b',
    })
  })
})

describe('o teste de 14 dias', () => {
  const testar = async (userId: string) => {
    await idades.declarar(asUserId(userId), '1990-01-01')
    asaasSimulado()
    const res = mockRes()
    await rota(billingRouter, '/teste', 'post')(req(userId, {}, { path: '/teste' }), res)
    return res
  }

  it('com a v4 o teste é do Plus, gravado no início', async () => {
    await ligar(FLAG_VENDA_PLANOS_V4, true)
    const res = await testar('v4-teste-plus')
    expect(res.statusCode).toBe(200)
    expect(res.body.teste.plano).toBe('plus')
    const u = asUserId('v4-teste-plus')
    expect(await testes.doUsuario(u)).toMatchObject({ plano: 'plus' })
    expect(await ent.resolverPlano(u)).toMatchObject({ plano: 'plus' })
  })

  it('sem a v4 o teste é do Premium — e quem começou no Premium segue nele com a v4 ligada depois', async () => {
    const res = await testar('v4-teste-premium')
    expect(res.statusCode).toBe(200)
    expect(res.body.teste.plano).toBe('premium')
    await ligar(FLAG_VENDA_PLANOS_V4, true)
    expect(await ent.resolverPlano(asUserId('v4-teste-premium'))).toMatchObject({ plano: 'premium' })
  })

  it('o teste de antes da coluna (`plano` nulo) é Premium', async () => {
    const u = asUserId('v4-teste-legado')
    await testes.iniciar(u, 'marca-legado', Date.now(), Date.now() + 14 * DIA)
    expect(await ent.resolverPlano(u)).toMatchObject({ plano: 'premium' })
  })
})
