/**
 * TROCA DE PLANO (change `planos-v3-e-rota-inteligente`, etapa 8; `design.md` §11, item 11).
 *
 * Quem já assina no MENSAL troca para outro plano pago sem cancelar. A REGRA: vale no PRÓXIMO ciclo,
 * sem pro-rata. `POST /api/billing/trocar` só muda o VALOR da assinatura no Asaas (a cobrança já paga
 * não é tocada) e grava a intenção (`troca_para`, `troca_a_partir_de`); o plano concedido continua o
 * que está pago, e só muda quando o webhook confirmar um pagamento do valor novo — o webhook concede
 * pelo valor, então a cobrança antiga que já estava emitida mantém o plano atual.
 *
 * O Asaas é simulado por URL, como em `planos-v3-venda.test.ts`: nenhum teste fala com ele.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { FLAG_VENDA_PLANOS_V3, PLANO_DO_TESTE } from '../../src/core/planos'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let billingRouter: any
let asaasWebhookRouter: any
let subs: any
let ent: any
let idades: any
let testes: any
let flags: typeof import('../../server/lib/flags')

const SEGREDO = 'segredo-webhook-troca'
const DIA = 86_400_000
const PROXIMA = '2026-11-12'
const SEGUINTE = '2026-12-12'

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
const req = (userId: string, body: unknown = {}, caminho = '/trocar') => ({
  userId: asUserId(userId),
  requestId: 'req-teste',
  path: caminho,
  body,
  header: () => undefined,
})

interface Simulado {
  /** Os pagamentos que `GET /payments/{id}` devolve (a conferência do webhook). */
  pagamentos?: Record<string, Record<string, unknown>>
  /** As cobranças da assinatura (`GET /subscriptions/{id}/payments`). */
  cobrancas?: Array<Record<string, unknown>>
  /** O que o `PUT /subscriptions/{id}` responde; por padrão, a assinatura com o valor pedido. */
  alterar?: (corpo: any) => Response
}

/** Um Asaas de mentira. Devolve as chamadas feitas, para o teste conferir o que saiu. */
function asaasSimulado(s: Simulado = {}) {
  const chamadas: Array<{ metodo: string; url: string; corpo: any }> = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input)
    const metodo = String(init?.method ?? 'GET')
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined
    chamadas.push({ metodo, url, corpo })
    const assinatura = /\/subscriptions\/([^/?]+)$/.exec(url)
    if (metodo === 'PUT' && assinatura) {
      if (s.alterar) return s.alterar(corpo)
      return json({ id: assinatura[1], value: corpo.value, nextDueDate: SEGUINTE, status: 'ACTIVE' })
    }
    if (metodo === 'GET' && /\/subscriptions\/[^/]+\/payments/.test(url)) {
      return json({ data: s.cobrancas ?? [{ id: 'pay_pendente', status: 'PENDING', value: 0, dueDate: PROXIMA }] })
    }
    if (metodo === 'GET' && assinatura) return json({ id: assinatura[1], nextDueDate: SEGUINTE })
    const pagamento = /\/payments\/([^/?]+)$/.exec(url)
    if (metodo === 'GET' && pagamento) {
      const p = s.pagamentos?.[decodeURIComponent(pagamento[1])]
      return p ? json(p) : json({ errors: [{ code: 'not_found' }] }, 404)
    }
    return json({ erro: 'rota não simulada' }, 404)
  })
  return chamadas
}

const alteracoes = (chamadas: Array<{ metodo: string; url: string; corpo: any }>) =>
  chamadas.filter((c) => c.metodo === 'PUT')

/** Um assinante do mensal, em dia, adulto declarado. */
async function assinante(id: string, plano: string, patch: Record<string, unknown> = {}, nascimento = '1990-01-01') {
  await idades.declarar(asUserId(id), nascimento)
  await subs.upsert(asUserId(id), {
    plan: plano,
    status: 'active',
    provider: 'asaas',
    meio: 'assinatura',
    ciclo: 'mensal',
    providerCustomerId: `cus_${id}`,
    providerSubscriptionId: `sub_${id}`,
    currentPeriodEnd: Date.now() + 20 * DIA,
    ...patch,
  })
}

