/**
 * O ESTADO DA CONTA QUE SÓ O SERVIDOR ESCREVE (migração 0037): o fuso gravado e o aviso do
 * reembolso. As duas escritas decidem DENTRO do comando (`ON CONFLICT … DO UPDATE … WHERE`), então
 * dois pedidos simultâneos não trocam o fuso duas vezes nem entregam o aviso duas vezes.
 */
import { eq, sql } from 'drizzle-orm'

import type { UserId } from '../../lib/authContext'
import { db } from '../db'
import { estadoDaConta } from '../schema'

const afetadas = (r: unknown) => Number((r as { rowsAffected?: number }).rowsAffected ?? 0)

export const estadoDaContaRepo = {
  /** O fuso gravado (ou nada): `decidirFuso` decide o que vale. */
  async fusoGravado(userId: UserId): Promise<{ fuso: string | null; desde: number | null }> {
    const rows = await db
      .select({ fuso: estadoDaConta.fuso, desde: estadoDaConta.fusoDesde })
      .from(estadoDaConta)
      .where(eq(estadoDaConta.userId, userId))
      .limit(1)
    return { fuso: rows[0]?.fuso ?? null, desde: rows[0]?.desde ?? null }
  },

  /** Grava o fuso — só se não havia fuso ou se a carência já venceu. `true` se gravou. */
  async gravarFuso(userId: UserId, fuso: string, desde: number, carenciaMs: number): Promise<boolean> {
    const r = await db.run(sql`
      INSERT INTO ${estadoDaConta} (user_id, fuso, fuso_desde, atualizado_em)
      VALUES (${userId}, ${fuso}, ${desde}, ${desde})
      ON CONFLICT (user_id) DO UPDATE SET fuso = excluded.fuso, fuso_desde = excluded.fuso_desde,
        atualizado_em = excluded.atualizado_em
      WHERE estado_da_conta.fuso IS NULL OR estado_da_conta.fuso_desde IS NULL
        OR estado_da_conta.fuso_desde <= ${desde - carenciaMs}
    `)
    return afetadas(r) > 0
  },

  /** Marca o aviso do reembolso como entregue — UMA vez por conta. `true` só para quem marcou. */
  async marcarAvisoDeReembolso(userId: UserId, agora: number): Promise<boolean> {
    const r = await db.run(sql`
      INSERT INTO ${estadoDaConta} (user_id, aviso_reembolso_em, atualizado_em)
      VALUES (${userId}, ${agora}, ${agora})
      ON CONFLICT (user_id) DO UPDATE SET aviso_reembolso_em = excluded.aviso_reembolso_em,
        atualizado_em = excluded.atualizado_em
      WHERE estado_da_conta.aviso_reembolso_em IS NULL
    `)
    return afetadas(r) > 0
  },
}
