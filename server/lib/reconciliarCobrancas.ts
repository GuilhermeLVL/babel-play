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
 * O DINHEIRO QUE VOLTOU também (auditoria de 14/11/2026): a cobrança ESTORNADA ou em CHARGEBACK cujo evento nunca
 * chegou deixava o plano de pé até o fim do período (35 dias no mensal, 370 no anual). Ela é achada do mesmo jeito
 * e reaplicada pelo mesmo `aplicarEvento` (`PAYMENT_REFUNDED`/`PAYMENT_CHARGEBACK_REQUESTED`), que confere na API e
 * só revoga se a cobrança for a do período em vigor.
 *
 * QUAIS ASSINATURAS (auditoria de 14/11/2026): só as que ainda podem ter cobrança a reconciliar — com período
 * pago em vigor ou que terminou há menos de `JANELA_DE_DIAS`, ou com checkout recente. Em ordem
 * determinística (`user_id`) e em RODÍZIO diário: com mais de `LIMITE_DE_ASSINATURAS` linhas, cada passada começa
 * onde a anterior parou, e toda linha é olhada a cada ⌈total / limite⌉ dias. O custo por passada segue limitado.
 * Antes era `LIMIT 150` sem ordem nem filtro: as canceladas e vencidas ocupavam o teto para sempre, e a 151ª
 * conta nunca era olhada.
 *
 * A fila de revisão do admin continua sendo o destino de quem não aplica.
 */
import { and, asc, count, eq, gte, inArray, isNotNull, isNull, or, type SQL } from 'drizzle-orm'

import { db } from '../db/db'
import { billingEventsRepo } from '../db/repositories/billingEvents'
import { billingEvents, subscriptions } from '../db/schema'
import {
  asaasConfigurado,
  type CobrancaListadaAsaas,
  listarCobrancasDaAssinatura,
  listarCobrancasDoParcelamento,
} from './asaas'
import { aplicarEvento, DIAS_DO_PERIODO_ANUAL, type EventoAsaas, type ResultadoDoEvento } from './billingEventos'
import { log } from './logger'