async function trocar(id: string, plano: unknown, simulado: Simulado = {}) {
  const chamadas = asaasSimulado(simulado)
  const res = mockRes()
  await rota(billingRouter, '/trocar', 'post')(req(id, { plano }), res)
  vi.restoreAllMocks()
  return { res, chamadas }
}

async function cancelarTroca(id: string, simulado: Simulado = {}) {
  const chamadas = asaasSimulado(simulado)
  const res = mockRes()
  await rota(billingRouter, '/trocar/cancelar', 'post')(req(id, {}, '/trocar/cancelar'), res)
  vi.restoreAllMocks()
  return { res, chamadas }
}

async function status(id: string) {
  asaasSimulado()
  const res = mockRes()
  await rota(billingRouter, '/status', 'get')(req(id, {}, '/status'), res)
  vi.restoreAllMocks()
  return res.body
}

/** O webhook de verdade, com o pagamento conferido na API simulada. */
async function webhook(evento: string, id: string, userId: string, value: number, statusNaApi = 'CONFIRMED') {
  const pay = `pay_${id}`
  const sub = `sub_${userId}`
  asaasSimulado({
    pagamentos: { [pay]: { id: pay, status: statusNaApi, value, subscription: sub, externalReference: userId } },
  })
  const res = mockRes()
  await rota(
    asaasWebhookRouter,
    '/',
    'post',
  )(
    {
      body: { id, event: evento, payment: { id: pay, subscription: sub, externalReference: userId, value } },
      header: (k: string) => (k.toLowerCase() === 'asaas-access-token' ? SEGREDO : undefined),
    },
    res,
  )
  vi.restoreAllMocks()
  return res
}

const linha = (id: string) => subs.getActive(asUserId(id))
const ligar = (chave: string, habilitada: boolean) => flags.definirFlag(chave, { habilitada }, 'teste')

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  process.env.ASAAS_WEBHOOK_TOKEN = SEGREDO
  ;({ billingRouter, asaasWebhookRouter } = (await h.load('../../server/routes/billing')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ idadesRepo: idades } = (await h.load('../../server/db/repositories/idades')) as any)
  ;({ testesPremiumRepo: testes } = (await h.load('../../server/db/repositories/testesPremium')) as any)
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
})

describe('alterarValorDaAssinatura (server/lib/asaas.ts)', () => {
  let asaas: typeof import('../../server/lib/asaas')
  beforeAll(async () => {
    asaas = (await h.load('../../server/lib/asaas')) as typeof asaas
  })

  it('PUT na assinatura com o valor, a descrição e as cobranças pendentes — sem mexer no vencimento', async () => {
    const chamadas = asaasSimulado()
    const r = await asaas.alterarValorDaAssinatura('sub_x/1', 19.9, 'Babel Play Premium')
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].metodo).toBe('PUT')
    expect(chamadas[0].url).toMatch(/\/subscriptions\/sub_x%2F1$/)
    expect(chamadas[0].corpo).toEqual({
      value: 19.9,
      description: 'Babel Play Premium',
      updatePendingPayments: true,
    })
    expect(r).toMatchObject({ value: 19.9, nextDueDate: SEGUINTE })
  })

  it('erro do Asaas sobe como exceção, sem a chave no texto', async () => {
    asaasSimulado({ alterar: () => new Response('pane', { status: 503 }) })
    const erro = await asaas.alterarValorDaAssinatura('sub_x', 19.9, 'd').catch((e) => String(e))
    expect(erro).toMatch(/HTTP 503/)
    expect(erro).not.toContain('chave-de-teste')
  })

  it('resposta 200 que não confirma o valor novo é falha: nada de gravar uma troca que não aconteceu', async () => {
    asaasSimulado({ alterar: () => json({ id: 'sub_x', value: 9.9 }) })
    await expect(asaas.alterarValorDaAssinatura('sub_x', 19.9, 'd')).rejects.toThrow(/não confirmou/)
  })
})

