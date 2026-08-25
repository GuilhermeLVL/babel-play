import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull, sql, sum } from 'drizzle-orm'
import { db } from '../db'
import { seedSpends } from '../schema'
import type { UserId } from '../../lib/authContext'

export type SeedSpend = typeof seedSpends.$inferSelect

export interface NewSeedSpend {
  /** Gerado pelo CLIENTE antes de enviar. É a chave da idempotência. */
  spendId: string
  amount: number
  reason: string
  ref?: string
}

/**
 * GASTOS DE SEEDS. A metade que faltava para a moeda existir — ver o comentário de `seed_spends`
 * em `schema.ts` para o porquê de o ganho poder ser derivado e o gasto não.
 */
export const seedSpendsRepo = {
  /**
   * Debita — UMA vez por `spendId`.
   *
   * O duplo-clique é o caso comum, não o exótico: o botão que gasta fica numa tela de fim de
   * rodada, onde a pessoa está clicando rápido. Sem idempotência, o segundo clique cobraria de
   * novo por uma coisa que já foi entregue. Consulta antes de inserir em vez de depender do erro
   * de UNIQUE: assim o reenvio devolve 200 com a linha original, e quem chamou não precisa
   * distinguir "já debitei" de "falhou".
   */
  async debitar(userId: UserId, input: NewSeedSpend): Promise<{ linha: SeedSpend; jaExistia: boolean }> {
    // Idempotência POR usuário: a mesma (userId, spendId) é o mesmo débito, não uma segunda
    // cobrança. O INSERT é a própria checagem — `uq_seed_spends_user_spend` (migração 0005)
    // arbitra quem venceu. Antes era select-then-insert contra um unique GLOBAL de spend_id,
    // então dois cliques simultâneos podiam cobrar duas vezes e, pior, o id do usuário A
    // barrava o gasto de B (auditoria P1-5).
    const now = Date.now()
    const row: typeof seedSpends.$inferInsert = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      userId,
      spendId: input.spendId,
      /* Piso em zero e inteiro: um `amount` negativo viraria um ganho pela porta dos fundos, e a
         única forma de ganhar seeds é fazendo o trabalho. */
      amount: Math.max(0, Math.round(input.amount)),
      reason: input.reason,
      ref: input.ref ?? null,
    }
    // SQL cru aqui de propósito. `uq_seed_spends_user_spend` é um índice PARCIAL (só linhas
    // vivas) e o SQLite exige que o alvo do ON CONFLICT repita o predicado. O builder do
    // drizzle 0.45 emite `... do nothing where …`, com o predicado DEPOIS do `do nothing` —
    // SQL inválido. Uma instrução, mesma atomicidade, alvo correto.
    const r = await db.run(sql`
      INSERT INTO ${seedSpends} (id, created_at, updated_at, user_id, spend_id, amount, reason, ref)
      VALUES (${row.id}, ${row.createdAt}, ${row.updatedAt}, ${row.userId}, ${row.spendId}, ${row.amount}, ${row.reason}, ${row.ref})
      ON CONFLICT (user_id, spend_id) WHERE deleted_at IS NULL DO NOTHING
    `)

    // 0 linhas afetadas = já existia (viva): devolve a original, sem cobrar de novo.
    const jaExistia = Number((r as { rowsAffected?: number }).rowsAffected ?? 0) === 0
    // P2-N2: este SELECT não filtrava `deletedAt` enquanto `totalGasto()` filtrava. Um gasto
    // soft-deletado devolvia `jaExistia: true` (não cobrava de novo) E não contava no saldo —
    // ou seja, a compra saía de graça. As duas queries precisam concordar sobre o que existe.
    const rows = await db
      .select()
      .from(seedSpends)
      .where(and(eq(seedSpends.spendId, input.spendId), eq(seedSpends.userId, userId), isNull(seedSpends.deletedAt)))
      .limit(1)
    if (!rows[0]) throw new Error('falha ao gravar gasto de seeds')
    return { linha: rows[0], jaExistia }
  },

  /** O total gasto. É o que `deriveProgress` subtrai do ganho para chegar ao saldo. */
  async totalGasto(userId: UserId): Promise<number> {
    const r = await db
      .select({ total: sum(seedSpends.amount) })
      .from(seedSpends)
      .where(and(eq(seedSpends.userId, userId), isNull(seedSpends.deletedAt)))
    return Number(r[0]?.total ?? 0)
  },

  async listar(userId: UserId, limite = 50): Promise<SeedSpend[]> {
    return db
      .select()
      .from(seedSpends)
      .where(and(eq(seedSpends.userId, userId), isNull(seedSpends.deletedAt)))
      .orderBy(desc(seedSpends.createdAt))
      .limit(limite)
  },
}