export const JANELA_DE_DIAS = 45
export const LIMITE_DE_ASSINATURAS = 150
const DIA = 86_400_000
const PAGAS = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'])
/** Os eventos que o webhook manda quando o dinheiro de uma cobrança paga volta (ou fica retido). */
const EVENTO_DO_DESFEITO: Readonly<Record<string, string>> = {
  REFUNDED: 'PAYMENT_REFUNDED',
  CHARGEBACK_REQUESTED: 'PAYMENT_CHARGEBACK_REQUESTED',
  CHARGEBACK_DISPUTE: 'PAYMENT_CHARGEBACK_REQUESTED',
}
const EVENTOS_DE_DESFEITO = ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE']

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

  const desde = agora - JANELA_DE_DIAS * DIA
  const linhas = await assinaturasDaPassada(agora, desde)
  resumo.assinaturas = linhas.length
  /* O estorno pode desfazer qualquer cobrança que ainda conceda período: até um ano (o anual) para trás. */
  const desdeDoDesfeito = agora - DIAS_DO_PERIODO_ANUAL * DIA
  for (const l of linhas) {
    /* Cada lista carrega a SUA origem: a cobrança achada na lista do parcelamento é do parcelamento, mesmo que a
       linha também guarde uma assinatura (e vice-versa) — o evento reaplicado diz de qual fluxo ela é. */
    const fontes: Array<{ buscar: () => Promise<CobrancaListadaAsaas[]>; origem: OrigemDaCobranca }> = []
    if (l.sub) {
      const sub = l.sub
      fontes.push({ buscar: () => deps.listarDaAssinatura(sub), origem: { subscription: sub } })
    }
    if (l.parcelamento) {
      const parcelamento = l.parcelamento
      fontes.push({ buscar: () => deps.listarDoParcelamento(parcelamento), origem: { installment: parcelamento } })
    }
    for (const { buscar, origem } of fontes) {
      let cobrancas: CobrancaListadaAsaas[]
      try {
        cobrancas = await buscar()
      } catch {
        resumo.falhas++
        log('warn', { event: 'billing_reconciliacao_consulta_falhou' })
        continue
      }
      const desfeitas = cobrancas.filter(
        (c) => EVENTO_DO_DESFEITO[c.status] && (quandoPagou(c) ?? 0) >= desdeDoDesfeito,
      )
      if (desfeitas.length) await reconciliarDesfeitas(l, origem, desfeitas, modo, deps, resumo)
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
            ...origem,
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

/** De qual fluxo do Asaas veio a lista em que a cobrança foi achada. */
type OrigemDaCobranca = { subscription: string } | { installment: string }

interface LinhaDaPassada {
  userId: string | null
  sub: string | null
  parcelamento: string | null
}

/**
 * AS ASSINATURAS DESTA PASSADA: as que ainda podem ter cobrança a reconciliar, em rodízio.
 *  - período pago em vigor (renovação, estorno, chargeback) ou que acabou há menos de `JANELA_DE_DIAS` (um pagamento
 *    perdido pode tê-lo deixado vencer) — qualquer status: `active` com o período vencido há muito não entra;
 *  - checkout recente (`trialing`, ou `/assinar` numa linha cancelada, que grava `cancelAtPeriodEnd = 0`) mexido
 *    nos últimos `JANELA_DE_DIAS`: é o primeiro pagamento, o que mais dói perder.
 * Fora disso (cancelada e vencida há tempo, checkout abandonado) não há o que reconciliar.
 *
 * RODÍZIO SEM ESTADO: a ordem é a do `user_id`, e o início da janela anda `LIMITE_DE_ASSINATURAS` linhas por dia
 * (dando a volta no fim). Duas consultas, no máximo `LIMITE_DE_ASSINATURAS` linhas.
 */
async function assinaturasDaPassada(agora: number, desde: number): Promise<LinhaDaPassada[]> {
  const relevante = and(
    eq(subscriptions.provider, 'asaas'),
    isNull(subscriptions.deletedAt),
    or(
      gte(subscriptions.currentPeriodEnd, desde),
      and(
        gte(subscriptions.updatedAt, desde),
        or(eq(subscriptions.status, 'trialing'), eq(subscriptions.cancelAtPeriodEnd, 0)),
      ),
    ),
  ) as SQL
  const [{ total }] = await db.select({ total: count() }).from(subscriptions).where(relevante)
  const n = Number(total)
  const pagina = (offset: number, limite: number) =>
    db
      .select({
        userId: subscriptions.userId,
        sub: subscriptions.providerSubscriptionId,
        parcelamento: subscriptions.providerInstallmentId,
      })
      .from(subscriptions)
      .where(relevante)
      .orderBy(asc(subscriptions.userId), asc(subscriptions.id))
      .offset(offset)
      .limit(limite)
  if (n <= LIMITE_DE_ASSINATURAS) return pagina(0, LIMITE_DE_ASSINATURAS)
  const inicio = (Math.floor(agora / DIA) * LIMITE_DE_ASSINATURAS) % n
  const primeira = await pagina(inicio, LIMITE_DE_ASSINATURAS)
  if (primeira.length >= LIMITE_DE_ASSINATURAS) return primeira
  return [...primeira, ...(await pagina(0, LIMITE_DE_ASSINATURAS - primeira.length))]
}

/**
 * O ESTORNO E O CHARGEBACK SEM EVENTO: a cobrança voltou no Asaas e o webhook não chegou. No `apply`, reaplica pelo
 * MESMO caminho do webhook com o id determinístico `reconc-<desfeito>-<pagamento>`: rodar de novo não repete, e
 * `aplicarEvento` confere na API e só revoga o período que esta cobrança concedeu.
 */
async function reconciliarDesfeitas(
  l: LinhaDaPassada,
  origem: OrigemDaCobranca,
  desfeitas: CobrancaListadaAsaas[],
  modo: ModoDaReconciliacao,
  deps: DependenciasDaReconciliacao,
  resumo: ResumoDaReconciliacao,
): Promise<void> {
  const vistos = await db
    .select({ ref: billingEvents.providerRef })
    .from(billingEvents)
    .where(
      and(
        isNotNull(billingEvents.providerRef),
        inArray(
          billingEvents.providerRef,
          desfeitas.map((c) => c.id),
        ),
        inArray(billingEvents.event, EVENTOS_DE_DESFEITO),
      ),
    )
  const comEvento = new Set(vistos.map((v) => v.ref))
  for (const c of desfeitas.filter((x) => !comEvento.has(x.id))) {
    resumo.divergentes++
    log('warn', { event: 'billing_reconciliacao_divergente', error: c.status })
    if (modo !== 'apply') continue
    const tipo = EVENTO_DO_DESFEITO[c.status]
    const idDoEvento = `reconc-${tipo === 'PAYMENT_REFUNDED' ? 'estorno' : 'chargeback'}-${c.id}`
    const ev: EventoAsaas = {
      id: idDoEvento,
      event: tipo,
      payment: {
        id: c.id,
        externalReference: l.userId ?? undefined,
        ...origem,
        value: c.value,
        ...(c.dueDate ? { dueDate: c.dueDate } : {}),
      },
    }
    try {
      if (!(await billingEventsRepo.marcarSeNovo(idDoEvento, 'asaas', tipo, l.userId, c.id, ev))) continue
      const r = await deps.aplicar(ev)
      await billingEventsRepo.registrarResultado(idDoEvento, r.estado, r.motivo)
      if (r.estado === 'aplicado') resumo.reaplicadas++
    } catch {
      await billingEventsRepo.desmarcar(idDoEvento).catch(() => {})
      resumo.falhas++
      log('warn', { event: 'billing_reconciliacao_aplicacao_falhou' })
    }
  }
}