describe('a migração 0050', () => {
  const sql = readFileSync(path.join('server', 'db', 'migrations', '0050_troca_de_plano.sql'), 'utf8')

  it('só acrescenta as duas colunas da intenção de troca, e traz a reversão escrita', () => {
    const comandos = sql.replace(/--[^\n]*/g, '')
    expect(comandos.match(/ALTER TABLE `subscriptions` ADD/g)).toHaveLength(2)
    expect(comandos).not.toMatch(/\b(DROP|DELETE|UPDATE|CREATE)\b/i)
    expect(sql).toMatch(/^-- REVERS[AÃ]O:/m)
  })

  it('a linha nasce sem troca pendente', async () => {
    await assinante('u-mig', 'premium')
    expect(await linha('u-mig')).toMatchObject({ trocaPara: null, trocaAPartirDe: null })
  })
})

describe('POST /api/billing/trocar — subir', () => {
  it('Essencial → Premium: o Asaas passa ao valor novo, o plano concedido NÃO muda, a intenção fica gravada', async () => {
    await assinante('u-sobe', 'essencial')
    const { res, chamadas } = await trocar('u-sobe', 'premium')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      ok: true,
      planoAtual: 'essencial',
      trocaPendente: { plano: 'premium', aPartirDe: PROXIMA },
    })
    const put = alteracoes(chamadas)
    expect(put).toHaveLength(1)
    expect(put[0].url).toMatch(/\/subscriptions\/sub_u-sobe$/)
    expect(put[0].corpo).toMatchObject({ value: 19.9, updatePendingPayments: true })
    expect(put[0].corpo.description).toBe('Babel Play Premium')
    // Nada de cobrança nova, cancelamento ou estorno: só a alteração e a leitura das cobranças.
    expect(chamadas.filter((c) => c.metodo !== 'PUT' && c.metodo !== 'GET')).toEqual([])

    expect(await linha('u-sobe')).toMatchObject({
      plan: 'essencial',
      status: 'active',
      ciclo: 'mensal',
      providerSubscriptionId: 'sub_u-sobe',
      trocaPara: 'premium',
      trocaAPartirDe: PROXIMA,
    })
    expect(await ent.getPlanForUser(asUserId('u-sobe'))).toBe('essencial')
    expect(await ent.hasEntitlement(asUserId('u-sobe'), 'interpreteAutomatico')).toBe(false)
  })

  it('sem cobrança pendente emitida, a data é o próximo vencimento da assinatura', async () => {
    await assinante('u-sobe-sem-pendente', 'essencial')
    const { res } = await trocar('u-sobe-sem-pendente', 'premium', {
      cobrancas: [{ id: 'pay_paga', status: 'RECEIVED', value: 9.9, dueDate: '2026-10-12' }],
    })
    expect(res.body.trocaPendente).toEqual({ plano: 'premium', aPartirDe: SEGUINTE })
  })

  it('a listagem de cobranças falhando não desfaz a troca: vale o vencimento que o PUT devolveu', async () => {
    await assinante('u-sobe-lista-cai', 'essencial')
    const chamadas: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      chamadas.push(`${init?.method ?? 'GET'} ${String(input)}`)
      if (init?.method === 'PUT') return json({ id: 'sub', value: 19.9, nextDueDate: SEGUINTE })
      return new Response('pane', { status: 503 })
    })
    const res = mockRes()
    await rota(billingRouter, '/trocar', 'post')(req('u-sobe-lista-cai', { plano: 'premium' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.trocaPendente).toEqual({ plano: 'premium', aPartirDe: SEGUINTE })
    expect(await linha('u-sobe-lista-cai')).toMatchObject({ plan: 'essencial', trocaPara: 'premium' })
  })

  it('o nome antigo (`pro`) é lido como Premium, como em /assinar', async () => {
    await assinante('u-sobe-pro', 'essencial')
    const { res } = await trocar('u-sobe-pro', 'pro')
    expect(res.statusCode).toBe(200)
    expect(res.body.trocaPendente.plano).toBe('premium')
  })
})

