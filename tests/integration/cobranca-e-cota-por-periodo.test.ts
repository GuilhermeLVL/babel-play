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

async function checkout(u: string, plano: string, sub: string, ciclo: 'mensal' | 'anual' = 'mensal') {
  await subs.upsert(asUserId(u), {
    plan: plano,
    planoDaCobranca: plano,
    status: 'trialing',
    provider: 'asaas',
    providerSubscriptionId: sub,
    ciclo,
  })
}

/** Checkout + pagamento confirmado pelo caminho do webhook. */
async function pagar(u: string, plano: string, sub: string, valor: number, vencimento: number) {
  await checkout(u, plano, sub, valor > 50 ? 'anual' : 'mensal')
  const p = {
    id: `pay_${u}`,
    status: 'CONFIRMED',
    value: valor,
    subscription: sub,
    externalReference: u,
    dueDate: diaIso(vencimento),
  }
  const r = await aplicarEvento(ev(`evt_${u}`, 'PAYMENT_CONFIRMED', p), 'req', asaas([p]))
  expect(r.estado).toBe('aplicado')
  return p
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
    const j = (quando: string) => quota.janelaDoPeriodoPago(venc, 'mensal', Date.parse(quando))
    expect(j('2026-11-29T15:00:00Z')).toBe('p2026-11-29')
    expect(j('2026-12-31T23:00:00Z')).toBe('p2026-11-29')
    expect(j('2027-01-02T12:00:00Z')).toBe('p2026-11-29')
    // A renovação paga (vencimento 29/12) grava a âncora nova e muda a janela.
    expect(quota.janelaDoPeriodoPago(Date.parse('2026-12-29T12:00:00Z'), 'mensal', fim - DIA)).toBe('p2026-12-29')
  })

  it('anual: exatamente 12 janelas ao longo do período pago', () => {
    const inicio = Date.parse('2026-01-10T12:00:00Z')
    const fim = inicio + 370 * DIA
    const janelas = new Set<string>()
    for (let t = inicio; t < fim; t += DIA) janelas.add(quota.janelaDoPeriodoPago(inicio, 'anual', t))
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
    await pagar('c-pagante', 'plus', 'sub_cpag', 14.9, Date.now() - 2 * DIA)
    const janela = await quota.janelaDaCota(u)
    expect(janela).toMatch(/^p\d{4}-\d{2}-\d{2}$/)
    const { usageCountersRepo } = await h.load<any>('../../server/db/repositories/usageCounters')
    expect(await quota.reserveManagedCall(u)).toBe(true)
    expect(await usageCountersRepo.get(u, quota.METRIC_MANAGED, janela)).toBe(1)
    await quota.refundManagedCall(u)
    expect(await usageCountersRepo.get(u, quota.METRIC_MANAGED, janela)).toBe(0)
  })
})

/* ───────────── revisão independente do PR #131 ───────────── */

describe('a âncora da janela só muda com pagamento', () => {
  async function esgotar(u: string) {
    const { usageCountersRepo } = await h.load<any>('../../server/db/repositories/usageCounters')
    const janela = await quota.janelaDaCota(asUserId(u))
    await usageCountersRepo.increment(asUserId(u), quota.METRIC_MANAGED, janela, quota.capForPlan('plus'))
    expect(await quota.reserveManagedCall(asUserId(u))).toBe(false)
  }

  it('cancelar fora dos 7 dias (grava currentPeriodEnd = próximo vencimento) NÃO zera a cota', async () => {
    const u = 'a-cancela'
    await pagar(u, 'plus', 'sub_acan', 14.9, Date.now() - 19 * DIA)
    await esgotar(u)
    // O mesmo patch de `encerramentoDeAssinatura` (fora dos 7 dias): o fim vira o fim do dia do próximo vencimento.
    await subs.upsert(asUserId(u), {
      status: 'canceled',
      cancelAtPeriodEnd: 1,
      currentPeriodEnd: Date.now() + 11 * DIA + 3_600_000,
    })
    expect(await ent.getPlanForUser(asUserId(u))).toBe('plus')
    expect(await quota.reserveManagedCall(asUserId(u))).toBe(false)
  })

  it('no anual, cancelar também não desloca a fatia', async () => {
    const u = 'a-cancela-anual'
    await pagar(u, 'plus', 'sub_acan_a', 149.0, Date.now() - 40 * DIA)
    await esgotar(u)
    const sub = await subs.getActive(asUserId(u))
    await subs.upsert(asUserId(u), {
      status: 'canceled',
      cancelAtPeriodEnd: 1,
      currentPeriodEnd: sub.currentPeriodEnd - 5 * DIA,
    })
    expect(await quota.reserveManagedCall(asUserId(u))).toBe(false)
  })

  it('o admin mexer no currentPeriodEnd não zera a cota', async () => {
    const u = 'a-admin-fim'
    await pagar(u, 'plus', 'sub_aadm', 14.9, Date.now() - 2 * DIA)
    await esgotar(u)
    await subs.upsert(asUserId(u), { currentPeriodEnd: Date.now() + 60 * DIA })
    expect(await quota.reserveManagedCall(asUserId(u))).toBe(false)
  })
})

