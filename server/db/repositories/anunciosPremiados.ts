/**
 * AS EXIBIÇÕES DO ANÚNCIO PREMIADO NO BANCO (tabela `anuncios_premiados`, migração 0006). Só SQL: quem decide
 * política, recompensa e resposta é `server/routes/anuncios.ts`.
 *
 * A CONCLUSÃO É UMA TRANSAÇÃO com a trava do usuário e, depois dela, uma trava global (`g:anuncios-premiados`):
 * em READ COMMITTED duas conclusões em voo passariam as duas pela contagem do teto (uma não vê a outra antes
 * do COMMIT). Com as travas, a contagem e o `UPDATE ... WHERE concluido_em IS NULL` são vistos em série, e a
 * mesma exibição nunca é concluída duas vezes. A trava global serializa só as conclusões — no máximo o teto
 * global por dia (2.000), uma escrita curta cada.
 */
import { sql } from 'drizzle-orm'

import type { UserId } from '../../lib/authContext'
import { db, emTransacao, linhas, linhasAfetadas, travarGlobal, travarUsuario } from '../db'

const DIA_MS = 86_400_000

export type ResultadoDaConclusao =
  | { tipo: 'creditada'; espaco: string; concluidoEm: number }
  | { tipo: 'ja-creditada'; espaco: string; concluidoEm: number }
  | { tipo: 'desconhecida' }
  | { tipo: 'expirada' }
  | { tipo: 'teto' }

export interface TetosDaConclusao {
  /** A exibição credita só se for concluída antes de `iniciado_em + prazoMs`. */
  prazoMs: number
  limitePorPessoa: number
  tetoGlobal: number
}

/** `AAAA-MM-DD` UTC. */
export const diaUtc = (agora: number): string => new Date(agora).toISOString().slice(0, 10)

/** O primeiro dia (UTC) do mês ANTERIOR ao de `agora`, `AAAA-MM-01`. */
function inicioDoMesAnterior(agora: number): string {
  const d = new Date(agora)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
}

export const anunciosPremiadosRepo = {
  /** As exibições CONCLUÍDAS no dia UTC: as da pessoa e as de todas as contas. */
  async concluidasNoDia(userId: UserId, dia: string): Promise<{ daPessoa: number; global: number }> {
    const r = linhas<{ pessoa: number; total: number }>(
      await db.execute(sql`
        SELECT count(*) FILTER (WHERE user_id = ${userId})::int AS pessoa, count(*)::int AS total
        FROM anuncios_premiados WHERE dia = ${dia} AND concluido_em IS NOT NULL`),
    )
    return { daPessoa: Number(r[0]?.pessoa ?? 0), global: Number(r[0]?.total ?? 0) }
  },

  async iniciar(userId: UserId, exibicaoId: string, espaco: string, agora: number): Promise<void> {
    await db.execute(sql`
      INSERT INTO anuncios_premiados (user_id, exibicao_id, espaco, dia, iniciado_em, concluido_em)
      VALUES (${userId}, ${exibicaoId}, ${espaco}, NULL, ${agora}, NULL)`)
  },

  /**
   * CONCLUI a exibição, uma vez só: a linha tem de ser desta conta, pendente, dentro do prazo, e os tetos do dia
   * (contados nas concluídas por `dia`) têm de caber. Concluída antes → `ja-creditada` (quem chama não credita
   * de novo, ou reaplica um crédito idempotente).
   */
  async concluir(
    userId: UserId,
    exibicaoId: string,
    agora: number,
    tetos: TetosDaConclusao,
  ): Promise<ResultadoDaConclusao> {
    const dia = diaUtc(agora)
    return emTransacao(async (tx) => {
      await travarUsuario(tx, userId)
      await travarGlobal(tx, 'anuncios-premiados')
      const [linha] = linhas<{ espaco: string; iniciado_em: number; concluido_em: number | null }>(
        await tx.execute(sql`
          SELECT espaco, iniciado_em, concluido_em FROM anuncios_premiados
          WHERE user_id = ${userId} AND exibicao_id = ${exibicaoId}`),
      )
      if (!linha) return { tipo: 'desconhecida' }
      if (linha.concluido_em != null)
        return { tipo: 'ja-creditada', espaco: linha.espaco, concluidoEm: Number(linha.concluido_em) }
      if (agora - Number(linha.iniciado_em) >= tetos.prazoMs) return { tipo: 'expirada' }

      const [c] = linhas<{ pessoa: number; total: number }>(
        await tx.execute(sql`
          SELECT count(*) FILTER (WHERE user_id = ${userId})::int AS pessoa, count(*)::int AS total
          FROM anuncios_premiados WHERE dia = ${dia} AND concluido_em IS NOT NULL`),
      )
      if (Number(c?.pessoa ?? 0) >= tetos.limitePorPessoa || Number(c?.total ?? 0) >= tetos.tetoGlobal) {
        return { tipo: 'teto' }
      }

      const r = await tx.execute(sql`
        UPDATE anuncios_premiados SET concluido_em = ${agora}, dia = ${dia}
        WHERE user_id = ${userId} AND exibicao_id = ${exibicaoId} AND concluido_em IS NULL`)
      /* Sob as travas a linha não muda entre o SELECT e aqui; a condição é a segunda defesa. */
      if (linhasAfetadas(r) !== 1) throw new Error('anuncios_premiados: conclusão não gravada')
      return { tipo: 'creditada', espaco: linha.espaco, concluidoEm: agora }
    })
  },

  /** Quantas exibições do `espaco` a pessoa concluiu no mês UTC (`AAAA-MM`). */
  async concluidasNoMes(userId: UserId, espaco: string, mes: string): Promise<number> {
    const r = linhas<{ n: number }>(
      await db.execute(sql`
        SELECT count(*)::int AS n FROM anuncios_premiados
        WHERE user_id = ${userId} AND espaco = ${espaco} AND concluido_em IS NOT NULL
          AND dia >= ${`${mes}-01`} AND dia <= ${`${mes}-31`}`),
    )
    return Number(r[0]?.n ?? 0)
  },

  /**
   * A poda da limpeza diária: pendentes de mais de um dia (nunca mais creditam) e concluídas antes do mês
   * anterior (o teto é do dia e o bônus de nuvem, do mês). Teto de linhas por passada.
   */
  async podar(agora: number): Promise<number> {
    return linhasAfetadas(
      await db.execute(sql`DELETE FROM anuncios_premiados WHERE (user_id, exibicao_id) IN (
        SELECT user_id, exibicao_id FROM anuncios_premiados
        WHERE (concluido_em IS NULL AND iniciado_em < ${agora - DIA_MS})
           OR (concluido_em IS NOT NULL AND dia < ${inicioDoMesAnterior(agora)})
        LIMIT 5000 FOR UPDATE SKIP LOCKED)`),
    )
  },
}
