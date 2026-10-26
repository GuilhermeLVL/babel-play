/**
 * AS ANOTAÇÕES DO LEITOR (migração 0012, L2 de Livros & Leitura) — a tabela `anotacoes_de_leitura` e nada
 * mais. O que é uma anotação válida mora em `src/core/leitura/anotacao.ts` (o mesmo módulo do cliente).
 *
 * POSSE PELA CHAVE: a chave primária é `(user_id, id)`. Um id que outra pessoa já usa não colide nem
 * sobrescreve a linha dela — vira uma linha NOVA desta pessoa. Por isso não existe caminho de IDOR:
 * toda leitura, escrita e lápide filtra pelo `user_id` do pedido, nunca pelo `id` sozinho.
 *
 * A SINCRONIZAÇÃO é "última escrita vence" por `max(atualizado_em, apagado_em)`, decidida no banco
 * (`ON CONFLICT … WHERE`), e não num "lê, compara, grava" que dois aparelhos atravessariam juntos.
 *
 * TETO: `MAX_ANOTACOES_POR_LIVRO` vivas por livro, cobrado sob a trava do usuário (como o glossário).
 */
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm'

import type { AnotacaoDeLeitura, CorDeAnotacao, TipoDeAnotacao } from '../../../src/core/leitura/anotacao'
import type { UserId } from '../../lib/authContext'
import { db, emTransacao, linhas, travarUsuario } from '../db'
import { anotacoesDeLeitura as t } from '../schema'

/** Quantas anotações VIVAS cabem num livro. Um livro inteiro grifado frase a frase tem poucos milhares. */
export const MAX_ANOTACOES_POR_LIVRO = 5_000
/** Teto de uma leitura (uma página da sincronização). */
export const MAX_POR_LEITURA = 2_000

type Linha = typeof t.$inferSelect

function paraAnotacao(l: Linha): AnotacaoDeLeitura {
  return {
    id: l.id,
    livroId: l.livroId,
    tipo: l.tipo as TipoDeAnotacao,
    alvo: {
      cfi: l.cfi,
      citacao: { exact: l.exact, prefix: l.prefixo, suffix: l.sufixo },
      ...(l.capitulo ? { capitulo: l.capitulo } : {}),
    },
    cor: l.cor as CorDeAnotacao,
    nota: l.nota,
    ...(l.palavra ? { palavra: l.palavra } : {}),
    criadoEm: l.criadoEm,
    atualizadoEm: l.atualizadoEm,
    apagadoEm: l.apagadoEm ?? null,
  }
}

export type ResultadoDoLote = { gravadas: AnotacaoDeLeitura[]; recusadas: Array<{ id: string; motivo: 'livro_cheio' }> }

