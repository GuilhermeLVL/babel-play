import { randomUUID } from 'node:crypto'
import { and, eq, isNull, like, sql, sum } from 'drizzle-orm'
import { db } from '../db'
import { presencas, seedCredits } from '../schema'
import type { UserId } from '../../lib/authContext'

/**
 * ECONOMIA v2 — créditos de seeds/XP e presença diária (a metade servidor do A7).
 *
 * As duas operações seguem o `seedSpendsRepo.debitar` linha a linha: INSERT com
 * ON CONFLICT no índice parcial (a unicidade vale só entre linhas vivas, e o SQLite
 * exige repetir o predicado no alvo), `jaExistia` deduzido de `rowsAffected`, e os
 * totais SEMPRE filtrando `deletedAt` para as duas consultas concordarem sobre o que
 * existe (P2-N2).
 */
export const economiaRepo = {
  /** Credita — UMA vez por `creditoId`. Reenvio devolve os totais sem somar de novo. */
  async creditar(
    userId: UserId,
    input: { creditoId: string; amount: number; xp: number; reason: string },
  ): Promise<{ jaExistia: boolean }> {
    const now = Date.now()
    const row = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      userId,
      creditoId: input.creditoId,
      /* Piso em zero: um amount negativo seria um débito pela porta dos fundos. */
      amount: Math.max(0, Math.round(input.amount)),
      xp: Math.max(0, Math.round(input.xp)),
      reason: input.reason,
    }
    const r = await db.run(sql`
      INSERT INTO ${seedCredits} (id, created_at, updated_at, user_id, credito_id, amount, xp, reason)
      VALUES (${row.id}, ${row.createdAt}, ${row.updatedAt}, ${row.userId}, ${row.creditoId}, ${row.amount}, ${row.xp}, ${row.reason})
      ON CONFLICT (user_id, credito_id) WHERE deleted_at IS NULL DO NOTHING
    `)
    return { jaExistia: Number((r as { rowsAffected?: number }).rowsAffected ?? 0) === 0 }
  },

  /** Totais creditados — o que `computeProfile` soma ao ganho derivado. */
  async totaisCreditados(userId: UserId): Promise<{ seedsCreditadas: number; xpCreditado: number }> {
    const r = await db
      .select({ seeds: sum(seedCredits.amount), xp: sum(seedCredits.xp) })
      .from(seedCredits)
      .where(and(eq(seedCredits.userId, userId), isNull(seedCredits.deletedAt)))
    return { seedsCreditadas: Number(r[0]?.seeds ?? 0), xpCreditado: Number(r[0]?.xp ?? 0) }
  },

  /** Marca o dia como presente — UMA linha por (usuário, dia local). */
  /**
   * AS CONQUISTAS QUE O SERVIDOR RECONHECE — derivadas de `seed_credits`, nao do navegador.
   *
   * A posse de conquista morava so em `localStorage['babel.conquistas']`, editavel por quem
   * quisesse, e nunca era reconciliada com o razao (auditoria de 2026-09-07, achado A12). O
   * credito ja e gravado com `reason = 'conquista:<id>'` desde a economia v2: a informacao existe
   * no banco e faltava alguem perguntar por ela.
   */
  async conquistasCreditadas(userId: UserId): Promise<string[]> {
    const rows = await db
      .select({ reason: seedCredits.reason })
      .from(seedCredits)
      .where(and(eq(seedCredits.userId, userId), like(seedCredits.reason, 'conquista:%')))
    return [...new Set(rows.map((r) => (r.reason ?? '').slice('conquista:'.length)).filter(Boolean))]
  },

  async registrarPresenca(userId: UserId, dia: number): Promise<{ jaExistia: boolean }> {
    const now = Date.now()
    const r = await db.run(sql`
      INSERT INTO ${presencas} (id, created_at, updated_at, user_id, dia)
      VALUES (${randomUUID()}, ${now}, ${now}, ${userId}, ${dia})
      ON CONFLICT (user_id, dia) WHERE deleted_at IS NULL DO NOTHING
    `)
    return { jaExistia: Number((r as { rowsAffected?: number }).rowsAffected ?? 0) === 0 }
  },

  /** Todos os dias de presença vivos — entrada de `sequencias`/`marcosDeSequencia`. */
  async diasDePresenca(userId: UserId): Promise<number[]> {
    const rows = await db
      .select({ dia: presencas.dia })
      .from(presencas)
      .where(and(eq(presencas.userId, userId), isNull(presencas.deletedAt)))
    return rows.map((x) => x.dia)
  },
}
