/**
 * COBRANÇA POR PLANO (change `planos-v3-e-rota-inteligente`, item 8.3; ADR 0013).
 *
 * A matriz v3 vende TRÊS planos pagos, e o webhook concede pelo VALOR pago (`planoPeloPagamento`). Os
 * testes de cobrança anteriores nasceram com um plano pago só (o Premium da v2) e cobrem cada caminho
 * com ele; aqui a MESMA tabela roda para cada plano × ciclo × evento, para que nenhum ramo continue
 * assumindo o Premium:
 *
 *  (a) a mensalidade concede o plano no mensal;
 *  (b) o anual inteiro concede o ano (quando o plano tem anual — o Ao Vivo não tem);
 *  (c) o 12x concede na 1ª parcela, e as outras 11 não encurtam (nem esticam) o ano;
 *  (d) o chargeback derruba o plano;
 *  (e) o valor de um plano FORA DE VENDA concede mesmo assim — quem pagou recebe — e o motivo fica gravado;
 *  (f) a troca de plano atravessa o webhook nos dois sentidos, e o Ao Vivo fechado é recusado;
 *  (g) a recusa de quem já paga cita o plano que a pessoa tem, não "Premium".
 *
 * Os preços NÃO são escritos à mão: saem de `PLAN_MATRIX` e são conferidos contra a tabela abaixo, para
 * que uma mudança de preço na matriz quebre este teste em vez de passar por ele. O Asaas é simulado por
 * URL, como em `billing-trocar-plano.test.ts`: nenhum teste fala com ele.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import {
  FLAG_STT_AO_VIVO,
  FLAG_VENDA_PLANOS_V3,
  PARCELAS_DO_ANUAL,
  PLAN_MATRIX,
  type PlanoPago,
  valoresDasParcelas,
} from '../../src/core/planos'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let billingRouter: any
let asaasWebhookRouter: any
let subs: any
let ent: any
let idades: any
let eventos: any
let flags: typeof import('../../server/lib/flags')

const SEGREDO = 'segredo-webhook-por-plano'
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
const req = (userId: string, body: unknown, caminho: string) => ({
  userId: asUserId(userId),
  requestId: 'req-teste',
  path: caminho,
  body,
  header: () => undefined,
})

/** Um Asaas de mentira: a conferência do pagamento, a alteração da assinatura e as cobranças dela. */
function asaasSimulado(pagamentos: Record<string, Record<string, unknown>> = {}) {
  const chamadas: Array<{ metodo: string; url: string; corpo: any }> = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input)
    const metodo = String(init?.method ?? 'GET')
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined
    chamadas.push({ metodo, url, corpo })
    const assinatura = /\/subscriptions\/([^/?]+)$/.exec(url)
    if (metodo === 'PUT' && assinatura) {
      return json({ id: assinatura[1], value: corpo.value, nextDueDate: SEGUINTE, status: 'ACTIVE' })
    }
    if (metodo === 'GET' && /\/subscriptions\/[^/]+\/payments/.test(url)) {
      return json({ data: [{ id: 'pay_pendente', status: 'PENDING', value: 0, dueDate: PROXIMA }] })
    }
    if (metodo === 'GET' && assinatura) return json({ id: assinatura[1], nextDueDate: SEGUINTE })
    const pagamento = /\/payments\/([^/?]+)$/.exec(url)
    if (metodo === 'GET' && pagamento) {
      const p = pagamentos[decodeURIComponent(pagamento[1])]
      return p ? json(p) : json({ errors: [{ code: 'not_found' }] }, 404)
    }
    return json({ erro: 'rota não simulada' }, 404)
  })
  return chamadas
}

