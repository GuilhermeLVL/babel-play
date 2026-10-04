/**
 * `ANUAL_ENABLED=0` — O MVP VENDE SÓ O MENSAL (e o teste de 14 dias).
 *
 * O anual (à vista e em 12x) fica desligado até o jurídico validar os Termos §3–§4
 * (`docs/ESTADO-DO-LANCAMENTO.md`). É uma chave do mesmo molde de `CHECKOUT_ENABLED`:
 *
 * 1. Ausente = LIGADA (nenhum contrato de antes muda); `0`/`false` desliga.
 * 2. Desligada, `POST /api/billing/assinar` com `ciclo: 'anual'` — em qualquer meio, inclusive o
 *    parcelamento — responde 503 `anual_indisponivel` com mensagem clara, ANTES de falar com o Asaas.
 * 3. O mensal segue vendendo.
 * 4. `GET /api/abertura` diz `anual`, para a tela não oferecer o que o servidor recusaria.
 * 5. Quem JÁ tem o anual não é afetado: o status continua dizendo o plano e o ciclo dele.
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
async function adulto(sub: string) {
  expect((await s.put('/api/me/idade', { nascimento: nascidoHa(35) }, await tk(sub))).status).toBe(200)
}
const pedido = { plano: 'premium', nome: 'Ana Souza', cpfCnpj: '12345678901', email: 'ana@exemplo.com' }

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
    if (url.endsWith('/payments'))
      return json({ id: 'pay_p1', installment: 'ins_1', invoiceUrl: 'https://sandbox.asaas.com/i/2' })
    return json({})
  })
  return corpos
}

beforeAll(async () => {
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  process.env.ASAAS_BASE_URL = 'https://api-sandbox.asaas.com/v3'
  s = await subirApp({ modo: 'publico' })
})
afterAll(async () => {
  delete process.env.ASAAS_API_KEY
  delete process.env.ASAAS_BASE_URL
  await s.encerrar()
})
afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.ANUAL_ENABLED
})

describe('ANUAL_ENABLED', () => {
  it('anualLigado: ausente = ligado; só `0` e `false` desligam', async () => {
    const { anualLigado } = await import('../../server/lib/config')
    expect(anualLigado({})).toBe(true)
    expect(anualLigado({ ANUAL_ENABLED: '1' })).toBe(true)
    expect(anualLigado({ ANUAL_ENABLED: 'sim' })).toBe(true)
    expect(anualLigado({ ANUAL_ENABLED: '0' })).toBe(false)
    expect(anualLigado({ ANUAL_ENABLED: ' False ' })).toBe(false)
  })

  it('desligado: o anual à vista responde 503 anual_indisponivel, sem chamar o Asaas', async () => {
    await adulto('an-avista')
    process.env.ANUAL_ENABLED = '0'
    const corpos = asaasSimulado()
    const r = await s.post(
      '/api/billing/assinar',
      { ...pedido, ciclo: 'anual', meio: 'assinatura' },
      await tk('an-avista'),
    )
    expect(r.status).toBe(503)
    const corpo = await r.json()
    expect(corpo.code).toBe('anual_indisponivel')
    expect(corpo.error).toBe('O plano anual ainda não está à venda. Você pode assinar o mensal.')
    expect(corpos, 'nada chegou ao Asaas').toHaveLength(0)
  })

  it('desligado: o 12x (parcelamento) e o anual sem `meio` também são recusados, sem chamar o Asaas', async () => {
    await adulto('an-12x')
    process.env.ANUAL_ENABLED = 'false'
    const corpos = asaasSimulado()
    const doze = await s.post(
      '/api/billing/assinar',
      { ...pedido, ciclo: 'anual', meio: 'parcelamento' },
      await tk('an-12x'),
    )
    expect(doze.status).toBe(503)
    expect((await doze.json()).code).toBe('anual_indisponivel')
    const semMeio = await s.post('/api/billing/assinar', { ...pedido, ciclo: 'anual' }, await tk('an-12x'))
    expect(semMeio.status).toBe(503)
    expect((await semMeio.json()).code).toBe('anual_indisponivel')
    expect(corpos, 'nada chegou ao Asaas').toHaveLength(0)
  })

  it('desligado: o mensal segue vendendo', async () => {
    await adulto('an-mensal')
    process.env.ANUAL_ENABLED = '0'
    const corpos = asaasSimulado()
    const r = await s.post('/api/billing/assinar', { ...pedido, ciclo: 'mensal' }, await tk('an-mensal'))
    expect(r.status).toBe(200)
    expect((await r.json()).linkDePagamento).toBe('https://sandbox.asaas.com/i/1')
    expect(corpos.find((c) => c.url.endsWith('/subscriptions'))?.body).toMatchObject({ cycle: 'MONTHLY' })
  })

  it('ligado (ausente): o anual vende como sempre', async () => {
    await adulto('an-ligado')
    const corpos = asaasSimulado()
    const r = await s.post(
      '/api/billing/assinar',
      { ...pedido, ciclo: 'anual', meio: 'assinatura' },
      await tk('an-ligado'),
    )
    expect(r.status).toBe(200)
    expect(corpos.find((c) => c.url.endsWith('/subscriptions'))?.body).toMatchObject({ cycle: 'YEARLY' })
  })

  it('a abertura devolve `anual`, lida em tempo de chamada, sem mexer nas outras portas', async () => {
    expect(await (await s.get('/api/abertura')).json()).toEqual({ cadastro: true, checkout: true, anual: true })
    process.env.ANUAL_ENABLED = '0'
    expect(await (await s.get('/api/abertura')).json()).toEqual({ cadastro: true, checkout: true, anual: false })
  })

  it('quem JÁ tem o anual não é afetado: o status segue dizendo o plano e o ciclo', async () => {
    const { subscriptionsRepo } = await s.load('../../server/db/repositories/subscriptions')
    await s.get('/api/me/entitlements', await tk('an-ja-tem'))
    await subscriptionsRepo.upsert('an-ja-tem', {
      plan: 'premium',
      status: 'active',
      ciclo: 'anual',
      meio: 'assinatura',
      currentPeriodEnd: Date.now() + 200 * 86_400_000,
    })
    process.env.ANUAL_ENABLED = '0'
    const ent = await (await s.get('/api/me/entitlements', await tk('an-ja-tem'))).json()
    expect(ent.plan).toBe('premium')
    const status = await (await s.get('/api/billing/status', await tk('an-ja-tem'))).json()
    expect(status.assinatura).toMatchObject({ plano: 'premium', status: 'active', ciclo: 'anual' })
  })
})