describe('POST /api/billing/trocar — rebaixar segue a mesma regra', () => {
  it('Premium → Essencial: valor novo no Asaas, e o Premium pago continua até o pagamento do valor novo', async () => {
    await ligar(FLAG_VENDA_PLANOS_V3, true)
    await assinante('u-desce', 'premium')
    const { res, chamadas } = await trocar('u-desce', 'essencial')
    expect(res.statusCode).toBe(200)
    expect(alteracoes(chamadas)[0].corpo).toMatchObject({ value: 9.9, description: 'Babel Play Essencial' })
    expect(await linha('u-desce')).toMatchObject({ plan: 'premium', trocaPara: 'essencial', trocaAPartirDe: PROXIMA })
    expect(await ent.getPlanForUser(asUserId('u-desce'))).toBe('premium')
    expect(await ent.hasEntitlement(asUserId('u-desce'), 'interpreteAutomatico')).toBe(true)
  })
})

describe('a troca atravessa o webhook', () => {
  it('pagar o valor NOVO concede o plano novo e encerra a troca pendente', async () => {
    await assinante('u-paga-novo', 'essencial')
    await trocar('u-paga-novo', 'premium')
    const res = await webhook('PAYMENT_CONFIRMED', 'evt_paga_novo', 'u-paga-novo', 19.9)
    expect(res.body.estado).toBe('aplicado')
    // A troca pedida não é "divergência": o motivo diz o que aconteceu.
    expect(res.body.motivo).toMatch(/troca-de-plano/)
    expect(res.body.motivo).not.toMatch(/plano-divergente/)
    expect(await linha('u-paga-novo')).toMatchObject({
      plan: 'premium',
      status: 'active',
      ciclo: 'mensal',
      trocaPara: null,
      trocaAPartirDe: null,
    })
    expect(await ent.getPlanForUser(asUserId('u-paga-novo'))).toBe('premium')
    expect(await status('u-paga-novo')).not.toHaveProperty('trocaPendente')
  })

  it('pagar o valor ANTIGO depois de pedir a troca (cobrança já emitida) mantém o plano atual até a seguinte', async () => {
    await assinante('u-paga-antigo', 'essencial')
    await trocar('u-paga-antigo', 'premium')
    const antigo = await webhook('PAYMENT_CONFIRMED', 'evt_paga_antigo', 'u-paga-antigo', 9.9)
    expect(antigo.body.estado).toBe('aplicado')
    expect(await linha('u-paga-antigo')).toMatchObject({
      plan: 'essencial',
      status: 'active',
      trocaPara: 'premium',
      trocaAPartirDe: PROXIMA,
    })
    expect(await ent.getPlanForUser(asUserId('u-paga-antigo'))).toBe('essencial')
    expect((await status('u-paga-antigo')).trocaPendente).toEqual({ plano: 'premium', aPartirDe: PROXIMA })

    // A cobrança seguinte já sai no valor novo: aí o plano muda.
    await webhook('PAYMENT_RECEIVED', 'evt_paga_seguinte', 'u-paga-antigo', 19.9, 'RECEIVED')
    expect(await linha('u-paga-antigo')).toMatchObject({ plan: 'premium', trocaPara: null })
  })

  it('rebaixar: pagar R$ 9,90 concede o Essencial e tira o que era só do Premium', async () => {
    await ligar(FLAG_VENDA_PLANOS_V3, true)
    await assinante('u-desce-paga', 'premium')
    await trocar('u-desce-paga', 'essencial')
    await webhook('PAYMENT_CONFIRMED', 'evt_desce_paga', 'u-desce-paga', 9.9)
    expect(await linha('u-desce-paga')).toMatchObject({ plan: 'essencial', trocaPara: null })
    expect(await ent.hasEntitlement(asUserId('u-desce-paga'), 'interpreteAutomatico')).toBe(false)
  })

  it('chargeback DEPOIS da troca: o acesso acaba agora, como em qualquer plano', async () => {
    await assinante('u-cb-depois', 'essencial')
    await trocar('u-cb-depois', 'premium')
    await webhook('PAYMENT_CONFIRMED', 'evt_cb_depois_pago', 'u-cb-depois', 19.9)
    expect(await ent.getPlanForUser(asUserId('u-cb-depois'))).toBe('premium')

    const cb = await webhook(
      'PAYMENT_CHARGEBACK_REQUESTED',
      'evt_cb_depois',
      'u-cb-depois',
      19.9,
      'CHARGEBACK_REQUESTED',
    )
    expect(cb.body.estado).toBe('aplicado')
    const sub = await linha('u-cb-depois')
    expect(sub.status).toBe('canceled')
    expect(sub.currentPeriodEnd).toBeLessThanOrEqual(Date.now())
    expect(await ent.getPlanForUser(asUserId('u-cb-depois'))).toBe('free')
  })

  it('chargeback com a troca ainda PENDENTE: cai o acesso e a troca pendente some com ele', async () => {
    await assinante('u-cb-pendente', 'essencial')
    await trocar('u-cb-pendente', 'premium')
    const cb = await webhook(
      'PAYMENT_CHARGEBACK_REQUESTED',
      'evt_cb_pend',
      'u-cb-pendente',
      9.9,
      'CHARGEBACK_REQUESTED',
    )
    expect(cb.body.estado).toBe('aplicado')
    expect(await linha('u-cb-pendente')).toMatchObject({ status: 'canceled', trocaPara: null, trocaAPartirDe: null })
    expect(await ent.getPlanForUser(asUserId('u-cb-pendente'))).toBe('free')
    expect(await status('u-cb-pendente')).not.toHaveProperty('trocaPendente')
  })
})