/** O webhook de verdade, com o pagamento conferido na API simulada (GAP-011). */
async function webhook(
  evento: string,
  eventoId: string,
  pagamento: { id: string; userId: string; value: number } & Record<string, unknown>,
  statusNaApi = 'CONFIRMED',
) {
  const { userId, ...resto } = pagamento
  const naApi = { ...resto, status: statusNaApi, externalReference: userId }
  asaasSimulado({ [pagamento.id]: naApi })
  const res = mockRes()
  await rota(
    asaasWebhookRouter,
    '/',
    'post',
  )(
    {
      body: { id: eventoId, event: evento, payment: { ...resto, externalReference: userId } },
      header: (k: string) => (k.toLowerCase() === 'asaas-access-token' ? SEGREDO : undefined),
    },
    res,
  )
  vi.restoreAllMocks()
  return res
}

/** Um pagamento de ASSINATURA (mensal ou `YEARLY`) da conta. */
const daAssinatura = (userId: string, n: string, value: number) => ({
  id: `pay_${userId}_${n}`,
  userId,
  value,
  subscription: `sub_${userId}`,
})

/** A intenção gravada por `/assinar`: a linha `trialing`, que não concede nada sozinha. */
async function checkoutIniciado(id: string, plano: PlanoPago, patch: Record<string, unknown> = {}) {
  await idades.declarar(asUserId(id), '1990-01-01')
  await subs.upsert(asUserId(id), {
    plan: plano,
    status: 'trialing',
    provider: 'asaas',
    meio: 'assinatura',
    ciclo: 'mensal',
    providerCustomerId: `cus_${id}`,
    providerSubscriptionId: `sub_${id}`,
    ...patch,
  })
}

/** Um assinante do mensal, em dia, adulto declarado. */
async function assinante(id: string, plano: PlanoPago) {
  await checkoutIniciado(id, plano, { status: 'active', currentPeriodEnd: Date.now() + 20 * DIA })
}

async function trocar(id: string, plano: string) {
  const chamadas = asaasSimulado()
  const res = mockRes()
  await rota(billingRouter, '/trocar', 'post')(req(id, { plano }, '/trocar'), res)
  vi.restoreAllMocks()
  return { res, chamadas }
}

const linha = (id: string) => subs.getActive(asUserId(id))
const planoDe = (id: string) => ent.getPlanForUser(asUserId(id))
const ligar = (chave: string, habilitada: boolean) => flags.definirFlag(chave, { habilitada }, 'teste')

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  process.env.ASAAS_API_KEY = 'chave-de-teste'
  process.env.ASAAS_WEBHOOK_TOKEN = SEGREDO
  process.env.ANUAL_ENABLED = '1'
  ;({ billingRouter, asaasWebhookRouter } = (await h.load('../../server/routes/billing')) as any)
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as any)
  ;({ idadesRepo: idades } = (await h.load('../../server/db/repositories/idades')) as any)
  ;({ billingEventsRepo: eventos } = (await h.load('../../server/db/repositories/billingEvents')) as any)
  flags = (await h.load('../../server/lib/flags')) as typeof flags
  ent = await h.load('../../server/lib/entitlements')
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  delete process.env.ASAAS_API_KEY
  delete process.env.ASAAS_WEBHOOK_TOKEN
  delete process.env.ANUAL_ENABLED
  await h.cleanup()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await ligar(FLAG_VENDA_PLANOS_V3, false)
  await ligar(FLAG_STT_AO_VIVO, false)
})

/* A TABELA: o plano, a mensalidade e o anual (null = o plano não tem anual). */
const TABELA: Array<[PlanoPago, number, number | null]> = [
  ['essencial', 9.9, 79.9],
  ['premium', 19.9, 149.9],
  ['aovivo', 39.9, null],
]

describe('a tabela confere com a matriz', () => {
  it.each(TABELA)('%s: mensal R$ %s, anual R$ %s', (plano, mensal, anual) => {
    expect(PLAN_MATRIX[plano].precoMensalBrl).toBe(mensal)
    expect(PLAN_MATRIX[plano].precoAnualBrl).toBe(anual)
  })
})

