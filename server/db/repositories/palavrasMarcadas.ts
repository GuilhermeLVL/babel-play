/**
 * AS PALAVRAS MARCADAS SEM CARTÃO ("Já sei" e "Ignorar"; tabela `palavras_marcadas`, migração PG 0027). Listar,
 * marcar e desmarcar, sempre pelo DONO. A regra (precedência, contagem, marcos) é do núcleo:
 * `src/core/vocabulario/marcadas.ts`.
 *
 * O TETO (`TETO_DE_MARCADAS`) é cobrado DENTRO do INSERT, numa transação que começa pela trava do usuário — o mesmo
 * desenho do glossário (`glossario.ts`): dois pedidos simultâneos não passam juntos pelo `COUNT(*) < teto`. Trocar o
 * estado de uma palavra já marcada não conta de novo.
 */
import { and, desc, eq, sql } from 'drizzle-orm'

import type { EstadoDaMarcacao, PalavraMarcada } from '../../../src/core/vocabulario/marcadas'
import type { UserId } from '../../lib/authContext'
import { db, emTransacao, linhasAfetadas, travarUsuario } from '../db'
import { palavrasMarcadas } from '../schema'

const COLUNAS = {
  lang: palavrasMarcadas.lang,
  chave: palavrasMarcadas.chave,
  estado: palavrasMarcadas.estado,
  atualizadoEm: palavrasMarcadas.atualizadoEm,
}

export type ResultadoDaMarcacao = { ok: true; marcada: PalavraMarcada } | { ok: false; motivo: 'cheio' }

export const palavrasMarcadasRepo = {
  /** As marcações do dono (de um idioma base, ou de todos), da mais recente para a mais antiga, até `limite`. */
  async listar(userId: UserId, lang: string | undefined, limite: number): Promise<PalavraMarcada[]> {
    const onde = lang
      ? and(eq(palavrasMarcadas.userId, userId), eq(palavrasMarcadas.lang, lang))
      : eq(palavrasMarcadas.userId, userId)
    const rows = await db
      .select(COLUNAS)
      .from(palavrasMarcadas)
      .where(onde)
      .orderBy(desc(palavrasMarcadas.atualizadoEm), palavrasMarcadas.chave)
      .limit(limite)
    return rows.map((r) => ({ ...r, estado: r.estado as EstadoDaMarcacao, atualizadoEm: Number(r.atualizadoEm) }))
  },

  /** Marca (upsert). Chave nova com a conta no teto: `{ ok: false, motivo: 'cheio' }`. */
  async marcar(
    userId: UserId,
    m: { lang: string; chave: string; estado: EstadoDaMarcacao },
    teto: number,
    agora = Date.now(),
  ): Promise<ResultadoDaMarcacao> {
    const gravou = await emTransacao(async (tx) => {
      await travarUsuario(tx, userId)
      const r = await tx.execute(sql`
        INSERT INTO ${palavrasMarcadas} (user_id, lang, chave, estado, atualizado_em)
        SELECT ${userId}, ${m.lang}, ${m.chave}, ${m.estado}, ${agora}
        WHERE EXISTS (
          SELECT 1 FROM ${palavrasMarcadas} WHERE user_id = ${userId} AND lang = ${m.lang} AND chave = ${m.chave}
        ) OR (SELECT COUNT(*) FROM ${palavrasMarcadas} WHERE user_id = ${userId}) < ${teto}
        ON CONFLICT (user_id, lang, chave) DO UPDATE SET
          estado = excluded.estado, atualizado_em = excluded.atualizado_em
      `)
      return linhasAfetadas(r) > 0
    })
    if (!gravou) return { ok: false, motivo: 'cheio' }
    return { ok: true, marcada: { lang: m.lang, chave: m.chave, estado: m.estado, atualizadoEm: agora } }
  },

  /** Desmarca. `false` quando não havia marcação (a rota responde 204 do mesmo jeito: desmarcar é idempotente). */
  async desmarcar(userId: UserId, lang: string, chave: string): Promise<boolean> {
    const r = await db
      .delete(palavrasMarcadas)
      .where(
        and(eq(palavrasMarcadas.userId, userId), eq(palavrasMarcadas.lang, lang), eq(palavrasMarcadas.chave, chave)),
      )
    return linhasAfetadas(r) > 0
  },
}
