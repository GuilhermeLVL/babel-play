/**
 * O GLOSSÁRIO PESSOAL (migração 0042, D3 da Fase D) — a tabela `glossario` e nada mais. A política (o
 * que é uma entrada válida, quais vão a um pedido, o saneamento contra injeção) mora em
 * `server/ai/glossario.ts`; aqui só há listar, gravar e apagar, sempre pelo DONO.
 *
 * O TETO DE 500 é cobrado DENTRO do INSERT (`INSERT … SELECT … WHERE (SELECT COUNT(*) …) < 500`): o
 * SQLite serializa as escritas, então dois pedidos simultâneos não passam juntos pelo teto, como
 * passariam num "conta, depois grava" em dois comandos.
 */
import { randomUUID } from 'node:crypto'

import { and, desc, eq, sql } from 'drizzle-orm'

import type { UserId } from '../../lib/authContext'
import { db } from '../db'
import { glossario } from '../schema'

const afetadas = (r: unknown) => Number((r as { rowsAffected?: number }).rowsAffected ?? 0)

export interface EntradaDoGlossario {
  id: string
  origem: string
  destino: string
  termo: string
  termoNorm: string
  traducao: string
  criadoEm: number
  atualizadoEm: number
}

export interface NovaEntrada {
  origem: string
  destino: string
  termo: string
  termoNorm: string
  traducao: string
}

export type ResultadoDaGravacao =
  | { ok: true; entrada: EntradaDoGlossario; nova: boolean }
  | { ok: false; motivo: 'cheio' }

const COLUNAS = {
  id: glossario.id,
  origem: glossario.origem,
  destino: glossario.destino,
  termo: glossario.termo,
  termoNorm: glossario.termoNorm,
  traducao: glossario.traducao,
  criadoEm: glossario.criadoEm,
  atualizadoEm: glossario.atualizadoEm,
}

async function acharPelaChave(userId: UserId, e: NovaEntrada): Promise<EntradaDoGlossario | null> {
  const rows = await db
    .select(COLUNAS)
    .from(glossario)
    .where(
      and(
        eq(glossario.userId, userId),
        eq(glossario.origem, e.origem),
        eq(glossario.destino, e.destino),
        eq(glossario.termoNorm, e.termoNorm),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

export const glossarioRepo = {
  /** As entradas do dono, da mais recente para a mais antiga (no máximo `limite`). */
  async listar(userId: UserId, limite: number): Promise<EntradaDoGlossario[]> {
    return db
      .select(COLUNAS)
      .from(glossario)
      .where(eq(glossario.userId, userId))
      .orderBy(desc(glossario.atualizadoEm))
      .limit(limite)
  },

  /**
   * Grava a entrada. O mesmo termo (normalizado) no mesmo par é a MESMA entrada: a tradução é trocada
   * e o teto não conta de novo. Termo novo com o glossário cheio: `{ ok: false, motivo: 'cheio' }`.
   */
  async gravar(userId: UserId, e: NovaEntrada, teto: number, agora = Date.now()): Promise<ResultadoDaGravacao> {
    const atualizada = await db
      .update(glossario)
      .set({ termo: e.termo, traducao: e.traducao, atualizadoEm: agora })
      .where(
        and(
          eq(glossario.userId, userId),
          eq(glossario.origem, e.origem),
          eq(glossario.destino, e.destino),
          eq(glossario.termoNorm, e.termoNorm),
        ),
      )
    if (afetadas(atualizada) === 0) {
      const id = randomUUID()
      const inserida = await db.run(sql`
        INSERT INTO ${glossario} (id, user_id, origem, destino, termo, termo_norm, traducao, criado_em, atualizado_em)
        SELECT ${id}, ${userId}, ${e.origem}, ${e.destino}, ${e.termo}, ${e.termoNorm}, ${e.traducao}, ${agora}, ${agora}
        WHERE (SELECT COUNT(*) FROM ${glossario} WHERE user_id = ${userId}) < ${teto}
        ON CONFLICT (user_id, origem, destino, termo_norm) DO UPDATE SET
          termo = excluded.termo, traducao = excluded.traducao, atualizado_em = excluded.atualizado_em
      `)
      if (afetadas(inserida) === 0) return { ok: false, motivo: 'cheio' }
      const entrada = await acharPelaChave(userId, e)
      if (entrada) return { ok: true, entrada, nova: entrada.id === id }
      return { ok: false, motivo: 'cheio' }
    }
    const entrada = await acharPelaChave(userId, e)
    return entrada ? { ok: true, entrada, nova: false } : { ok: false, motivo: 'cheio' }
  },

  /** Apaga a entrada do dono. `false` quando ela não existe ou é de outra pessoa (a rota diz 404). */
  async apagar(userId: UserId, id: string): Promise<boolean> {
    const r = await db.delete(glossario).where(and(eq(glossario.userId, userId), eq(glossario.id, id)))
    return afetadas(r) > 0
  },

  /** Quantas entradas o dono tem — para a tela dizer "x de 500". */
  async contar(userId: UserId): Promise<number> {
    const rows = await db
      .select({ n: sql<number>`count(*)` })
      .from(glossario)
      .where(eq(glossario.userId, userId))
    return Number(rows[0]?.n ?? 0)
  },
}
