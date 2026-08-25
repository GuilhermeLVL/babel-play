/**
 * SaaS — CONTADORES de uso de IA gerenciada (fair-use), por janela mensal. Upsert idempotente sobre
 * `unique(user_id, metric, window)`: increment() cria a linha (count = by) ou soma no conflito.
 */
import { randomUUID } from 'node:crypto'
import { and, eq, lt, sql } from 'drizzle-orm'
import { db } from '../db'
import { usageCounters } from '../schema'
import type { UserId } from '../../lib/authContext'

export const usageCountersRepo = {
  /**
   * @deprecated P3-N1: NÃO use para decidir se algo cabe no teto — ler e depois gravar é o
   * read-modify-write que causou o P0-1 (20 chamadas aceitas contra teto de 5). Use .
   * Mantido só para leitura de diagnóstico e testes.
   */
  async get(userId: UserId, metric: string, window: string): Promise<number> {
    const rows = await db
      .select()
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, userId), eq(usageCounters.metric, metric), eq(usageCounters.window, window)))
      .limit(1)
    return rows[0]?.count ?? 0
  },

  /** Soma `by` (default 1) de forma idempotente por janela. */
  async increment(userId: UserId, metric: string, window: string, by = 1): Promise<void> {
    const now = Date.now()
    await db
      .insert(usageCounters)
      .values({ id: randomUUID(), userId, createdAt: now, updatedAt: now, metric, window, count: by })
      .onConflictDoUpdate({
        target: [usageCounters.userId, usageCounters.metric, usageCounters.window],
        set: { count: sql`${usageCounters.count} + ${by}`, updatedAt: now },
      })
  },

  /**
   * RESERVA uma unidade se — e só se — couber no teto. Decide e grava numa ÚNICA instrução.
   *
   * Existe porque `get()` seguido de `increment()` é read-modify-write: sob concorrência, N
   * requisições liam o mesmo `count` antes de qualquer incremento pousar e todas passavam.
   * Medido na auditoria: 20 chamadas aceitas contra teto de 5 (P0-1). Aqui o `setWhere` roda
   * DENTRO do upsert, então quem perde a corrida simplesmente não afeta linha nenhuma.
   *
   * `cap` deve ser um inteiro finito ≥ 0; não-finito significa ilimitado (não conta).
   * @returns true se a reserva coube; false se o teto já estava cheio.
   */
  async reserve(userId: UserId, metric: string, window: string, cap: number): Promise<boolean> {
    if (!Number.isFinite(cap)) return true // ilimitado (selfhost) — nem contabiliza
    if (cap < 1) return false
    const now = Date.now()
    const r = await db
      .insert(usageCounters)
      .values({ id: randomUUID(), userId, createdAt: now, updatedAt: now, metric, window, count: 1 })
      .onConflictDoUpdate({
        target: [usageCounters.userId, usageCounters.metric, usageCounters.window],
        set: { count: sql`${usageCounters.count} + 1`, updatedAt: now },
        setWhere: sql`${usageCounters.count} < ${cap}`,
      })
    return r.rowsAffected > 0
  },

  /**
   * Soma 1 e devolve o total JÁ atualizado, numa instrução só (`RETURNING`).
   * É o primitivo do rate-limit compartilhado (server/lib/rateLimitStore.ts): contar e ler
   * em duas idas ao banco daria contagem errada com requisições simultâneas.
   */
  async incrementAndGet(userId: UserId, metric: string, window: string): Promise<number> {
    const now = Date.now()
    const rows = await db
      .insert(usageCounters)
      .values({ id: randomUUID(), userId, createdAt: now, updatedAt: now, metric, window, count: 1 })
      .onConflictDoUpdate({
        target: [usageCounters.userId, usageCounters.metric, usageCounters.window],
        set: { count: sql`${usageCounters.count} + 1`, updatedAt: now },
      })
      .returning({ count: usageCounters.count })
    return rows[0]?.count ?? 1
  },

  /** Zera a contagem de uma chave (rate-limit: `resetKey`). */
  async reset(userId: UserId, metric: string, window: string): Promise<void> {
    await db
      .delete(usageCounters)
      .where(and(eq(usageCounters.userId, userId), eq(usageCounters.metric, metric), eq(usageCounters.window, window)))
  },

  /** Remove baldes de janelas antigas — sem isto a tabela cresceria sem teto. */
  async prune(metric: string, windowMenorQue: string): Promise<void> {
    await db
      .delete(usageCounters)
      .where(and(eq(usageCounters.metric, metric), lt(usageCounters.window, windowMenorQue)))
  },

  /**
   * ESTORNA uma reserva que não virou chamada (o provedor falhou depois de reservarmos).
   * Piso em zero: um estorno sem reserva correspondente não pode virar crédito.
   */
  async refund(userId: UserId, metric: string, window: string): Promise<void> {
    await db
      .update(usageCounters)
      .set({ count: sql`max(0, ${usageCounters.count} - 1)`, updatedAt: Date.now() })
      .where(and(eq(usageCounters.userId, userId), eq(usageCounters.metric, metric), eq(usageCounters.window, window)))
  },
}
