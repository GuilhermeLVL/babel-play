/**
 * AS OPÇÕES DA REVISÃO NA CONTA E O LIMITE DIÁRIO (tabela `opcoes_da_revisao`, migração PG 0035 provisória;
 * openspec `cartoes`, tarefas 2.1 e 2.2). As regras (padrões, limites, o que resta) são do núcleo:
 * `src/core/learning/opcoesDaRevisao.ts`.
 *
 * O contador do dia sai de `agregados_diarios` (o mesmo que a Memória e a ofensiva leem), no fuso GRAVADO da
 * conta: não há contador novo para ficar fora de compasso com as notas. `garantir` recontar antes de ler cobre o
 * caso de alguém ter escrito o bruto por fora.
 */
import { eq, sql } from 'drizzle-orm'

import { diaNumeroNoFuso } from '../../../src/core/learning/economia'
import {
  feitoDoDia,
  normalizarOpcoes,
  OPCOES_DA_CONTA_PADRAO,
  type OpcoesComHoje,
  type OpcoesDaConta,
  restamHoje,
} from '../../../src/core/learning/opcoesDaRevisao'
import type { UserId } from '../../lib/authContext'
import { db, linhas as linhasDe } from '../db'
import { opcoesDaRevisao } from '../schema'
import { agregadosRepo } from './agregados'

async function linhaDoDono(userId: UserId): Promise<OpcoesDaConta | null> {
  const [l] = await db.select().from(opcoesDaRevisao).where(eq(opcoesDaRevisao.userId, userId)).limit(1)
  if (!l) return null
  return normalizarOpcoes({
    novas: Number(l.novas),
    revisoes: Number(l.revisoes),
    ordem: l.ordem,
    tipo: l.tipo,
    ouvir: l.ouvir,
    retencao: Number(l.retencao),
    botoes: Number(l.botoes),
  })
}

export const opcoesDaRevisaoRepo = {
  /** As opções gravadas na conta, ou `null` se a pessoa nunca gravou. */
  obter: linhaDoDono,

  /**
   * Grava (upsert) as opções, mesclando o que veio sobre o que já havia (ou o padrão). Devolve o resultado
   * normalizado: valor fora da faixa nunca chega ao banco.
   */
  async gravar(userId: UserId, mudou: Partial<OpcoesDaConta>, agora = Date.now()): Promise<OpcoesDaConta> {
    const base = (await linhaDoDono(userId)) ?? OPCOES_DA_CONTA_PADRAO
    const o = normalizarOpcoes({ ...base, ...mudou }, base)
    await db
      .insert(opcoesDaRevisao)
      .values({ userId, ...o, atualizadoEm: agora })
      .onConflictDoUpdate({
        target: opcoesDaRevisao.userId,
        set: { ...o, atualizadoEm: agora },
      })
    return o
  },

  /** O que já foi estudado hoje (no dia da pessoa, no fuso gravado) e quanto cabe ainda. */
  async hoje(userId: UserId, opcoes: OpcoesDaConta, agora = Date.now()): Promise<OpcoesComHoje['hoje']> {
    await agregadosRepo.garantir(userId)
    const fuso = await agregadosRepo.fusoGravado(userId)
    const dia = diaNumeroNoFuso(agora, fuso)
    const [l] = linhasDe<{ vivas: number | string | null; novas: number | string | null }>(
      await db.execute(sql`
        SELECT sum(revisoes_vivas) AS vivas, sum(novas) AS novas
        FROM agregados_diarios WHERE user_id = ${userId} AND dia = ${dia}`),
    )
    const feito = feitoDoDia({ revisoesVivas: Number(l?.vivas ?? 0), novas: Number(l?.novas ?? 0) })
    const resta = restamHoje(opcoes, feito)
    return { ...feito, restamNovas: resta.novas, restamRevisoes: resta.revisoes }
  },

  /** As opções (ou o padrão) e o feito de hoje: a resposta do `GET`. */
  async comHoje(userId: UserId, agora = Date.now()): Promise<OpcoesComHoje> {
    const gravadas = await linhaDoDono(userId)
    const opcoes = gravadas ?? OPCOES_DA_CONTA_PADRAO
    return { opcoes, naConta: gravadas !== null, hoje: await this.hoje(userId, opcoes, agora) }
  },
}
