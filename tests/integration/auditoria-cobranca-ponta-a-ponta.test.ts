/**
 * AUDITORIA DE ACESSO POR PLANO (14/11/2026) — a cadeia PAGAMENTO → PLANO → COTA, ponta a ponta.
 *
 * A pergunta do dono: "quando alguém paga, recebe exatamente o que pagou, e nada além?". Cada elo é provado pelo
 * caminho real do servidor (`aplicarEvento`, o mesmo do webhook e do reprocessamento) com a API do Asaas simulada
 * pelo verificador injetável, e lido de volta pelo que o resto do app consulta (`resolverPlano`,
 * `getEntitlementsForUser`, `reserveManagedCall`).
 *
 * Os casos marcados `[BUG]` e `[LACUNA]` usam `it.fails`: a asserção descreve o comportamento CERTO e hoje falha.
 * Quando o produto for corrigido, o `it.fails` passa a falhar e o marcador sai — o teste vira guarda.
 *   - `[BUG]`: o código contradiz a própria regra declarada no comentário dele.
 *   - `[LACUNA]`: decisão de projeto que hoje entrega mais (ou menos) do que um período pago.
 * Os cinco casos foram corrigidos em 14/11/2026 (branch `fix/cobranca-e-cota-por-periodo`, change OpenSpec
 * `cota-pelo-periodo-pago`) e viraram `it` com o marcador `[corrigido]`: o comentário de cada um guarda o defeito.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { PLAN_MATRIX } from '../../src/core/planos'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const DIA = 86_400_000

let h: EphemeralDb
let subs: any
let aplicarEvento: any
let ent: any
let quota: any
let counters: any
let reconciliar: any
let eventos: any

/** A API do Asaas simulada: o que `GET /payments/:id` responderia para cada pagamento. */
type Pagamento = {
  id: string
  status: string
  value: number
  subscription?: string
  installment?: string
  externalReference: string
  dueDate?: string
  billingType?: string
}
function asaas(pagamentos: Pagamento[]) {
  const porId = new Map(pagamentos.map((p) => [p.id, p]))
  return async (id: string) => porId.get(id) ?? null
}
const ev = (id: string, tipo: string, pay: Partial<Pagamento> & { id: string; externalReference: string }) => ({
  id,
  event: tipo,
  payment: pay,
})
const diaIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ subscriptionsRepo: subs } = await h.load<any>('../../server/db/repositories/subscriptions'))
  ;({ aplicarEvento } = await h.load<any>('../../server/lib/billingEventos'))
  ent = await h.load<any>('../../server/lib/entitlements')
  quota = await h.load<any>('../../server/lib/usageQuota')
  ;({ usageCountersRepo: counters } = await h.load<any>('../../server/db/repositories/usageCounters'))
  ;({ reconciliarCobrancas: reconciliar } = await h.load<any>('../../server/lib/reconciliarCobrancas'))
  ;({ billingEventsRepo: eventos } = await h.load<any>('../../server/db/repositories/billingEvents'))
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  await h.cleanup()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** A intenção que `POST /api/billing/assinar` grava (checkout iniciado, NÃO pago). */
async function checkout(u: string, plano: string, sub: string) {
  await subs.upsert(asUserId(u), {
    plan: plano,
    planoDaCobranca: plano,
    status: 'trialing',
    provider: 'asaas',
    providerSubscriptionId: sub,
  })
}

