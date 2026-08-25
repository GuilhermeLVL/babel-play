import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { subscriptions } from '../schema'
import type { UserId } from '../../lib/authContext'

export type Subscription = typeof subscriptions.$inferSelect
export type Plan = 'free' | 'pro' | 'selfhost'
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export interface SubscriptionPatch {
  plan?: Plan
  status?: SubStatus
  currentPeriodEnd?: number | null
  cancelAtPeriodEnd?: number | null
  provider?: string | null
  providerCustomerId?: string | null
  providerSubscriptionId?: string | null
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
   * Cria ou atualiza a assinatura do usuário. Idempotente por usuário: se já existe, atualiza os
   * campos do `patch`; senão insere com defaults. NÃO confia no cliente — só o billing/admin chama.
   */
  async upsert(userId: UserId, patch: SubscriptionPatch): Promise<Subscription> {
    const now = Date.now()
    const existente = await getActiveSub(userId)
    if (existente) {
      await db
        .update(subscriptions)
        .set({ ...patch, updatedAt: now })
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
    }
    await db.insert(subscriptions).values(row)
    const r = await getActiveSub(userId)
    if (!r) throw new Error('falha ao criar assinatura')
    return r
  },
}
