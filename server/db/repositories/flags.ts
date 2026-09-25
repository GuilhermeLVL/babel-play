/**
 * AS FLAGS NO BANCO (tabela `flags`, migração 0031) — só leitura e escrita de linha.
 * Cache, validação e avaliação moram em `server/lib/flags.ts` e `src/core/flags.ts`.
 */
import { asc, eq } from 'drizzle-orm'

import { db } from '../db'
import { flags } from '../schema'

export type LinhaDeFlag = typeof flags.$inferSelect

export const flagsRepo = {
  async listar(): Promise<LinhaDeFlag[]> {
    return db.select().from(flags).orderBy(asc(flags.chave))
  },

  async ler(chave: string): Promise<LinhaDeFlag | undefined> {
    const rows = await db.select().from(flags).where(eq(flags.chave, chave)).limit(1)
    return rows[0]
  },

  /** Cria ou substitui a linha inteira (quem chama já mesclou com a anterior). */
  async gravar(l: LinhaDeFlag): Promise<LinhaDeFlag> {
    const rows = await db
      .insert(flags)
      .values(l)
      .onConflictDoUpdate({
        target: flags.chave,
        set: {
          descricao: l.descricao,
          habilitada: l.habilitada,
          regras: l.regras,
          payload: l.payload,
          atualizadoEm: l.atualizadoEm,
          atualizadoPor: l.atualizadoPor,
        },
      })
      .returning()
    return rows[0] ?? l
  },
}
