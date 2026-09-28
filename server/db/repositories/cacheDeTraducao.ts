/**
 * O NÍVEL 2 DO CACHE DE TRADUÇÃO (migração 0038) — a tabela `cache_de_traducao` e nada mais. A
 * política (o que entra, a chave, o TTL, o teto) mora em `server/ai/cacheDeTraducao.ts`; aqui só
 * há ler, gravar, contar acerto e podar.
 *
 * CROSS-TENANT DE PROPÓSITO, e é o único motivo de não haver `userId` em nenhuma assinatura: a
 * linha não é de ninguém (ver o comentário da tabela em `schema.ts`).
 */
import { and, eq, gt, lt, sql } from 'drizzle-orm'

import { db } from '../db'
import { cacheDeTraducaoPersistente as tabela } from '../schema'

const afetadas = (r: unknown) => Number((r as { rowsAffected?: number }).rowsAffected ?? 0)

export interface LinhaDoCacheDeTraducao {
  chave: string
  origem: string
  destino: string
  modelo: string
  versaoPrompt: string
  traducao: string
  criadoEm: number
  usadoEm: number
}

export const cacheDeTraducaoRepo = {
  /** A tradução guardada, se criada DEPOIS de `criadaDepoisDe` (o TTL conta da criação). */
  async ler(chave: string, criadaDepoisDe: number): Promise<{ traducao: string; modelo: string } | null> {
    const rows = await db
      .select({ traducao: tabela.traducao, modelo: tabela.modelo })
      .from(tabela)
      .where(and(eq(tabela.chave, chave), gt(tabela.criadoEm, criadaDepoisDe)))
      .limit(1)
    return rows[0] ?? null
  },

  /** Grava (ou regrava, recomeçando o TTL) a tradução da chave. */
  async gravar(l: LinhaDoCacheDeTraducao): Promise<void> {
    await db
      .insert(tabela)
      .values({ ...l, acertos: 0 })
      .onConflictDoUpdate({
        target: tabela.chave,
        set: {
          traducao: l.traducao,
          modelo: l.modelo,
          criadoEm: l.criadoEm,
          usadoEm: l.usadoEm,
          acertos: 0,
        },
      })
  },

  /** Um acerto: `usado_em` decide quem sai primeiro quando a tabela passa do teto. */
  async marcarAcerto(chave: string, agora: number): Promise<void> {
    await db
      .update(tabela)
      .set({ usadoEm: agora, acertos: sql`${tabela.acertos} + 1` })
      .where(eq(tabela.chave, chave))
  },

  /** Apaga o criado antes de `antesDe`. Devolve quantas linhas saíram. */
  async apagarVencidas(antesDe: number): Promise<number> {
    return afetadas(await db.delete(tabela).where(lt(tabela.criadoEm, antesDe)))
  },

  /** Acima de `maxLinhas`, apaga as MENOS usadas recentemente. Devolve quantas saíram. */
  async apagarExcedentes(maxLinhas: number): Promise<number> {
    const r = await db.run(sql`
      DELETE FROM cache_de_traducao WHERE chave IN (
        SELECT chave FROM cache_de_traducao ORDER BY usado_em DESC LIMIT -1 OFFSET ${maxLinhas}
      )
    `)
    return afetadas(r)
  },

  /** Só para testes (`esvaziarCacheDeTraducao`). */
  async esvaziar(): Promise<void> {
    await db.delete(tabela)
  },
}