describe.each(TABELA)('plano %s (mensal R$ %s, anual R$ %s)', (plano, mensal, anual) => {
  const rotulo = PLAN_MATRIX[plano].rotulo

  it('(a) PAYMENT_CONFIRMED com a mensalidade concede o plano no mensal', async () => {
    const u = `u-a-${plano}`
    await checkoutIniciado(u, plano)
    const antes = Date.now()
    const res = await webhook('PAYMENT_CONFIRMED', `evt_a_${plano}`, daAssinatura(u, '1', mensal))
    expect(res.statusCode).toBe(200)
    expect(res.body.estado).toBe('aplicado')
    // Pagou o que pediu: nada de divergência.
    expect(res.body).not.toHaveProperty('motivo')
    const s = await linha(u)
    expect(s).toMatchObject({ plan: plano, status: 'active', ciclo: 'mensal' })
    expect(s.currentPeriodEnd).toBeGreaterThanOrEqual(antes + 30 * DIA)
    expect(s.currentPeriodEnd).toBeLessThan(antes + 60 * DIA)
    expect(await planoDe(u)).toBe(plano)
  })

  it.runIf(anual !== null)('(b) PAYMENT_CONFIRMED com o anual inteiro concede o ano', async () => {
    const u = `u-b-${plano}`
    await checkoutIniciado(u, plano, { ciclo: 'anual' })
    const antes = Date.now()
    const res = await webhook('PAYMENT_CONFIRMED', `evt_b_${plano}`, daAssinatura(u, '1', anual as number))
    expect(res.body.estado).toBe('aplicado')
    expect(res.body).not.toHaveProperty('motivo')
    const s = await linha(u)
    expect(s).toMatchObject({ plan: plano, status: 'active', ciclo: 'anual' })
    expect(s.currentPeriodEnd).toBeGreaterThanOrEqual(antes + 365 * DIA)
    expect(await planoDe(u)).toBe(plano)
  })

  it.runIf(anual !== null)('(c) o 12x concede o ano na 1ª parcela, e as seguintes não encurtam o período', async () => {
    const u = `u-c-${plano}`
    const ins = `ins_${u}`
    await checkoutIniciado(u, plano, {
      ciclo: 'anual',
      meio: 'parcelamento',
      providerSubscriptionId: null,
      providerInstallmentId: ins,
    })
    const { padrao, ultima } = valoresDasParcelas(anual as number, PARCELAS_DO_ANUAL)
    // A soma das parcelas fecha o anual exato, em centavos.
    expect(Math.round(padrao * 100) * (PARCELAS_DO_ANUAL - 1) + Math.round(ultima * 100)).toBe(
      Math.round((anual as number) * 100),
    )
    const parcela = (n: number) => ({
      id: `${ins}_p${n}`,
      userId: u,
      value: n === PARCELAS_DO_ANUAL ? ultima : padrao,
      installment: ins,
      installmentNumber: n,
      billingType: 'CREDIT_CARD',
      // Vencimentos mensais a partir de 01/10/2026, como o Asaas cobra o parcelamento.
      dueDate: new Date(Date.UTC(2026, 9 + n - 1, 1)).toISOString().slice(0, 10),
    })

    const primeira = await webhook('PAYMENT_CONFIRMED', `evt_c_${plano}_1`, parcela(1))
    expect(primeira.body.estado).toBe('aplicado')
    const s = await linha(u)
    expect(s).toMatchObject({ plan: plano, status: 'active', ciclo: 'anual', meio: 'parcelamento' })
    // Vencimento da 1ª parcela (01/10/2026, meio-dia UTC) + 370 dias.
    expect(s.currentPeriodEnd).toBe(Date.parse('2026-10-01T12:00:00Z') + 370 * DIA)
    expect(await planoDe(u)).toBe(plano)

    for (let n = 2; n <= PARCELAS_DO_ANUAL; n++) {
      const r = await webhook('PAYMENT_CONFIRMED', `evt_c_${plano}_${n}`, parcela(n))
      expect(r.body.estado, `parcela ${n}`).toBe('aplicado')
      expect((await linha(u)).currentPeriodEnd, `parcela ${n}`).toBe(s.currentPeriodEnd)
    }
    expect(await linha(u)).toMatchObject({ plan: plano, status: 'active', ciclo: 'anual' })
  })

  it('(d) PAYMENT_CHARGEBACK_REQUESTED derruba o plano agora', async () => {
    const u = `u-d-${plano}`
    await checkoutIniciado(u, plano)
    const pago = daAssinatura(u, '1', mensal)
    await webhook('PAYMENT_CONFIRMED', `evt_d_${plano}_ok`, pago)
    expect(await planoDe(u)).toBe(plano)

    const res = await webhook('PAYMENT_CHARGEBACK_REQUESTED', `evt_d_${plano}_cb`, pago, 'CHARGEBACK_REQUESTED')
    expect(res.body.estado).toBe('aplicado')
    const s = await linha(u)
    expect(s.status).toBe('canceled')
    expect(s.currentPeriodEnd).toBeLessThanOrEqual(Date.now())
    expect(await planoDe(u)).toBe('free')
  })

  it(`(g) quem já paga e tenta assinar de novo ouve o nome do plano que tem (${rotulo})`, async () => {
    const u = `u-g-${plano}`
    await assinante(u, plano)
    const chamadas = asaasSimulado()
    const res = mockRes()
    await rota(
      billingRouter,
      '/assinar',
      'post',
    )(req(u, { plano: 'premium', nome: 'Pessoa de Teste', cpfCnpj: '24971563792' }, '/assinar'), res)
    vi.restoreAllMocks()
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('ja_assinante')
    expect(res.body.error).toContain(`já tem o ${rotulo} pago`)
    if (plano !== 'premium') expect(res.body.error).not.toContain('Premium')
    // A recusa vem antes de qualquer conversa com o Asaas.
    expect(chamadas).toHaveLength(0)
  })
})

