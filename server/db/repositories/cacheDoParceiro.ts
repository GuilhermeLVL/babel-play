/**
 * O CACHE DO PARCEIRO DE LEITURA (migração 0014) — a tabela `cache_do_parceiro` e nada mais. A política (o que entra,
 * a chave, o TTL, o teto) mora em `server/ai/leitura/cacheDoParceiro.ts`.
 *
 * CROSS-TENANT DE PROPÓSITO: a linha não é de ninguém (ver o comentário da tabela em `schema.ts`).
 */
import { and, eq, gt, lt, sql } from 'drizzle-orm'

import { db, linhasAfetadas } from '../db'
import { cacheDoParceiro as tabela } from '../schema'

export interface LinhaDoCacheDoParceiro {
  chave: string
  livroId: string
  modo: string
  modelo: string
  versaoPrompt: string
  resposta: string
  criadoEm: number
  usadoEm: number
}

export const cacheDoParceiroRepo = {
  /** A resposta guardada, se criada DEPOIS de `criadaDepoisDe` (o TTL conta da criação). */
  async ler(chave: string, criadaDepoisDe: number): Promise<{ resposta: string; modelo: string } | null> {
    const rows = await db
      .select({ resposta: tabela.resposta, modelo: tabela.modelo })
      .from(tabela)
      .where(and(eq(tabela.chave, chave), gt(tabela.criadoEm, criadaDepoisDe)))
      .limit(1)
    return rows[0] ?? null
  },

  /** Grava (ou regrava, recomeçando o TTL). */
  async gravar(l: LinhaDoCacheDoParceiro): Promise<void> {
    await db
      .insert(tabela)
      .values({ ...l, acertos: 0 })
      .onConflictDoUpdate({
        target: tabela.chave,
        set: { resposta: l.resposta, modelo: l.modelo, criadoEm: l.criadoEm, usadoEm: l.usadoEm, acertos: 0 },
      })
  },

  async marcarAcerto(chave: string, agora: number): Promise<void> {
    await db
      .update(tabela)
      .set({ usadoEm: agora, acertos: sql`${tabela.acertos} + 1` })
      .where(eq(tabela.chave, chave))
  },

  async apagarVencidas(antesDe: number): Promise<number> {
    return linhasAfetadas(await db.delete(tabela).where(lt(tabela.criadoEm, antesDe)))
  },

  /** Acima de `maxLinhas`, apaga as MENOS usadas recentemente. */
  async apagarExcedentes(maxLinhas: number): Promise<number> {
    return linhasAfetadas(
      await db.execute(sql`
        DELETE FROM cache_do_parceiro WHERE chave IN (
          SELECT chave FROM cache_do_parceiro ORDER BY usado_em DESC OFFSET ${maxLinhas}
        )
      `),
    )
  },
}
