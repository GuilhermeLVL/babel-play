/**
 * As guardas em volta das correções da auditoria de cobrança de 14/11/2026 (os `it.fails` de
 * `auditoria-cobranca-ponta-a-ponta.test.ts` viraram `it`): aqui ficam os LADOS que aqueles casos não cobrem — o
 * valor fora da matriz que NÃO concede, o estorno da cobrança em vigor que segue revogando, o rodízio da
 * reconciliação e as janelas da cota pelo período pago.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

const DIA = 86_400_000

let h: EphemeralDb
let subs: any
let aplicarEvento: any
let ent: any
let quota: any
let rec: any

type Pagamento = {
  id: string
  status: string
  value: number
  subscription?: string
  externalReference: string
  dueDate?: string
}
const asaas = (pagamentos: Pagamento[]) => {
  const porId = new Map(pagamentos.map((p) => [p.id, p]))
  return async (id: string) => porId.get(id) ?? null
}
const ev = (id: string, tipo: string, payment: Pagamento) => ({ id, event: tipo, payment })
const diaIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  ;({ subscriptionsRepo: subs } = await h.load<any>('../../server/db/repositories/subscriptions'))
  ;({ aplicarEvento } = await h.load<any>('../../server/lib/billingEventos'))
  ent = await h.load<any>('../../server/lib/entitlements')
  quota = await h.load<any>('../../server/lib/usageQuota')
  rec = await h.load<any>('../../server/lib/reconciliarCobrancas')
})
afterAll(async () => {
  delete process.env.AUTH_REQUIRED
  await h.cleanup()
})
afterEach(() => {
  vi.useRealTimers()
})

async function checkout(u: string, plano: string, sub: string) {
  await subs.upsert(asUserId(u), {
    plan: plano,
    planoDaCobranca: plano,
    status: 'trialing',
    provider: 'asaas',
    providerSubscriptionId: sub,
  })
}

describe('valor fora da matriz: nunca mais do que foi pago', () => {
  it('pago a MENOS que o plano desta cobrança (desconto manual): pendente, nada concedido', async () => {
    const u = 'v-desconto'
    await checkout(u, 'premium', 'sub_desc')
    const p = { id: 'pay_desc', status: 'RECEIVED', value: 12.0, subscription: 'sub_desc', externalReference: u }
    const r = await aplicarEvento(ev('evt_desc', 'PAYMENT_RECEIVED', p), 'req', asaas([p]))
    expect(r.estado).toBe('nao-aplicado')
    expect(r.motivo).toMatch(/valor-fora-da-matriz/)
    expect(await ent.getPlanForUser(asUserId(u))).toBe('free')
  })

  it('valor fora da matriz sem plano registrado para esta cobrança: pendente, e não o `plan` gravado', async () => {
    const u = 'v-sem-vinculo'
    // Linha antiga do Premium, SEM o id desta assinatura: o pagamento não tem vínculo com plano nenhum.
    await subs.upsert(asUserId(u), { plan: 'premium', status: 'canceled', provider: 'asaas' })
    const p = { id: 'pay_sv', status: 'RECEIVED', value: 25.0, subscription: 'sub_sv', externalReference: u }
    const r = await aplicarEvento(ev('evt_sv', 'PAYMENT_RECEIVED', p), 'req', asaas([p]))
    expect(r.estado).toBe('nao-aplicado')
    expect(await ent.getPlanForUser(asUserId(u))).toBe('free')
  })

  it('juros num boleto do plano desta cobrança: concede ESSE plano, com o motivo escrito', async () => {
    const u = 'v-juros'
    await checkout(u, 'premium', 'sub_jur')
    const p = { id: 'pay_jur', status: 'RECEIVED', value: 20.31, subscription: 'sub_jur', externalReference: u }
    const r = await aplicarEvento(ev('evt_jur', 'PAYMENT_RECEIVED', p), 'req', asaas([p]))
    expect(r.estado).toBe('aplicado')
    expect(r.motivo).toMatch(/valor-fora-da-matriz/)
    expect(await ent.getPlanForUser(asUserId(u))).toBe('premium')
    expect((await subs.getActive(asUserId(u))).ciclo).toBe('mensal')
  })
})

describe('estorno: só revoga o período que a cobrança devolvida concedeu', () => {
  it('o estorno da cobrança EM VIGOR (com vencimento) segue revogando na hora', async () => {
    const u = 'e-vigor'
    await checkout(u, 'plus', 'sub_vig')
    const p = {
      id: 'pay_vig',
      status: 'RECEIVED',
      value: 14.9,
      subscription: 'sub_vig',
      externalReference: u,
      dueDate: diaIso(Date.now() - 3 * DIA),
    }
    await aplicarEvento(ev('evt_vig', 'PAYMENT_RECEIVED', p), 'req', asaas([p]))
    expect(await ent.getPlanForUser(asUserId(u))).toBe('plus')
    const r = await aplicarEvento(ev('evt_vig_r', 'PAYMENT_REFUNDED', p), 'req', asaas([{ ...p, status: 'REFUNDED' }]))
    expect(r.estado).toBe('aplicado')
    expect(await ent.getPlanForUser(asUserId(u))).toBe('free')
  })

  it('o estorno da cobrança antiga fica registrado como `ignorado`, com o porquê', async () => {
    const u = 'e-antiga'
    await checkout(u, 'plus', 'sub_ant')
    const velha = {
      id: 'pay_velha',
      status: 'RECEIVED',
      value: 14.9,
      subscription: 'sub_ant',
      externalReference: u,
      dueDate: diaIso(Date.now() - 31 * DIA),
    }
    const nova = { ...velha, id: 'pay_nova_e', dueDate: diaIso(Date.now() - 1 * DIA) }
    await aplicarEvento(ev('evt_velha', 'PAYMENT_RECEIVED', velha), 'req', asaas([velha, nova]))
    await aplicarEvento(ev('evt_nova', 'PAYMENT_RECEIVED', nova), 'req', asaas([velha, nova]))
    const r = await aplicarEvento(
      ev('evt_velha_r', 'PAYMENT_REFUNDED', velha),
      'req',
      asaas([{ ...velha, status: 'REFUNDED' }, nova]),
    )
    expect(r.estado).toBe('ignorado')
    expect(r.motivo).toMatch(/cobrança antiga/)
    expect(await ent.getPlanForUser(asUserId(u))).toBe('plus')
  })
})

describe('reconciliação: rodízio limitado e sem fome', () => {
  it('com mais linhas relevantes que o teto, passadas em dias seguidos cobrem TODAS', async () => {
    const L = rec.LIMITE_DE_ASSINATURAS
    const n = L + 40
    for (let i = 0; i < n; i++) {
      await subs.upsert(asUserId(`rod-${String(i).padStart(4, '0')}`), {
        plan: 'plus',
        status: 'active',
        currentPeriodEnd: Date.now() + 10 * DIA,
        provider: 'asaas',
        providerSubscriptionId: `sub_rod_${i}`,
      })
    }
    const vistas = new Set<string>()
    const deps = {
      listarDaAssinatura: async (id: string) => {
        vistas.add(id)
        return []
      },
      listarDoParcelamento: async () => [],
      aplicar: async () => ({ estado: 'ignorado', motivo: null }),
    }
    const hoje = Date.now()
    const passadas = Math.ceil((n + 50) / L) + 1 // + as outras contas ativas deste arquivo
    for (let d = 0; d < passadas; d++) {
      const r = await rec.reconciliarCobrancas({ agora: hoje + d * DIA, modo: 'report', deps })
      expect(r.assinaturas).toBeLessThanOrEqual(L)
    }
    for (let i = 0; i < n; i++) expect(vistas.has(`sub_rod_${i}`), `sub_rod_${i}`).toBe(true)
  })
})

describe('cota pelo período pago', () => {
  it('mensal: a janela é o período inteiro; a renovação paga abre a seguinte', () => {
    const venc = Date.parse('2026-11-29T12:00:00Z')
    const fim = venc + 35 * DIA
    const j = (quando: string) => quota.janelaDoPeriodoPago(fim, 'mensal', Date.parse(quando))
    expect(j('2026-11-29T15:00:00Z')).toBe('p2026-11-29')
    expect(j('2026-12-31T23:00:00Z')).toBe('p2026-11-29')
    expect(j('2027-01-02T12:00:00Z')).toBe('p2026-11-29')
    // A renovação (vencimento 29/12) estica o fim e muda a janela.
    expect(quota.janelaDoPeriodoPago(Date.parse('2026-12-29T12:00:00Z') + 35 * DIA, 'mensal', fim - DIA)).toBe(
      'p2026-12-29',
    )
  })

  it('anual: exatamente 12 janelas ao longo do período pago', () => {
    const inicio = Date.parse('2026-01-10T12:00:00Z')
    const fim = inicio + 370 * DIA
    const janelas = new Set<string>()
    for (let t = inicio; t < fim; t += DIA) janelas.add(quota.janelaDoPeriodoPago(fim, 'anual', t))
    expect(janelas.size).toBe(12)
  })

  it('Grátis e plano do admin (sem período) seguem no mês do calendário', async () => {
    const mes = new Date().toISOString().slice(0, 7)
    expect(await quota.janelaDaCota(asUserId('c-gratis'))).toBe(mes)
    await subs.upsert(asUserId('c-admin'), { plan: 'premium', status: 'active' })
    expect(await ent.getPlanForUser(asUserId('c-admin'))).toBe('premium')
    expect(await quota.janelaDaCota(asUserId('c-admin'))).toBe(mes)
  })

  it('a reserva e o estorno usam a MESMA janela do período', async () => {
    const u = asUserId('c-pagante')
    await subs.upsert(u, { plan: 'plus', status: 'active', currentPeriodEnd: Date.now() + 20 * DIA })
    const janela = await quota.janelaDaCota(u)
    expect(janela).toMatch(/^p\d{4}-\d{2}-\d{2}$/)
    const { usageCountersRepo } = await h.load<any>('../../server/db/repositories/usageCounters')
    expect(await quota.reserveManagedCall(u)).toBe(true)
    expect(await usageCountersRepo.get(u, quota.METRIC_MANAGED, janela)).toBe(1)
    await quota.refundManagedCall(u)
    expect(await usageCountersRepo.get(u, quota.METRIC_MANAGED, janela)).toBe(0)
  })
})
