import { randomUUID } from 'node:crypto'

import { and, count, eq, isNull } from 'drizzle-orm'

import type { UserId } from '../../lib/authContext'
import { db } from '../db'
import { subscriptions } from '../schema'

export type Subscription = typeof subscriptions.$inferSelect
import type { CicloDeCobranca, MeioDeCobranca, PlanoDeAssinatura } from '../../../src/core/planos'
// O tipo deriva da MATRIZ (src/core/planos.ts) — era uma união escrita à mão aqui, uma das
// cinco cópias que a mudança planos-essencial consolidou. A coluna pode trazer nome ANTIGO
// (`pro`, antes da migração 0041): quem lê `plan` para decidir passa por `normalizarPlano`.
export type Plan = PlanoDeAssinatura
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export interface SubscriptionPatch {
  plan?: Plan
  status?: SubStatus
  currentPeriodEnd?: number | null
  cancelAtPeriodEnd?: number | null
  provider?: string | null
  providerCustomerId?: string | null
  providerSubscriptionId?: string | null
  /** Matriz v2 (migração 0041): por mês ou o ano. Sem patch, a linha nova nasce `mensal`. */
  ciclo?: CicloDeCobranca
  /** O fluxo do Asaas que cobra; `null` = concedida pelo admin, sem cobrança no provedor. */
  meio?: MeioDeCobranca | null
  /** O parcelamento do Asaas, quando o anual é pago em 12x (C5). */
  providerInstallmentId?: string | null
  /**
   * A TROCA DE PLANO PENDENTE (migração 0050): o plano de destino e o vencimento (`AAAA-MM-DD`) da
   * primeira cobrança no valor novo. `plan` continua sendo o que está pago; `null` nas duas = sem troca.
   */
  trocaPara?: Plan | null
  trocaAPartirDe?: string | null
}

/**
 * A TROCA PENDENTE NÃO SOBREVIVE À ASSINATURA DELA. A intenção vale para UMA assinatura do Asaas, em
 * dia: quando a linha é cancelada (botão Cancelar, arrependimento, estorno, chargeback, assinatura
 * removida) ou passa a apontar para OUTRA assinatura (`/assinar` de novo), a troca pedida deixa de
 * existir — e a tela não pode continuar prometendo "a partir de DD/MM seu plano será X". Fica aqui, e
 * não em cada lugar que cancela (webhook, encerramento, admin), para nenhum deles esquecer. Quem grava a troca
 * (`trocaPara` no patch) decide por si.
 */
function semTrocaSeAAssinaturaAcabou(existente: Subscription, patch: SubscriptionPatch): SubscriptionPatch {
  if (!existente.trocaPara || 'trocaPara' in patch) return patch
  const cancelou = patch.status === 'canceled'
  const outraAssinatura =
    'providerSubscriptionId' in patch && patch.providerSubscriptionId !== existente.providerSubscriptionId
  return cancelou || outraAssinatura ? { ...patch, trocaPara: null, trocaAPartirDe: null } : patch
}

/** A assinatura (não-apagada) do usuário — no máx. uma (unique user_id). Null se não há. */
async function getActiveSub(userId: UserId): Promise<Subscription | null> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), isNull(subscriptions.deletedAt)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * ASSINATURA — a fonte da verdade do plano server-side (o webhook de billing escreve aqui na
 * Fatia 6). Escopado por `userId` (branded) como todo repo do Marco 1; `unique(user_id)` garante
 * no máximo uma assinatura por usuário.
 */
export const subscriptionsRepo = {
  getActive: getActiveSub,

  /**
   * Quantas assinaturas `active` há por plano e CICLO — a base da receita do mês que dimensiona o
   * pool diário de IA gratuita (Fase 7, `server/lib/convidado.ts`). O ciclo entra porque o anual
   * rende por mês a décima segunda parte do preço do ano, não o preço do mês. Agregado do serviço,
   * sem titular. `plan` vem cru do banco (pode ser nome antigo): quem soma normaliza.
   */
  async contarAtivasPorPlano(): Promise<Array<{ plan: string; ciclo: string; n: number }>> {
    const rows = await db
      .select({ plan: subscriptions.plan, ciclo: subscriptions.ciclo, n: count() })
      .from(subscriptions)
      .where(and(eq(subscriptions.status, 'active'), isNull(subscriptions.deletedAt)))
      .groupBy(subscriptions.plan, subscriptions.ciclo)
    return rows.map((r) => ({ plan: r.plan, ciclo: r.ciclo, n: Number(r.n) }))
  },

  /**
   * Cria ou atualiza a assinatura do usuário. Idempotente por usuário: se já existe, atualiza os
   * campos do `patch`; senão insere com defaults. NÃO confia no cliente — só o billing/admin chama.
   */
  async upsert(userId: UserId, patch: SubscriptionPatch): Promise<Subscription> {
    const now = Date.now()
    const existente = await getActiveSub(userId)
    if (existente) {
      await db
        .update(subscriptions)
        .set({ ...semTrocaSeAAssinaturaAcabou(existente, patch), updatedAt: now })
        .where(and(eq(subscriptions.userId, userId), isNull(subscriptions.deletedAt)))
      const r = await getActiveSub(userId)
      if (!r) throw new Error('falha ao atualizar assinatura')
      return r
    }
    const row: typeof subscriptions.$inferInsert = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      userId,
      plan: patch.plan ?? 'free',
      status: patch.status ?? 'active',
      currentPeriodEnd: patch.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: patch.cancelAtPeriodEnd ?? null,
      provider: patch.provider ?? null,
      providerCustomerId: patch.providerCustomerId ?? null,
      providerSubscriptionId: patch.providerSubscriptionId ?? null,
      ciclo: patch.ciclo ?? 'mensal',
      meio: patch.meio ?? null,
      providerInstallmentId: patch.providerInstallmentId ?? null,
      trocaPara: patch.trocaPara ?? null,
      trocaAPartirDe: patch.trocaAPartirDe ?? null,
    }
    await db.insert(subscriptions).values(row)
    const r = await getActiveSub(userId)
    if (!r) throw new Error('falha ao criar assinatura')
    return r
  },
}