export const anotacoesDeLeituraRepo = {
  /**
   * As anotações da pessoa — de um livro ou de todos —, inclusive as lápides, mudadas DEPOIS de `desde`
   * (a sincronização incremental). Ordem por `atualizado_em`, para a próxima página continuar daí.
   */
  async listar(
    userId: UserId,
    opcoes: { livroId?: string; desde?: number; limite?: number } = {},
  ): Promise<AnotacaoDeLeitura[]> {
    const filtros = [eq(t.userId, userId)]
    if (opcoes.livroId) filtros.push(eq(t.livroId, opcoes.livroId))
    if (opcoes.desde != null) {
      filtros.push(gt(sql`greatest(${t.atualizadoEm}, coalesce(${t.apagadoEm}, 0))`, opcoes.desde))
    }
    const rows = await db
      .select()
      .from(t)
      .where(and(...filtros))
      .orderBy(t.atualizadoEm, t.id)
      .limit(Math.min(opcoes.limite ?? MAX_POR_LEITURA, MAX_POR_LEITURA))
    return rows.map(paraAnotacao)
  },

  /**
   * Grava um lote (já validado). Cada anotação entra se for nova ou mais recente que a guardada; a mais
   * velha perde em silêncio e a resposta devolve a que ficou valendo. Anotação NOVA viva num livro cheio é
   * recusada (`livro_cheio`); editar ou apagar uma que já existe sempre passa.
   */
  async gravarLote(userId: UserId, lote: readonly AnotacaoDeLeitura[]): Promise<ResultadoDoLote> {
    const recusadas: ResultadoDoLote['recusadas'] = []
    await emTransacao(async (tx) => {
      await travarUsuario(tx, userId)
      const vivasPorLivro = new Map<string, number>()
      const contar = async (livroId: string) => {
        if (!vivasPorLivro.has(livroId)) {
          const [{ n }] = linhas<{ n: number | string }>(
            await tx.execute(
              sql`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ${userId} AND livro_id = ${livroId} AND apagado_em IS NULL`,
            ),
          )
          vivasPorLivro.set(livroId, Number(n))
        }
        return vivasPorLivro.get(livroId)!
      }
      for (const a of lote) {
        const existe = await tx
          .select({ id: t.id })
          .from(t)
          .where(and(eq(t.userId, userId), eq(t.id, a.id)))
          .limit(1)
        if (!existe.length && a.apagadoEm == null) {
          if ((await contar(a.livroId)) >= MAX_ANOTACOES_POR_LIVRO) {
            recusadas.push({ id: a.id, motivo: 'livro_cheio' })
            continue
          }
          vivasPorLivro.set(a.livroId, (vivasPorLivro.get(a.livroId) ?? 0) + 1)
        }
        const valores = {
          userId,
          id: a.id,
          livroId: a.livroId,
          tipo: a.tipo,
          cfi: a.alvo.cfi,
          exact: a.alvo.citacao.exact,
          prefixo: a.alvo.citacao.prefix,
          sufixo: a.alvo.citacao.suffix,
          capitulo: a.alvo.capitulo ?? null,
          cor: a.cor,
          nota: a.nota,
          palavra: a.palavra ?? null,
          criadoEm: a.criadoEm,
          atualizadoEm: a.atualizadoEm,
          apagadoEm: a.apagadoEm,
        }
        /* O livro de uma anotação não muda: `livro_id` fica fora do UPDATE (um lote não "move" a anotação
           de outro livro para cá e fura o teto por esse caminho). */
        const mutaveis = {
          tipo: valores.tipo,
          cfi: valores.cfi,
          exact: valores.exact,
          prefixo: valores.prefixo,
          sufixo: valores.sufixo,
          capitulo: valores.capitulo,
          cor: valores.cor,
          nota: valores.nota,
          palavra: valores.palavra,
          atualizadoEm: valores.atualizadoEm,
          apagadoEm: valores.apagadoEm,
        }
        await tx
          .insert(t)
          .values(valores)
          .onConflictDoUpdate({
            target: [t.userId, t.id],
            set: mutaveis,
            setWhere: sql`greatest(excluded.atualizado_em, coalesce(excluded.apagado_em, 0)) > greatest(${t.atualizadoEm}, coalesce(${t.apagadoEm}, 0))`,
          })
      }
    })
    const ids = lote.map((a) => a.id).filter((id) => !recusadas.some((r) => r.id === id))
    const gravadas = ids.length
      ? (
          await db
            .select()
            .from(t)
            .where(and(eq(t.userId, userId), inArray(t.id, ids)))
        ).map(paraAnotacao)
      : []
    return { gravadas, recusadas }
  },

  /** Lápide numa anotação DA PESSOA. `false` = não existe (ou é de outra pessoa, que dá no mesmo). */
  async apagar(userId: UserId, id: string, agora = Date.now()): Promise<boolean> {
    const r = await db
      .update(t)
      .set({ apagadoEm: agora })
      .where(and(eq(t.userId, userId), eq(t.id, id), isNull(t.apagadoEm)))
      .returning({ id: t.id })
    return r.length > 0
  },
}