describe('POST /api/billing/trocar/cancelar — desistir da troca antes da virada', () => {
  it('a assinatura volta ao valor do plano atual e a intenção some', async () => {
    await assinante('u-desiste', 'essencial')
    await trocar('u-desiste', 'premium')
    const { res, chamadas } = await cancelarTroca('u-desiste')
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, planoAtual: 'essencial', trocaPendente: null })
    const put = alteracoes(chamadas)
    expect(put).toHaveLength(1)
    expect(put[0].corpo).toMatchObject({
      value: 9.9,
      description: 'Babel Play Essencial',
      updatePendingPayments: true,
    })
    expect(await linha('u-desiste')).toMatchObject({ plan: 'essencial', trocaPara: null, trocaAPartirDe: null })
    expect(await status('u-desiste')).not.toHaveProperty('trocaPendente')
  })

  it('sem troca pendente: 404 com código, sem falar com o Asaas', async () => {
    await assinante('u-desiste-nada', 'premium')
    const { res, chamadas } = await cancelarTroca('u-desiste-nada')
    expect(res.statusCode).toBe(404)
    expect(res.body.code).toBe('sem_troca_pendente')
    expect(chamadas).toEqual([])
  })

  it('Asaas fora do ar: 502 e a troca continua pendente', async () => {
    await assinante('u-desiste-pane', 'essencial')
    await trocar('u-desiste-pane', 'premium')
    const { res } = await cancelarTroca('u-desiste-pane', { alterar: () => new Response('pane', { status: 503 }) })
    expect(res.statusCode).toBe(502)
    expect(await linha('u-desiste-pane')).toMatchObject({ trocaPara: 'premium', trocaAPartirDe: PROXIMA })
  })

  it('perfil protegido não desfaz a troca sozinho', async () => {
    await assinante('u-desiste-menor', 'essencial', { trocaPara: 'premium', trocaAPartirDe: PROXIMA }, '2012-01-01')
    const { res, chamadas } = await cancelarTroca('u-desiste-menor')
    expect(res.statusCode).toBe(403)
    expect(chamadas).toEqual([])
  })
})