describe('(e) valor de um plano FORA DE VENDA', () => {
  it('R$ 39,90 com as flags desligadas: o Ao Vivo não está à venda, mas quem pagou recebe — e o motivo fica gravado', async () => {
    const u = 'u-e-fora'
    // A venda do Ao Vivo está FECHADA (as duas flags desligadas): o checkout recusa.
    await idades.declarar(asUserId(u), '1990-01-01')
    asaasSimulado()
    const recusa = mockRes()
    await rota(
      billingRouter,
      '/assinar',
      'post',
    )(req(u, { plano: 'aovivo', nome: 'Pessoa de Teste', cpfCnpj: '24971563792' }, '/assinar'), recusa)
    vi.restoreAllMocks()
    expect(recusa.statusCode).toBe(503)
    expect(recusa.body.code).toBe('plano_indisponivel')

    // Mesmo assim chega um pagamento de R$ 39,90 (cobrança manual, assinatura antiga) com a intenção do Premium.
    await checkoutIniciado(u, 'premium')
    const res = await webhook('PAYMENT_CONFIRMED', 'evt_e_fora', daAssinatura(u, '1', 39.9))
    expect(res.body.estado).toBe('aplicado')
    expect(res.body.motivo).toMatch(/plano-divergente: pago aovivo mensal/)
    expect(res.body.motivo).toMatch(/intenção premium mensal/)
    expect(await linha(u)).toMatchObject({ plan: 'aovivo', status: 'active', ciclo: 'mensal' })
    expect(await planoDe(u)).toBe('aovivo')
    // O motivo não fica só na resposta: está no evento gravado, para a fila do admin.
    const gravado = await eventos.ler('evt_e_fora')
    expect(gravado.estado).toBe('aplicado')
    expect(gravado.motivo).toMatch(/plano-divergente: pago aovivo mensal/)
  })
})