describe('valor fora da matriz: ciclo registrado e troca pendente', () => {
  it('cobrança ANUAL com valor que não cobre o anual: pendente, e não 35 dias calados', async () => {
    const u = 'f-anual'
    await checkout(u, 'premium', 'sub_fan_a', 'anual')
    const p = { id: 'pay_fan_a', status: 'RECEIVED', value: 20.31, subscription: 'sub_fan_a', externalReference: u }
    const r = await aplicarEvento(ev('evt_fan_a', 'PAYMENT_RECEIVED', p), 'req', asaas([p]))
    expect(r.estado).toBe('nao-aplicado')
    expect(await ent.getPlanForUser(asUserId(u))).toBe('free')
  })

  it('troca para cima pendente, paga com juros: concede o plano NOVO e encerra a troca', async () => {
    const u = 'f-upgrade'
    await pagar(u, 'plus', 'sub_fup', 14.9, Date.now() - 31 * DIA)
    await subs.upsert(asUserId(u), { trocaPara: 'premium', trocaAPartirDe: diaIso(Date.now()) })
    const p = { id: 'pay_fup2', status: 'RECEIVED', value: 20.31, subscription: 'sub_fup', externalReference: u }
    const r = await aplicarEvento(ev('evt_fup2', 'PAYMENT_RECEIVED', p), 'req', asaas([p]))
    expect(r.estado).toBe('aplicado')
    const sub = await subs.getActive(asUserId(u))
    expect(sub.plan).toBe('premium')
    expect(sub.trocaPara).toBeNull()
    expect(sub.planoDaCobranca).toBe('premium')
  })

  it('troca para baixo pendente, paga com juros: concede o plano novo (não deixa sem nada)', async () => {
    const u = 'f-downgrade'
    await pagar(u, 'premium', 'sub_fdown', 19.9, Date.now() - 31 * DIA)
    await subs.upsert(asUserId(u), { trocaPara: 'plus', trocaAPartirDe: diaIso(Date.now()) })
    const p = { id: 'pay_fdown2', status: 'RECEIVED', value: 15.37, subscription: 'sub_fdown', externalReference: u }
    const r = await aplicarEvento(ev('evt_fdown2', 'PAYMENT_RECEIVED', p), 'req', asaas([p]))
    expect(r.estado).toBe('aplicado')
    expect((await subs.getActive(asUserId(u))).plan).toBe('plus')
  })
})