describe('GET /api/billing/status — a troca pendente', () => {
  it('informa o plano de destino e a data; sem troca, o campo não existe', async () => {
    await assinante('u-status', 'essencial')
    expect(await status('u-status')).not.toHaveProperty('trocaPendente')
    await trocar('u-status', 'premium')
    const corpo = await status('u-status')
    expect(corpo.trocaPendente).toEqual({ plano: 'premium', aPartirDe: PROXIMA })
    // O plano mostrado continua o pago.
    expect(corpo.assinatura).toMatchObject({ plano: 'essencial', status: 'active', ciclo: 'mensal' })
  })
})

describe('POST /api/billing/trocar — recusas', () => {
  const semEfeito = async (id: string, chamadas: unknown[]) => {
    expect(chamadas).toEqual([])
    const sub = await linha(id)
    if (sub) expect(sub).toMatchObject({ trocaPara: null, trocaAPartirDe: null })
  }

  it('plano igual ao atual: 409 `mesmo_plano`', async () => {
    await assinante('u-r-igual', 'premium')
    const { res, chamadas } = await trocar('u-r-igual', 'premium')
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('mesmo_plano')
    await semEfeito('u-r-igual', chamadas)
  })

  it('plano fora de venda: o mesmo 503 `plano_indisponivel` de /assinar', async () => {
    await assinante('u-r-fechado', 'premium')
    for (const plano of ['essencial', 'aovivo']) {
      const { res, chamadas } = await trocar('u-r-fechado', plano)
      expect(res.statusCode, plano).toBe(503)
      expect(res.body.code, plano).toBe('plano_indisponivel')
      await semEfeito('u-r-fechado', chamadas)
    }
    // Só `venda_planos_v3` não vende o Ao Vivo.
    await ligar(FLAG_VENDA_PLANOS_V3, true)
    expect((await trocar('u-r-fechado', 'aovivo')).res.body.code).toBe('plano_indisponivel')
  })

  it.each(['free', 'selfhost', 'inventado', 7])('plano que não se vende (%s): 400', async (plano) => {
    await assinante('u-r-invalido', 'premium')
    const { res, chamadas } = await trocar('u-r-invalido', plano)
    expect(res.statusCode).toBe(400)
    await semEfeito('u-r-invalido', chamadas)
  })

  it('assinatura ANUAL: 409 `troca_so_no_mensal`, com mensagem para a tela', async () => {
    await ligar(FLAG_VENDA_PLANOS_V3, true)
    await assinante('u-r-anual', 'premium', { ciclo: 'anual' })
    const { res, chamadas } = await trocar('u-r-anual', 'essencial')
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('troca_so_no_mensal')
    expect(res.body.error).toMatch(/anual/i)
    await semEfeito('u-r-anual', chamadas)
  })

  it('anual em 12x (parcelamento): o mesmo 409', async () => {
    await ligar(FLAG_VENDA_PLANOS_V3, true)
    await assinante('u-r-12x', 'premium', {
      ciclo: 'anual',
      meio: 'parcelamento',
      providerSubscriptionId: null,
      providerInstallmentId: 'ins_1',
    })
    const { res, chamadas } = await trocar('u-r-12x', 'essencial')
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('troca_so_no_mensal')
    await semEfeito('u-r-12x', chamadas)
  })

  it('assinatura em atraso: 409 `assinatura_em_atraso`', async () => {
    await assinante('u-r-atraso', 'essencial', { status: 'past_due' })
    const { res, chamadas } = await trocar('u-r-atraso', 'premium')
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('assinatura_em_atraso')
    await semEfeito('u-r-atraso', chamadas)
  })

  it('assinatura cancelada (mesmo com período pago à frente): 409 `assinatura_cancelada`', async () => {
    await assinante('u-r-cancelada', 'essencial', { status: 'canceled', cancelAtPeriodEnd: 1 })
    const { res, chamadas } = await trocar('u-r-cancelada', 'premium')
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('assinatura_cancelada')
    await semEfeito('u-r-cancelada', chamadas)
  })

  it('em teste de 14 dias (sem assinatura paga): 409 `em_teste`', async () => {
    await idades.declarar(asUserId('u-r-teste'), '1990-01-01')
    const agora = Date.now()
    await testes.iniciar(asUserId('u-r-teste'), 'marca-u-r-teste', agora - DIA, agora + 13 * DIA)
    const { res, chamadas } = await trocar('u-r-teste', 'premium')
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('em_teste')
    expect(chamadas).toEqual([])
  })

  it('sem assinatura, só o checkout iniciado, ou plano concedido pelo admin: 409 `sem_assinatura_ativa`', async () => {
    await idades.declarar(asUserId('u-r-nada'), '1990-01-01')
    await assinante('u-r-trialing', 'essencial', { status: 'trialing' })
    await assinante('u-r-admin', 'essencial', { provider: null, meio: null, providerSubscriptionId: null })
    for (const id of ['u-r-nada', 'u-r-trialing', 'u-r-admin']) {
      const { res, chamadas } = await trocar(id, 'premium')
      expect(res.statusCode, id).toBe(409)
      expect(res.body.code, id).toBe('sem_assinatura_ativa')
      await semEfeito(id, chamadas)
    }
  })

  it('menor de 18: 403 `menor_nao_compra`', async () => {
    await assinante('u-r-menor', 'essencial', {}, '2012-01-01')
    const { res, chamadas } = await trocar('u-r-menor', 'premium')
    expect(res.statusCode).toBe(403)
    expect(res.body.code).toBe('menor_nao_compra')
    await semEfeito('u-r-menor', chamadas)
  })

  it('idade não declarada: 403 `idade_nao_informada`', async () => {
    await subs.upsert(asUserId('u-r-sem-idade'), {
      plan: 'essencial',
      status: 'active',
      provider: 'asaas',
      meio: 'assinatura',
      providerSubscriptionId: 'sub_u-r-sem-idade',
    })
    const { res, chamadas } = await trocar('u-r-sem-idade', 'premium')
    expect(res.statusCode).toBe(403)
    expect(res.body.code).toBe('idade_nao_informada')
    await semEfeito('u-r-sem-idade', chamadas)
  })

  it('cobrança não configurada: 501, como as outras rotas', async () => {
    await assinante('u-r-501', 'essencial')
    process.env.ASAAS_API_KEY = ''
    try {
      const { res } = await trocar('u-r-501', 'premium')
      expect(res.statusCode).toBe(501)
    } finally {
      process.env.ASAAS_API_KEY = 'chave-de-teste'
    }
  })
})

