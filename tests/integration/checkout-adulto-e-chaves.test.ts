/**
 * QUEM PAGA É ADULTO, E AS CHAVES DE EMERGÊNCIA (Fase 3 do plano de lançamento).
 *
 * 1. `/api/billing/assinar` e `/comprar` exigem titular com 18+ declarado: menor não compra nada
 *    com dinheiro (ECA Digital art. 18, II); sem data declarada, também não.
 * 2. O responsável VINCULADO assina pelo menor (`paraUsuario`) — a assinatura nasce na conta do
 *    menor (externalReference = id do menor). Sem vínculo, recusado.
 * 3. Só mensal: a assinatura criada no Asaas é `MONTHLY`.
 * 4. `CHECKOUT_ENABLED=0` fecha a venda com mensagem clara, e quem já paga continua com o plano.
 * 5. `SIGNUP_ENABLED=0` fecha a porta para contas NOVAS; quem já tem conta segue entrando.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste
const tokens: Record<string, string> = {}
async function tk(sub: string): Promise<string> {
  tokens[sub] ??= await s.token(sub)
  return tokens[sub]
}
function nascidoHa(anos: number): string {
  const d = new Date(Date.now() - 40 * 86_400_000)
  d.setUTCFullYear(d.getUTCFullYear() - anos)
  return d.toISOString().slice(0, 10)
}
async function declarar(sub: string, anos: number) {
  expect((await s.put('/api/me/idade', { nascimento: nascidoHa(anos) }, await tk(sub))).status).toBe(200)
}
const pedido = { plano: 'pro', nome: 'Ana Souza', cpfCnpj: '12345678901', email: 'ana@exemplo.com' }
const creditos = { sku: 'c100', nome: 'Ana Souza', cpfCnpj: '12345678901' }

/** Asaas simulado: só o que o checkout usa. O `fetch` real segue para o servidor de teste. */
function asaasSimulado() {
  const corpos: Array<{ url: string; body: any }> = []
  const real = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input)
    if (!url.includes('asaas')) return real(input, init)
    corpos.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
    const json = (b: unknown) =>
      new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (url.endsWith('/customers')) return json({ id: 'cus_1' })
    if (url.endsWith('/subscriptions')) return json({ id: 'sub_1' })
    if (url.includes('/payments?'))
      return json({ data: [{ id: 'pay_1', invoiceUrl: 'https://sandbox.asaas.com/i/1' }] })
    if (url.endsWith('/payments')) return json({ id: 'pay_av', invoiceUrl: 'https://sandbox.asaas.com/i/2' })
    return json({})
  })
  return corpos
}

beforeAll(async () => {
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  process.env.ASAAS_BASE_URL = 'https://api-sandbox.asaas.com/v3'
  process.env.CONVITE_LINK_NA_TELA = '1'
  s = await subirApp({ modo: 'publico' })
})
afterAll(async () => {
  delete process.env.ASAAS_API_KEY
  delete process.env.ASAAS_BASE_URL
  delete process.env.CONVITE_LINK_NA_TELA
  await s.encerrar()
})
afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.CHECKOUT_ENABLED
  delete process.env.SIGNUP_ENABLED
})

describe('quem paga é adulto', () => {
  it('sem data de nascimento declarada: não assina', async () => {
    asaasSimulado()
    const r = await s.post('/api/billing/assinar', pedido, await tk('p-sem-data'))
    expect(r.status).toBe(403)
    expect((await r.json()).code).toBe('idade_nao_informada')
  })

  it('menor não assina nem compra créditos', async () => {
    const corpos = asaasSimulado()
    await declarar('p-menor', 17)
    const a = await s.post('/api/billing/assinar', pedido, await tk('p-menor'))
    expect(a.status).toBe(403)
    expect((await a.json()).code).toBe('menor_nao_compra')
    const c = await s.post('/api/billing/comprar', creditos, await tk('p-menor'))
    expect(c.status).toBe(403)
    expect(corpos, 'nada chegou ao Asaas').toHaveLength(0)
  })

  it('adulto assina — e a assinatura é mensal', async () => {
    const corpos = asaasSimulado()
    await declarar('p-adulto', 35)
    const r = await s.post('/api/billing/assinar', pedido, await tk('p-adulto'))
    expect(r.status).toBe(200)
    const assinatura = corpos.find((c) => c.url.endsWith('/subscriptions'))
    expect(assinatura?.body).toMatchObject({ cycle: 'MONTHLY', externalReference: 'p-adulto' })
  })

  it('o responsável vinculado assina pelo menor; sem vínculo, não', async () => {
    await declarar('p-filho', 13)
    const convite = await (
      await s.post('/api/me/responsavel/convite', { email: 'mae@exemplo.com' }, await tk('p-filho'))
    ).json()
    const token = new URL(convite.linkDeTeste, 'http://x').searchParams.get('token')
    await declarar('p-mae', 40)
    const aceite = await s.post(
      '/api/responsavel/aceitar',
      { token, nomeDoResponsavel: 'Mãe', declaroSerResponsavelLegal: true },
      await tk('p-mae'),
    )
    expect(aceite.status).toBe(200)

    const corpos = asaasSimulado()
    const r = await s.post('/api/billing/assinar', { ...pedido, paraUsuario: 'p-filho' }, await tk('p-mae'))
    expect(r.status).toBe(200)
    const assinatura = corpos.find((c) => c.url.endsWith('/subscriptions'))
    expect(assinatura?.body.externalReference, 'a assinatura é da conta do menor').toBe('p-filho')

    const estranho = await s.post('/api/billing/assinar', { ...pedido, paraUsuario: 'p-filho' }, await tk('p-adulto'))
    expect(estranho.status).toBe(403)
    expect((await estranho.json()).code).toBe('sem_vinculo')
  })
})

describe('CHECKOUT_ENABLED', () => {
  it('desligado: assinar e comprar respondem 503 com mensagem clara; quem já paga segue com o plano', async () => {
    const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
    await subscriptionsRepo.upsert('p-ja-paga', { plan: 'pro', status: 'active' })
    process.env.CHECKOUT_ENABLED = '0'
    const corpos = asaasSimulado()
    const a = await s.post('/api/billing/assinar', pedido, await tk('p-adulto'))
    expect(a.status).toBe(503)
    const corpo = await a.json()
    expect(corpo.code).toBe('checkout_desligado')
    expect(corpo.error).toMatch(/pausad|temporariamente/i)
    expect((await s.post('/api/billing/comprar', creditos, await tk('p-adulto'))).status).toBe(503)
    expect(corpos).toHaveLength(0)
    const ent = await (await s.get('/api/me/entitlements', await tk('p-ja-paga'))).json()
    expect(ent.plan).toBe('pro')
    const abertura = await (await s.get('/api/abertura')).json()
    expect(abertura).toMatchObject({ checkout: false })
  })
})

describe('SIGNUP_ENABLED', () => {
  it('desligado: conta nova é recusada com mensagem clara; conta existente segue', async () => {
    await s.get('/api/me/entitlements', await tk('p-antiga'))
    process.env.SIGNUP_ENABLED = '0'
    const nova = await s.get('/api/me/entitlements', await tk('p-nova-em-folha'))
    expect(nova.status).toBe(403)
    expect((await nova.json()).code).toBe('cadastro_fechado')
    expect((await s.get('/api/me/entitlements', await tk('p-antiga'))).status).toBe(200)
    const abertura = await (await s.get('/api/abertura')).json()
    expect(abertura).toMatchObject({ cadastro: false })
  })
})