describe('dinheiro devolvido: chargeback antigo, duplicata e corrida', () => {
  it('CHARGEBACK de cobrança antiga vai para revisão humana (nao-aplicado), não some como ignorado', async () => {
    const u = 'd-cb-antigo'
    await checkout(u, 'plus', 'sub_dcb')
    const velha = {
      id: 'pay_dcb_v',
      status: 'RECEIVED',
      value: 14.9,
      subscription: 'sub_dcb',
      externalReference: u,
      dueDate: diaIso(Date.now() - 31 * DIA),
    }
    const nova = { ...velha, id: 'pay_dcb_n', dueDate: diaIso(Date.now() - 1 * DIA) }
    await aplicarEvento(ev('evt_dcb_v', 'PAYMENT_RECEIVED', velha), 'req', asaas([velha, nova]))
    await aplicarEvento(ev('evt_dcb_n', 'PAYMENT_RECEIVED', nova), 'req', asaas([velha, nova]))
    const cb = { ...velha, status: 'CHARGEBACK_REQUESTED' }
    const r = await aplicarEvento(ev('evt_dcb_cb', 'PAYMENT_CHARGEBACK_REQUESTED', velha), 'req', asaas([cb, nova]))
    expect(r.estado).toBe('nao-aplicado')
    expect(await ent.getPlanForUser(asUserId(u))).toBe('plus')
  })

  it('cobrança DUPLICADA (mesmo vencimento): estornar a duplicata não revoga, a outra segue paga', async () => {
    const { billingEventsRepo } = await h.load<any>('../../server/db/repositories/billingEvents')
    const u = 'd-duplicada'
    await checkout(u, 'plus', 'sub_ddup')
    const venc = diaIso(Date.now() - 2 * DIA)
    const a = {
      id: 'pay_ddup_a',
      status: 'RECEIVED',
      value: 14.9,
      subscription: 'sub_ddup',
      externalReference: u,
      dueDate: venc,
    }
    const b = { ...a, id: 'pay_ddup_b' }
    for (const p of [a, b]) {
      const e = ev(`evt_${p.id}`, 'PAYMENT_RECEIVED', p)
      await billingEventsRepo.marcarSeNovo(e.id, 'asaas', e.event, u, p.id, e)
      const r = await aplicarEvento(e, 'req', asaas([a, b]))
      await billingEventsRepo.registrarResultado(e.id, r.estado, r.motivo)
    }
    const bEstornado = { ...b, status: 'REFUNDED' }
    const r = await aplicarEvento(ev('evt_ddup_r', 'PAYMENT_REFUNDED', b), 'req', asaas([a, bEstornado]))
    expect(r.estado).toBe('ignorado')
    expect(r.motivo).toMatch(/pay_ddup_a/)
    expect(await ent.getPlanForUser(asUserId(u))).toBe('plus')
  })

  it('a revogação é condicional: com o período lido já trocado por outro pagamento, não apaga nada', async () => {
    const u = asUserId('d-corrida')
    await pagar('d-corrida', 'plus', 'sub_dcor', 14.9, Date.now() - 2 * DIA)
    const lido = (await subs.getActive(u)).currentPeriodEnd
    // Entre a leitura e a escrita, outro pagamento esticou o período.
    await subs.upsert(u, { currentPeriodEnd: lido + 30 * DIA })
    expect(await subs.revogarSePeriodoIgual(u, lido)).toBe(false)
    expect((await subs.getActive(u)).currentPeriodEnd).toBe(lido + 30 * DIA)
    expect(await subs.revogarSePeriodoIgual(u, lido + 30 * DIA)).toBe(true)
    expect(await ent.getPlanForUser(u)).toBe('free')
  })
})

describe('reconciliação: filtro e atribuição', () => {
  it('active com período vencido há muito tempo NÃO entra na passada', async () => {
    await subs.upsert(asUserId('r-active-velha'), {
      plan: 'plus',
      status: 'active',
      currentPeriodEnd: Date.now() - 400 * DIA,
      provider: 'asaas',
      providerSubscriptionId: 'sub_active_velha',
    })
    const vistas = new Set<string>()
    const deps = {
      listarDaAssinatura: async (id: string) => {
        vistas.add(id)
        return []
      },
      listarDoParcelamento: async () => [],
      aplicar: async () => ({ estado: 'ignorado', motivo: null }),
    }
    for (let d = 0; d < 4; d++) await rec.reconciliarCobrancas({ agora: Date.now() + d * DIA, modo: 'report', deps })
    expect(vistas.has('sub_active_velha')).toBe(false)
  })

  it('o estorno achado na lista do PARCELAMENTO é atribuído ao parcelamento, não à assinatura da linha', async () => {
    const u = 'r-dupla-origem'
    await subs.upsert(asUserId(u), {
      plan: 'plus',
      status: 'active',
      currentPeriodEnd: Date.now() + 100 * DIA,
      provider: 'asaas',
      providerSubscriptionId: 'sub_dupla',
      providerInstallmentId: 'inst_dupla',
    })
    const aplicados: any[] = []
    const estornada = {
      id: 'pay_inst_ref',
      status: 'REFUNDED',
      value: 12.41,
      dueDate: diaIso(Date.now() - 5 * DIA),
      paymentDate: diaIso(Date.now() - 5 * DIA),
    }
    const paga = { ...estornada, id: 'pay_inst_ok', status: 'CONFIRMED' }
    // Em rodízio (este arquivo tem mais linhas ativas que o teto): passadas em dias seguidos até a linha entrar.
    for (let d = 0; d < 3 && aplicados.length < 2; d++)
      await rec.reconciliarCobrancas({
        agora: Date.now() + d * DIA,
        modo: 'apply',
        deps: {
          listarDaAssinatura: async () => [],
          listarDoParcelamento: async (id: string) => (id === 'inst_dupla' ? [estornada, paga] : []),
          aplicar: async (e: any) => {
            aplicados.push(e)
            return { estado: 'ignorado', motivo: null }
          },
        },
      })
    const doEstorno = aplicados.find((e) => e.payment.id === 'pay_inst_ref')
    const doPago = aplicados.find((e) => e.payment.id === 'pay_inst_ok')
    for (const e of [doEstorno, doPago]) {
      expect(e.payment.installment).toBe('inst_dupla')
      expect(e.payment.subscription).toBeUndefined()
    }
  })
})