describe('POST /api/billing/trocar — o Asaas fora do ar', () => {
  it('502 e NADA muda no banco', async () => {
    await assinante('u-pane', 'essencial')
    const antes = await linha('u-pane')
    const { res } = await trocar('u-pane', 'premium', { alterar: () => new Response('pane', { status: 503 }) })
    expect(res.statusCode).toBe(502)
    expect(res.body.error).toMatch(/falha ao trocar/)
    expect(await linha('u-pane')).toEqual(antes)
    expect(await status('u-pane')).not.toHaveProperty('trocaPendente')
  })

  it('o Asaas responde 200 mas não confirma o valor novo: 502 e nada muda', async () => {
    await assinante('u-pane-valor', 'essencial')
    const antes = await linha('u-pane-valor')
    const { res } = await trocar('u-pane-valor', 'premium', { alterar: () => json({ id: 's', value: 9.9 }) })
    expect(res.statusCode).toBe(502)
    expect(await linha('u-pane-valor')).toEqual(antes)
  })
})

describe('POST /api/billing/trocar — chamada repetida', () => {
  it('a mesma troca pedida duas vezes: uma alteração só no Asaas, a mesma resposta', async () => {
    await assinante('u-repete', 'essencial')
    const primeira = await trocar('u-repete', 'premium')
    const depois = await linha('u-repete')
    const segunda = await trocar('u-repete', 'premium')
    expect(segunda.res.statusCode).toBe(200)
    expect(segunda.res.body).toEqual({ ...primeira.res.body, jaEstavaPedida: true })
    expect(alteracoes(segunda.chamadas)).toEqual([])
    expect(await linha('u-repete')).toEqual(depois)
  })

  it('pedir o plano ATUAL com uma troca pendente é `mesmo_plano` — desistir é pelo /trocar/cancelar', async () => {
    await assinante('u-repete-volta', 'essencial')
    await trocar('u-repete-volta', 'premium')
    const { res, chamadas } = await trocar('u-repete-volta', 'essencial')
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('mesmo_plano')
    expect(alteracoes(chamadas)).toEqual([])
    expect(await linha('u-repete-volta')).toMatchObject({ trocaPara: 'premium' })
  })

  it('mudar de ideia para um TERCEIRO plano substitui a troca pendente', async () => {
    await ligar(FLAG_VENDA_PLANOS_V3, true)
    await flags.definirFlag('stt_ao_vivo', { habilitada: true }, 'teste')
    try {
      await assinante('u-terceiro', 'essencial')
      await trocar('u-terceiro', 'premium')
      const { res, chamadas } = await trocar('u-terceiro', 'aovivo')
      expect(res.statusCode).toBe(200)
      expect(alteracoes(chamadas)[0].corpo).toMatchObject({ value: 39.9 })
      expect(await linha('u-terceiro')).toMatchObject({ plan: 'essencial', trocaPara: 'aovivo' })
    } finally {
      await flags.definirFlag('stt_ao_vivo', { habilitada: false }, 'teste')
    }
  })
})

