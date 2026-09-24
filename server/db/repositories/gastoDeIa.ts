/**
 * O GASTO DE IA DO MÊS (tabela `gasto_de_ia`, migração 0029) — só aritmética atômica no banco.
 * A política (teto, alerta, preços) mora em `server/lib/orcamentoDeIa.ts`.
 */
import { and, eq, isNull, sql } from 'drizzle-orm'

import { db } from '../db'
import { gastoDeIa } from '../schema'

export interface GastoDoMes {
  mes: string
  microUsd: number
  chamadas: number
  alerta80Em: number | null
  esgotadoEm: number | null
}

export const gastoDeIaRepo = {
  /**
   * Soma `microUsd` ao mês e devolve o TOTAL já atualizado, numa instrução só (`RETURNING`) — ler e
   * depois somar daria total errado com chamadas simultâneas, e é o total que decide o alerta.
   */
  async somar(mes: string, microUsd: number): Promise<number> {
    const agora = Date.now()
    const valor = Math.max(0, Math.round(microUsd))
    const rows = await db
      .insert(gastoDeIa)
      .values({ mes, microUsd: valor, chamadas: 1, atualizadoEm: agora })
      .onConflictDoUpdate({
        target: gastoDeIa.mes,
        set: {
          microUsd: sql`${gastoDeIa.microUsd} + ${valor}`,
          chamadas: sql`${gastoDeIa.chamadas} + 1`,
          atualizadoEm: agora,
        },
      })
      .returning({ microUsd: gastoDeIa.microUsd })
    return rows[0]?.microUsd ?? valor
  },

  async ler(mes: string): Promise<GastoDoMes | null> {
    const rows = await db.select().from(gastoDeIa).where(eq(gastoDeIa.mes, mes)).limit(1)
    const r = rows[0]
    return r
      ? { mes: r.mes, microUsd: r.microUsd, chamadas: r.chamadas, alerta80Em: r.alerta80Em, esgotadoEm: r.esgotadoEm }
      : null
  },

  /** Marca o alerta de 80%. `true` só para QUEM marcou primeiro — é o que faz o alerta sair uma vez. */
  async marcarAlerta80(mes: string): Promise<boolean> {
    const r = await db
      .update(gastoDeIa)
      .set({ alerta80Em: Date.now() })
      .where(and(eq(gastoDeIa.mes, mes), isNull(gastoDeIa.alerta80Em)))
    return r.rowsAffected > 0
  },

  /** Marca o esgotamento (100%). Mesma regra: `true` uma vez por mês. */
  async marcarEsgotado(mes: string): Promise<boolean> {
    const r = await db
      .update(gastoDeIa)
      .set({ esgotadoEm: Date.now() })
      .where(and(eq(gastoDeIa.mes, mes), isNull(gastoDeIa.esgotadoEm)))
    return r.rowsAffected > 0
  },

  /** Só para testes e para o operador recomeçar um mês de ensaio. */
  async zerar(mes: string): Promise<void> {
    await db.delete(gastoDeIa).where(eq(gastoDeIa.mes, mes))
  },
}