describe('(f) a troca de plano por plano', () => {
  it('Essencial → Premium: /trocar grava `trocaPara`, e o webhook com o valor novo conclui a troca', async () => {
    const u = 'u-f-sobe'
    await assinante(u, 'essencial')
    const { res, chamadas } = await trocar(u, 'premium')
    expect(res.statusCode).toBe(200)
    expect(chamadas.find((c) => c.metodo === 'PUT')?.corpo).toMatchObject({ value: 19.9 })
    expect(await linha(u)).toMatchObject({ plan: 'essencial', trocaPara: 'premium', trocaAPartirDe: PROXIMA })
    expect(await planoDe(u)).toBe('essencial')

    const pago = await webhook('PAYMENT_CONFIRMED', 'evt_f_sobe', daAssinatura(u, '2', 19.9))
    expect(pago.body.estado).toBe('aplicado')
    expect(pago.body.motivo).toMatch(/troca-de-plano: essencial → premium/)
    expect(await linha(u)).toMatchObject({ plan: 'premium', ciclo: 'mensal', trocaPara: null, trocaAPartirDe: null })
    expect(await planoDe(u)).toBe('premium')
  })

  it('Premium → Essencial: o mesmo caminho, rebaixando', async () => {
    await ligar(FLAG_VENDA_PLANOS_V3, true)
    const u = 'u-f-desce'
    await assinante(u, 'premium')
    const { res, chamadas } = await trocar(u, 'essencial')
    expect(res.statusCode).toBe(200)
    expect(chamadas.find((c) => c.metodo === 'PUT')?.corpo).toMatchObject({ value: 9.9 })
    expect(await linha(u)).toMatchObject({ plan: 'premium', trocaPara: 'essencial' })
    expect(await planoDe(u)).toBe('premium')

    const pago = await webhook('PAYMENT_CONFIRMED', 'evt_f_desce', daAssinatura(u, '2', 9.9))
    expect(pago.body.estado).toBe('aplicado')
    expect(pago.body.motivo).toMatch(/troca-de-plano: premium → essencial/)
    expect(await linha(u)).toMatchObject({ plan: 'essencial', ciclo: 'mensal', trocaPara: null })
    expect(await planoDe(u)).toBe('essencial')
  })

  it('para o Ao Vivo com `stt_ao_vivo` desligada: recusado (503 `plano_indisponivel`), sem falar com o Asaas', async () => {
    // Mesmo com a venda dos planos v3 aberta: o Ao Vivo pede as DUAS chaves.
    await ligar(FLAG_VENDA_PLANOS_V3, true)
    const u = 'u-f-aovivo-fechado'
    await assinante(u, 'premium')
    const { res, chamadas } = await trocar(u, 'aovivo')
    expect(res.statusCode).toBe(503)
    expect(res.body.code).toBe('plano_indisponivel')
    expect(chamadas).toHaveLength(0)
    expect(await linha(u)).toMatchObject({ plan: 'premium', trocaPara: null })
  })

  it('para o Ao Vivo com as duas chaves ligadas: a troca é pedida e o webhook de R$ 39,90 a conclui', async () => {
    await ligar(FLAG_VENDA_PLANOS_V3, true)
    await ligar(FLAG_STT_AO_VIVO, true)
    const u = 'u-f-aovivo-aberto'
    await assinante(u, 'premium')
    const { res, chamadas } = await trocar(u, 'aovivo')
    expect(res.statusCode).toBe(200)
    expect(chamadas.find((c) => c.metodo === 'PUT')?.corpo).toMatchObject({ value: 39.9, description: 'Frasy Ao Vivo' })
    expect(await linha(u)).toMatchObject({ plan: 'premium', trocaPara: 'aovivo' })

    const pago = await webhook('PAYMENT_CONFIRMED', 'evt_f_aovivo', daAssinatura(u, '2', 39.9))
    expect(pago.body.motivo).toMatch(/troca-de-plano: premium → aovivo/)
    expect(await linha(u)).toMatchObject({ plan: 'aovivo', trocaPara: null })
    expect(await planoDe(u)).toBe('aovivo')
  })
})
