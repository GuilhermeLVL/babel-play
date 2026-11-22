/**
 * AS PALAVRAS MARCADAS SEM CARTÃO ("Já sei" e "Ignorar"; tabela `palavras_marcadas`, migração PG 0027). Listar,
 * marcar e desmarcar, sempre pelo DONO. A regra (precedência, contagem, marcos) é do núcleo:
 * `src/core/vocabulario/marcadas.ts`.
 *
 * O TETO (`TETO_DE_MARCADAS`) é cobrado DENTRO do INSERT, numa transação que começa pela trava do usuário — o mesmo
 * desenho do glossário (`glossario.ts`): dois pedidos simultâneos não passam juntos pelo `COUNT(*) < teto`. Trocar o
 * estado de uma palavra já marcada não conta de novo.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import type { EstadoDaMarcacao, PalavraMarcada } from '../../../src/core/vocabulario/marcadas'
import type { UserId } from '../../lib/authContext'
import { db, emTransacao, linhas as linhasDe, linhasAfetadas, travarUsuario } from '../db'
import { palavrasMarcadas, vocabCards } from '../schema'

const COLUNAS = {
  lang: palavrasMarcadas.lang,
  chave: palavrasMarcadas.chave,
  estado: palavrasMarcadas.estado,
  atualizadoEm: palavrasMarcadas.atualizadoEm,
}

export type ResultadoDaMarcacao = { ok: true; marcada: PalavraMarcada } | { ok: false; motivo: 'cheio' }

export type ResultadoDoLote =
  | { ok: true; criadas: string[]; jaConhecidas: number; ignoradas: number; comCartao: number }
  | { ok: false; motivo: 'cheio' }

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

  /**
   * Marca VÁRIAS chaves de um idioma como `conhecida`, numa transação só (o teste rápido de vocabulário). Mesma
   * trava do `marcar` (`travarUsuario`) e mesmo teto, mas atômico: se as chaves NOVAS não cabem, nada é gravado
   * (`cheio`). A precedência vale em lote: quem já tem CARTÃO (não apagado) fica de fora, quem já está `ignorada` não
   * é sobrescrito e quem já é `conhecida` não conta de novo. `chaves` já vêm reduzidas e sem repetição.
   */
  async marcarEmLote(
    userId: UserId,
    lang: string,
    chaves: readonly string[],
    teto: number,
    agora = Date.now(),
  ): Promise<ResultadoDoLote> {
    if (!chaves.length) return { ok: true, criadas: [], jaConhecidas: 0, ignoradas: 0, comCartao: 0 }
    return emTransacao(async (tx) => {
      await travarUsuario(tx, userId)
      const existentes = await tx
        .select({ chave: palavrasMarcadas.chave, estado: palavrasMarcadas.estado })
        .from(palavrasMarcadas)
        .where(
          and(
            eq(palavrasMarcadas.userId, userId),
            eq(palavrasMarcadas.lang, lang),
            inArray(palavrasMarcadas.chave, [...chaves]),
          ),
        )
      const estadoDe = new Map(existentes.map((e) => [e.chave, e.estado]))
      const comCartaoRows = await tx
        .select({ normKey: vocabCards.normKey })
        .from(vocabCards)
        .where(
          and(
            eq(vocabCards.userId, userId),
            inArray(
              vocabCards.normKey,
              chaves.map((c) => `${lang}|${c}`),
            ),
            isNull(vocabCards.deletedAt),
          ),
        )
      const cartoes = new Set(comCartaoRows.map((r) => r.normKey))
      let jaConhecidas = 0
      let ignoradas = 0
      let comCartao = 0
      const novas: string[] = []
      for (const c of chaves) {
        if (cartoes.has(`${lang}|${c}`)) comCartao++
        else if (estadoDe.get(c) === 'ignorada') ignoradas++
        else if (estadoDe.get(c) === 'conhecida') jaConhecidas++
        else novas.push(c)
      }
      if (novas.length) {
        const [contagem] = linhasDe<{ n: number }>(
          await tx.execute(sql`SELECT COUNT(*)::int AS n FROM ${palavrasMarcadas} WHERE user_id = ${userId}`),
        )
        const n = contagem?.n ?? 0
        if (Number(n) + novas.length > teto) return { ok: false as const, motivo: 'cheio' as const }
        await tx
          .insert(palavrasMarcadas)
          .values(novas.map((chave) => ({ userId, lang, chave, estado: 'conhecida', atualizadoEm: agora })))
          .onConflictDoNothing()
      }
      return { ok: true as const, criadas: novas, jaConhecidas, ignoradas, comCartao }
    })
  },

  /** Desfaz um lote: apaga só as chaves que estão `conhecida` (nunca uma `ignorada`). Devolve as apagadas. */
  async desfazerLote(userId: UserId, lang: string, chaves: readonly string[]): Promise<string[]> {
    if (!chaves.length) return []
    const rows = await db
      .delete(palavrasMarcadas)
      .where(
        and(
          eq(palavrasMarcadas.userId, userId),
          eq(palavrasMarcadas.lang, lang),
          eq(palavrasMarcadas.estado, 'conhecida'),
          inArray(palavrasMarcadas.chave, [...chaves]),
        ),
      )
      .returning({ chave: palavrasMarcadas.chave })
    return rows.map((r) => r.chave)
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
