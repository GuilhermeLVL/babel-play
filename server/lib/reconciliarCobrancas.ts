/**
 * RECONCILIAÇÃO ASAAS × BANCO — o cinto de segurança do webhook. A entrega do Asaas é at-least-once, mas um
 * webhook pode ficar fora do ar, ter o token errado ou perder a corrida de um deploy: o pagamento confirma lá e o
 * plano nunca chega. Este job, uma vez por dia, olha as cobranças pagas dos últimos 45 dias de cada assinatura
 * (e parcelamento) do Asaas e procura as que NUNCA geraram evento em `billing_events`.
 *
 *  - `report` (padrão): só avisa (`billing_reconciliacao_divergente`, que alerta por e-mail) e conta;
 *  - `apply`: reaplica pelo MESMO caminho do webhook (`aplicarEvento`, que ainda confere o pagamento na API), com
 *    id de evento determinístico `reconc-<pagamento>`: rodar de novo ou o webhook tardio chegar não concede em dobro
 *    (o webhook tem o id `evt_…` dele, mas `aplicarEvento` é idempotente por pagamento/vencimento).
 *
 * Teto por passada: `LIMITE_DE_ASSINATURAS`. A fila de revisão do admin continua sendo o destino de quem não aplica.
 */
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm'

import { db } from '../db/db'
import { billingEventsRepo } from '../db/repositories/billingEvents'
import { billingEvents, subscriptions } from '../db/schema'
import {
  asaasConfigurado,
  type CobrancaListadaAsaas,
  listarCobrancasDaAssinatura,
  listarCobrancasDoParcelamento,
} from './asaas'
import { aplicarEvento, type EventoAsaas, type ResultadoDoEvento } from './billingEventos'
import { log } from './logger'

export const JANELA_DE_DIAS = 45
export const LIMITE_DE_ASSINATURAS = 150
const DIA = 86_400_000
const PAGAS = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'])

export type ModoDaReconciliacao = 'report' | 'apply'
export const modoDaReconciliacao = (env: NodeJS.ProcessEnv): ModoDaReconciliacao =>
  env.BILLING_RECONCILE_MODE === 'apply' ? 'apply' : 'report'

export interface DependenciasDaReconciliacao {
  listarDaAssinatura: (id: string) => Promise<CobrancaListadaAsaas[]>
  listarDoParcelamento: (id: string) => Promise<CobrancaListadaAsaas[]>
  aplicar: (ev: EventoAsaas) => Promise<ResultadoDoEvento>
}

const padrao: DependenciasDaReconciliacao = {
  listarDaAssinatura: (id) => listarCobrancasDaAssinatura(id, 24),
  listarDoParcelamento: (id) => listarCobrancasDoParcelamento(id, 24),
  aplicar: (ev) => aplicarEvento(ev, 'reconciliacao'),
}

export interface ResumoDaReconciliacao {
  modo: ModoDaReconciliacao
  assinaturas: number
  cobrancas: number
  divergentes: number
  reaplicadas: number
  falhas: number
}

/** A data em que o pagamento valeu (a mais recente conhecida), em ms; `null` se o Asaas não disse. */
function quandoPagou(c: CobrancaListadaAsaas): number | null {
  const d = c.paymentDate ?? c.confirmedDate ?? c.clientPaymentDate ?? c.dueDate
  const t = d ? Date.parse(d) : NaN
  return Number.isNaN(t) ? null : t
}

export async function reconciliarCobrancas(opts: {
  agora: number
  modo: ModoDaReconciliacao
  deps?: DependenciasDaReconciliacao
}): Promise<ResumoDaReconciliacao> {
  const { agora, modo, deps = padrao } = opts
  const resumo: ResumoDaReconciliacao = {
    modo,
    assinaturas: 0,
    cobrancas: 0,
    divergentes: 0,
    reaplicadas: 0,
    falhas: 0,
  }
  if (!asaasConfigurado() && deps === padrao) return resumo

  const linhas = await db
    .select({
      userId: subscriptions.userId,
      sub: subscriptions.providerSubscriptionId,
      parcelamento: subscriptions.providerInstallmentId,
    })
    .from(subscriptions)
    .where(and(eq(subscriptions.provider, 'asaas'), isNull(subscriptions.deletedAt)))
    .limit(LIMITE_DE_ASSINATURAS)
  resumo.assinaturas = linhas.length

  const desde = agora - JANELA_DE_DIAS * DIA
  for (const l of linhas) {
    const fontes: Array<() => Promise<CobrancaListadaAsaas[]>> = []
    if (l.sub) fontes.push(() => deps.listarDaAssinatura(l.sub as string))
    if (l.parcelamento) fontes.push(() => deps.listarDoParcelamento(l.parcelamento as string))
    for (const buscar of fontes) {
      let cobrancas: CobrancaListadaAsaas[]
      try {
        cobrancas = await buscar()
      } catch {
        resumo.falhas++
        log('warn', { event: 'billing_reconciliacao_consulta_falhou' })
        continue
      }
      const recentes = cobrancas.filter((c) => PAGAS.has(c.status) && (quandoPagou(c) ?? 0) >= desde)
      resumo.cobrancas += recentes.length
      if (!recentes.length) continue
      const vistos = await db
        .select({ ref: billingEvents.providerRef })
        .from(billingEvents)
        .where(
          and(
            isNotNull(billingEvents.providerRef),
            inArray(
              billingEvents.providerRef,
              recentes.map((c) => c.id),
            ),
            inArray(billingEvents.event, ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']),
          ),
        )
      const comEvento = new Set(vistos.map((v) => v.ref))
      for (const c of recentes.filter((x) => !comEvento.has(x.id))) {
        resumo.divergentes++
        log('warn', { event: 'billing_reconciliacao_divergente', error: c.status })
        if (modo !== 'apply') continue
        const idDoEvento = `reconc-${c.id}`
        const ev: EventoAsaas = {
          id: idDoEvento,
          event: c.status === 'CONFIRMED' ? 'PAYMENT_CONFIRMED' : 'PAYMENT_RECEIVED',
          payment: {
            id: c.id,
            externalReference: l.userId ?? undefined,
            ...(l.sub ? { subscription: l.sub } : {}),
            ...(!l.sub && l.parcelamento ? { installment: l.parcelamento } : {}),
            value: c.value,
            ...(c.dueDate ? { dueDate: c.dueDate } : {}),
            ...(c.billingType ? { billingType: c.billingType } : {}),
          },
        }
        try {
          if (!(await billingEventsRepo.marcarSeNovo(idDoEvento, 'asaas', ev.event, l.userId, c.id, ev))) continue
          const r = await deps.aplicar(ev)
          await billingEventsRepo.registrarResultado(idDoEvento, r.estado, r.motivo)
          if (r.estado === 'aplicado') resumo.reaplicadas++
        } catch {
          // Sem resultado gravado, a marca some: a próxima passada tenta de novo (o Asaas está fora, p.ex.).
          await billingEventsRepo.desmarcar(idDoEvento).catch(() => {})
          resumo.falhas++
          log('warn', { event: 'billing_reconciliacao_aplicacao_falhou' })
        }
      }
    }
  }
  if (resumo.divergentes > 0) log('warn', { event: 'billing_reconciliacao_resumo', total: resumo.divergentes })
  return resumo
}