describe('elo 1 — pagamento → plano', () => {
  it('checkout iniciado e não pago NÃO concede nada (trialing = Grátis)', async () => {
    await checkout('a-checkout', 'plus', 'sub_ck')
    expect(await ent.getPlanForUser(asUserId('a-checkout'))).toBe('free')
    expect(await ent.hasEntitlement(asUserId('a-checkout'), 'managedCloudLlm')).toBe(false)
  })

  it('Plus mensal pago (R$ 14,90) concede o Plus — e só o Plus — até o vencimento + 35 dias', async () => {
    const u = 'a-plus'
    await checkout(u, 'plus', 'sub_plus')
    const venc = Date.now() - 2 * DIA
    const p = {
      id: 'pay_plus_1',
      status: 'CONFIRMED',
      value: 14.9,
      subscription: 'sub_plus',
      externalReference: u,
      dueDate: diaIso(venc),
    }
    const r = await aplicarEvento(ev('evt_plus_1', 'PAYMENT_CONFIRMED', p), 'req', asaas([p]))
    expect(r.estado).toBe('aplicado')
    const e = await ent.getEntitlementsForUser(asUserId(u))
    expect(e).toMatchObject({ plan: 'plus', ...PLAN_MATRIX.plus.entitlements })
    // Nada além do Plus: o intérprete automático é do Pro, o texto ao vivo do Ao Vivo.
    expect(e.interpreteAutomatico).toBe(false)
    expect(e.sttAoVivo).toBe(false)
    const sub = await subs.getActive(asUserId(u))
    const fimEsperado = Date.parse(`${diaIso(venc)}T12:00:00Z`) + 35 * DIA
    expect(sub.currentPeriodEnd).toBe(fimEsperado)
  })

  it('CONFIRMED e depois RECEIVED do MESMO pagamento (eventos distintos) não estendem o período', async () => {
    const u = 'a-dup'
    await checkout(u, 'plus', 'sub_dup')
    const p = {
      id: 'pay_dup',
      status: 'RECEIVED',
      value: 14.9,
      subscription: 'sub_dup',
      externalReference: u,
      dueDate: diaIso(Date.now()),
    }
    await aplicarEvento(ev('evt_dup_c', 'PAYMENT_CONFIRMED', p), 'req', asaas([p]))
    const antes = (await subs.getActive(asUserId(u))).currentPeriodEnd
    await aplicarEvento(ev('evt_dup_r', 'PAYMENT_RECEIVED', p), 'req', asaas([p]))
    await aplicarEvento(ev('evt_dup_r2', 'PAYMENT_RECEIVED', p), 'req', asaas([p]))
    expect((await subs.getActive(asUserId(u))).currentPeriodEnd).toBe(antes)
  })

  it('o mesmo id de evento entregue duas vezes: a marca de idempotência só aceita a primeira', async () => {
    expect(await eventos.marcarSeNovo('evt_idem', 'asaas', 'PAYMENT_CONFIRMED', 'a-idem', 'pay_idem', {})).toBe(true)
    expect(await eventos.marcarSeNovo('evt_idem', 'asaas', 'PAYMENT_CONFIRMED', 'a-idem', 'pay_idem', {})).toBe(false)
  })

  it('valor pago menor que o da intenção: vale o PAGO (intenção Pro, pagou o Plus → Plus)', async () => {
    const u = 'a-escalada'
    await checkout(u, 'pro4', 'sub_esc')
    const p = { id: 'pay_esc', status: 'CONFIRMED', value: 14.9, subscription: 'sub_esc', externalReference: u }
    await aplicarEvento(ev('evt_esc', 'PAYMENT_CONFIRMED', p), 'req', asaas([p]))
    expect(await ent.getPlanForUser(asUserId(u))).toBe('plus')
  })

  it('o payload forjado não manda: o webhook diz R$ 34,90 (Pro), a API diz R$ 14,90 → Plus', async () => {
    const u = 'a-forjado'
    await checkout(u, 'plus', 'sub_forj')
    const real = { id: 'pay_forj', status: 'CONFIRMED', value: 14.9, subscription: 'sub_forj', externalReference: u }
    await aplicarEvento(ev('evt_forj', 'PAYMENT_CONFIRMED', { ...real, value: 34.9 }), 'req', asaas([real]))
    expect(await ent.getPlanForUser(asUserId(u))).toBe('plus')
  })

  it('pagamento que a API não conhece (ou ainda pendente) não concede nada', async () => {
    const u = 'a-fantasma'
    await checkout(u, 'plus', 'sub_fan')
    const p = { id: 'pay_fan', status: 'PENDING', value: 14.9, subscription: 'sub_fan', externalReference: u }
    const r1 = await aplicarEvento(ev('evt_fan1', 'PAYMENT_CONFIRMED', p), 'req', asaas([]))
    const r2 = await aplicarEvento(ev('evt_fan2', 'PAYMENT_CONFIRMED', p), 'req', asaas([p]))
    expect([r1.estado, r2.estado]).toEqual(['nao-aplicado', 'nao-aplicado'])
    expect(await ent.getPlanForUser(asUserId(u))).toBe('free')
  })

  it('estorno revoga NA HORA (sem o resto do mês), e o CONFIRMED atrasado depois dele não devolve o plano', async () => {
    const u = 'a-estorno'
    await checkout(u, 'plus', 'sub_est')
    const pago = { id: 'pay_est', status: 'CONFIRMED', value: 14.9, subscription: 'sub_est', externalReference: u }
    await aplicarEvento(ev('evt_est_c', 'PAYMENT_CONFIRMED', pago), 'req', asaas([pago]))
    expect(await ent.getPlanForUser(asUserId(u))).toBe('plus')

    const estornado = { ...pago, status: 'REFUNDED' }
    const r = await aplicarEvento(ev('evt_est_r', 'PAYMENT_REFUNDED', pago), 'req', asaas([estornado]))
    expect(r.estado).toBe('aplicado')
    expect(await ent.getPlanForUser(asUserId(u))).toBe('free')
    expect(await ent.hasEntitlement(asUserId(u), 'managedCloudStt')).toBe(false)

    // O Asaas reentrega fora de ordem: a confirmação chega depois do estorno.
    const tardio = await aplicarEvento(ev('evt_est_c2', 'PAYMENT_RECEIVED', pago), 'req', asaas([estornado]))
    expect(tardio.estado).toBe('ignorado')
    expect(await ent.getPlanForUser(asUserId(u))).toBe('free')
  })

  it('chargeback revoga na hora; a vitória na disputa NÃO devolve sozinha', async () => {
    const u = 'a-cb'
    await checkout(u, 'plus', 'sub_cb')
    const pago = { id: 'pay_cb', status: 'CONFIRMED', value: 14.9, subscription: 'sub_cb', externalReference: u }
    await aplicarEvento(ev('evt_cb_c', 'PAYMENT_CONFIRMED', pago), 'req', asaas([pago]))
    const cb = { ...pago, status: 'CHARGEBACK_REQUESTED' }
    await aplicarEvento(ev('evt_cb', 'PAYMENT_CHARGEBACK_REQUESTED', pago), 'req', asaas([cb]))
    expect(await ent.getPlanForUser(asUserId(u))).toBe('free')
    const rev = await aplicarEvento(ev('evt_cb_rev', 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL', pago), 'req', asaas([cb]))
    expect(rev.estado).toBe('ignorado')
    expect(await ent.getPlanForUser(asUserId(u))).toBe('free')
  })

  it('estorno forjado (a API diz que o pagamento segue pago) não derruba ninguém', async () => {
    const u = 'a-estorno-forjado'
    await checkout(u, 'plus', 'sub_ef')
    const pago = { id: 'pay_ef', status: 'CONFIRMED', value: 14.9, subscription: 'sub_ef', externalReference: u }
    await aplicarEvento(ev('evt_ef_c', 'PAYMENT_CONFIRMED', pago), 'req', asaas([pago]))
    const r = await aplicarEvento(ev('evt_ef_r', 'PAYMENT_REFUNDED', pago), 'req', asaas([pago]))
    expect(r.estado).toBe('nao-aplicado')
    expect(await ent.getPlanForUser(asUserId(u))).toBe('plus')
  })

  it('assinatura removida no Asaas: não renova, mas o já pago vale até o fim; vencido o período → Grátis', async () => {
    const u = 'a-removida'
    await checkout(u, 'plus', 'sub_rem')
    const pago = { id: 'pay_rem', status: 'CONFIRMED', value: 14.9, subscription: 'sub_rem', externalReference: u }
    await aplicarEvento(ev('evt_rem_c', 'PAYMENT_CONFIRMED', pago), 'req', asaas([pago]))
    const r = await aplicarEvento(
      { id: 'evt_rem_d', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_rem', externalReference: u } },
      'req',
      asaas([pago]),
      false,
      async () => ({ id: 'sub_rem', deleted: true, status: 'INACTIVE', externalReference: u }),
    )
    expect(r.estado).toBe('aplicado')
    expect(await ent.getPlanForUser(asUserId(u))).toBe('plus')
    await subs.upsert(asUserId(u), { currentPeriodEnd: Date.now() - 1 })
    expect(await ent.getPlanForUser(asUserId(u))).toBe('free')
  })

  it('[corrigido] valor fora da matriz cai no `plan` GRAVADO (de outra cobrança), e não no plano DESTA cobrança', async () => {
    /* A pessoa teve o Premium (linha `plan = premium`, cancelada e vencida). Assina o Plus: `/assinar` numa linha
       existente troca os ids e grava `planoDaCobranca = plus`, mas NÃO toca em `plan` (billing.ts:479-489). Se o
       pagamento do Plus chegar com um valor que não casa com nenhum preço (juros/multa de boleto atrasado, desconto
       manual no painel), `billingEventos.ts:341` usa `normalizarPlano(atual.plan)` como intenção → concede o
       PREMIUM a quem assinou e pagou o PLUS. O desempate da parcela (`planoDesteParcelamento`, :773) já usa
       `planoDaCobranca`; o ramo da assinatura mensal não. */
    const u = 'a-plano-velho'
    await subs.upsert(asUserId(u), {
      plan: 'premium',
      status: 'canceled',
      currentPeriodEnd: Date.now() - 10 * DIA,
      provider: 'asaas',
      providerSubscriptionId: 'sub_premium_antiga',
    })
    // `/assinar` do Plus numa linha existente (o mesmo patch de billing.ts:483-489).
    await subs.upsert(asUserId(u), {
      provider: 'asaas',
      providerSubscriptionId: 'sub_plus_nova',
      providerInstallmentId: null,
      cancelAtPeriodEnd: 0,
      planoDaCobranca: 'plus',
    })
    const p = {
      id: 'pay_juros',
      status: 'RECEIVED',
      value: 15.37, // R$ 14,90 + multa/juros de atraso
      subscription: 'sub_plus_nova',
      externalReference: u,
    }
    await aplicarEvento(ev('evt_juros', 'PAYMENT_RECEIVED', p), 'req', asaas([p]))
    expect(await ent.getPlanForUser(asUserId(u))).toBe('plus')
  })

  it('[corrigido] o estorno de uma cobrança ANTIGA derruba o mês pago DEPOIS dela', async () => {
    /* `aplicarDinheiroDevolvido` (billingEventos.ts:658) zera o período de qualquer estorno da assinatura
       registrada, sem olhar QUAL cobrança voltou: estornar a mensalidade de outubro (cobrança duplicada, por
       exemplo) tira o novembro que segue pago. É o inverso do "nada além": a pessoa recebe MENOS do que pagou. */
    const u = 'a-estorno-antigo'
    await checkout(u, 'plus', 'sub_ea')
    const out = {
      id: 'pay_out',
      status: 'RECEIVED',
      value: 14.9,
      subscription: 'sub_ea',
      externalReference: u,
      dueDate: diaIso(Date.now() - 32 * DIA),
    }
    const nov = { ...out, id: 'pay_nov', dueDate: diaIso(Date.now() - 2 * DIA) }
    await aplicarEvento(ev('evt_out', 'PAYMENT_RECEIVED', out), 'req', asaas([out, nov]))
    await aplicarEvento(ev('evt_nov', 'PAYMENT_RECEIVED', nov), 'req', asaas([out, nov]))
    const outEstornado = { ...out, status: 'REFUNDED' }
    await aplicarEvento(ev('evt_out_ref', 'PAYMENT_REFUNDED', out), 'req', asaas([outEstornado, nov]))
    // O novembro foi pago e não foi estornado: deveria continuar Plus.
    expect(await ent.getPlanForUser(asUserId(u))).toBe('plus')
  })
})

describe('elo 2/3 — plano → cota no tempo', () => {
  it('[corrigido] UM pagamento mensal libera a cota de até TRÊS meses-calendário', async () => {
    /* A cota é por mês-CALENDÁRIO UTC (`currentWindow`, usageQuota.ts:213), e o período pago é vencimento + 35
       dias (billingEventos.ts:48). Quem paga no fim do mês atravessa duas viradas: pago com vencimento em 29/11,
       o acesso vai até 03/01 — e a cota zera em 01/12 e em 01/01. Um único R$ 14,90 compra a cota de novembro,
       a de dezembro e a de janeiro. No Essencial (sem teto no dia) é o triplo das 5 h vendidas; nos outros, o teto
       do dia segura o ritmo, não o total.
       CORRIGIDO (change `cota-pelo-periodo-pago`): para quem paga, a janela da cota é a do PERÍODO PAGO
       (`janelaDaCota`), e é nela que o contador é cheio — a mesma que a reserva usa. */
    const u = 'a-calendario'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.parse('2026-11-29T15:00:00Z'))
    await checkout(u, 'plus', 'sub_cal')
    const p = {
      id: 'pay_cal',
      status: 'CONFIRMED',
      value: 14.9,
      subscription: 'sub_cal',
      externalReference: u,
      dueDate: '2026-11-29',
    }
    await aplicarEvento(ev('evt_cal', 'PAYMENT_CONFIRMED', p), 'req', asaas([p]))
    const cap = quota.capForPlan('plus')
    const janelasComCotaCheia: string[] = []
    for (const quando of ['2026-11-30T12:00:00Z', '2026-12-15T12:00:00Z', '2027-01-02T12:00:00Z']) {
      vi.setSystemTime(Date.parse(quando))
      expect(await ent.getPlanForUser(asUserId(u)), quando).toBe('plus')
      const janela = await quota.janelaDaCota(asUserId(u))
      // Gasta a cota inteira do mês até o teto…
      await counters.increment(asUserId(u), quota.METRIC_MANAGED, janela, cap - 1)
      // …e a última chamada do teto ainda passa: a janela estava cheia.
      if (await quota.reserveManagedCall(asUserId(u))) janelasComCotaCheia.push(janela)
    }
    // O certo: um período pago = no máximo UMA cota mensal.
    expect(janelasComCotaCheia).toHaveLength(1)
  })
})

describe('reconciliação diária (o cinto do webhook perdido)', () => {
  const deps = (porSub: Record<string, unknown[]>, verificar: (id: string) => Promise<unknown>) => ({
    listarDaAssinatura: async (id: string) => (porSub[id] ?? []) as any,
    listarDoParcelamento: async () => [],
    aplicar: (e: any) => aplicarEvento(e, 'reconciliacao', verificar),
  })

  it('[corrigido] o ESTORNO cujo webhook se perdeu nunca é reconciliado: o plano fica até o fim do período', async () => {
    /* `reconciliarCobrancas` só procura cobranças PAGAS sem evento (reconciliarCobrancas.ts:31,106). Se o
       `PAYMENT_REFUNDED` não chegar (webhook fora, token trocado), a conta segue com o plano até
       `currentPeriodEnd` — 35 dias no mensal, 370 no anual. */
    const u = 'r-estorno-perdido'
    await checkout(u, 'plus', 'sub_rp')
    const pago = {
      id: 'pay_rp',
      status: 'CONFIRMED',
      value: 14.9,
      subscription: 'sub_rp',
      externalReference: u,
      dueDate: diaIso(Date.now()),
    }
    await eventos.marcarSeNovo('evt_rp', 'asaas', 'PAYMENT_CONFIRMED', u, 'pay_rp', {})
    await aplicarEvento(ev('evt_rp', 'PAYMENT_CONFIRMED', pago), 'req', asaas([pago]))
    const estornado = { ...pago, status: 'REFUNDED', paymentDate: diaIso(Date.now()) }
    await reconciliar({
      agora: Date.now(),
      modo: 'apply',
      deps: deps({ sub_rp: [estornado] }, asaas([estornado as Pagamento])),
    })
    expect(await ent.getPlanForUser(asUserId(u))).toBe('free')
  })

  it('[corrigido] passou de 150 assinaturas Asaas, as mais novas NUNCA são reconciliadas (LIMIT sem ordem nem rodízio)', async () => {
    /* reconciliarCobrancas.ts:81-89 lê `LIMIT 150` sem ORDER BY, sem cursor e sem filtrar status: as linhas
       canceladas e vencidas ficam no conjunto para sempre e ocupam o teto. Na 151ª conta com `provider = asaas`,
       o pagamento confirmado cujo webhook se perdeu não é achado — nem hoje, nem em passada nenhuma. */
    const { LIMITE_DE_ASSINATURAS } = await h.load<any>('../../server/lib/reconciliarCobrancas')
    for (let i = 0; i < LIMITE_DE_ASSINATURAS; i++) {
      await subs.upsert(asUserId(`r-velha-${i}`), {
        plan: 'premium',
        status: 'canceled',
        currentPeriodEnd: Date.now() - 400 * DIA,
        provider: 'asaas',
        providerSubscriptionId: `sub_velha_${i}`,
      })
    }
    const u = 'r-nova'
    await checkout(u, 'plus', 'sub_nova')
    const pago = {
      id: 'pay_nova',
      status: 'CONFIRMED',
      value: 14.9,
      subscription: 'sub_nova',
      externalReference: u,
      dueDate: diaIso(Date.now()),
      paymentDate: diaIso(Date.now()),
    }
    const r = await reconciliar({
      agora: Date.now(),
      modo: 'report',
      deps: deps({ sub_nova: [pago] }, asaas([pago])),
    })
    expect(r.divergentes).toBe(1)
  })
})