describe('a troca pendente não sobrevive à assinatura dela', () => {
  it('cancelar a assinatura (linha `canceled`) apaga a intenção', async () => {
    await assinante('u-some-cancel', 'essencial', { trocaPara: 'premium', trocaAPartirDe: PROXIMA })
    await subs.upsert(asUserId('u-some-cancel'), { status: 'canceled', cancelAtPeriodEnd: 1 })
    expect(await linha('u-some-cancel')).toMatchObject({ trocaPara: null, trocaAPartirDe: null })
  })

  it('uma assinatura NOVA no Asaas (outro id) apaga a intenção da anterior', async () => {
    await assinante('u-some-nova', 'essencial', { trocaPara: 'premium', trocaAPartirDe: PROXIMA })
    await subs.upsert(asUserId('u-some-nova'), { providerSubscriptionId: 'sub_outra', meio: 'assinatura' })
    expect(await linha('u-some-nova')).toMatchObject({ trocaPara: null, trocaAPartirDe: null })
  })

  it('o que não encerra a assinatura (atraso, renovar o período) mantém a intenção', async () => {
    await assinante('u-some-fica', 'essencial', { trocaPara: 'premium', trocaAPartirDe: PROXIMA })
    await subs.upsert(asUserId('u-some-fica'), { status: 'past_due' })
    await subs.upsert(asUserId('u-some-fica'), { status: 'active', providerSubscriptionId: 'sub_u-some-fica' })
    expect(await linha('u-some-fica')).toMatchObject({ trocaPara: 'premium', trocaAPartirDe: PROXIMA })
  })
})

describe('o teste de 14 dias continua concedendo o Premium', () => {
  it('a matriz e o servidor dizem o mesmo, e nada desta etapa toca nisso', async () => {
    expect(PLANO_DO_TESTE).toBe('premium')
    const u = asUserId('u-teste-14')
    const agora = Date.now()
    await testes.iniciar(u, 'marca-u-teste-14', agora - DIA, agora + 13 * DIA)
    expect(await ent.resolverPlano(u)).toMatchObject({ plano: 'premium', teste: { terminaEm: agora + 13 * DIA } })
    expect(await ent.hasEntitlement(u, 'interpreteAutomatico')).toBe(true)
  })
})
