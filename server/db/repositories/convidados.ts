/**
 * CONVIDADOS COM NUVEM (tabela `convidados`, migração 0033) — só leitura e escrita de linha.
 * A política (limite por IP, cotas, expiração) mora em `server/lib/convidado.ts` e
 * `server/lib/limpezaDeConvidados.ts`.
 */
import { and, asc, eq, gte, inArray, like, lt, or } from 'drizzle-orm'

import type { UserId } from '../../lib/authContext'
import { db } from '../db'
import { convidados, usageCounters } from '../schema'

export type LinhaDeConvidado = typeof convidados.$inferSelect

export const convidadosRepo = {
  /**
   * Registra o convidado na PRIMEIRA vez que ele usa a nuvem, ou só renova `visto_em` depois.
   * `INSERT … ON CONFLICT DO UPDATE` numa instrução só: duas chamadas simultâneas do mesmo id nunca
   * viram duas linhas. O `ip_hash` e o `criado_em` da primeira vez ficam — é por eles que o limite
   * de criação por IP conta.
   */
  async registrar(userId: UserId, ipHash: string, agora: number): Promise<LinhaDeConvidado> {
    const rows = await db
      .insert(convidados)
      .values({ userId, ipHash, criadoEm: agora, vistoEm: agora })
      .onConflictDoUpdate({ target: convidados.userId, set: { vistoEm: agora } })
      .returning()
    return rows[0]
  },

  /**
   * Os PRIMEIROS `limite` convidados que estrearam na nuvem por este IP a partir de `desde`, em ordem
   * de chegada. Quem está na lista pode usar; quem ficou de fora passou do limite do dia. Ordenar
   * por chegada (e não só contar) é o que torna a decisão ESTÁVEL: o 4º convidado continua recusado
   * nas chamadas seguintes, e os três primeiros continuam aceitos.
   */
  async primeirosDoIp(ipHash: string, desde: number, limite: number): Promise<string[]> {
    const rows = await db
      .select({ userId: convidados.userId })
      .from(convidados)
      .where(and(eq(convidados.ipHash, ipHash), gte(convidados.criadoEm, desde)))
      .orderBy(asc(convidados.criadoEm), asc(convidados.userId))
      .limit(limite)
    return rows.map((r) => r.userId)
  },

  async ler(userId: UserId): Promise<LinhaDeConvidado | undefined> {
    const rows = await db.select().from(convidados).where(eq(convidados.userId, userId)).limit(1)
    return rows[0]
  },

  /** Um lote de convidados inativos (sem nuvem desde `antesDe`), os mais antigos primeiro. */
  async inativos(antesDe: number, lote: number): Promise<LinhaDeConvidado[]> {
    return db
      .select()
      .from(convidados)
      .where(lt(convidados.vistoEm, antesDe))
      .orderBy(asc(convidados.vistoEm))
      .limit(lote)
  },

  /**
   * Apaga o registro e os contadores de uso de convidados. Os contadores do rate-limit usam a chave
   * `u:<id>` (ver `rateLimitStore.ts`); os de cota, o id puro. Com `janelaMenorQue`, só os
   * contadores de janelas ANTERIORES (`'YYYY-MM'`) saem — o caso em que não dá para saber se o id
   * virou conta (sem a Admin API do Supabase), e o mês corrente pode já ser da conta convertida.
   */
  async apagarComContadores(userIds: string[], opts: { janelaMenorQue?: string } = {}): Promise<void> {
    if (userIds.length === 0) return
    const chaves = [...userIds, ...userIds.map((u) => `u:${u}`)]
    const dosIds = inArray(usageCounters.userId, chaves)
    await db.batch([
      db
        .delete(usageCounters)
        .where(opts.janelaMenorQue ? and(dosIds, lt(usageCounters.window, opts.janelaMenorQue)) : dosIds),
      db.delete(convidados).where(inArray(convidados.userId, userIds)),
    ])
  },

  /**
   * Lê um contador de gasto (pool do dia, gasto do IP, gasto do convidado no mês). Ler e depois
   * somar é deliberado AQUI, como no orçamento global (`orcamentoDeIa.ts`): o custo só se sabe
   * depois da chamada, então a regra é "conferir antes, somar depois" — com chamadas simultâneas no
   * limiar o teto pode passar alguns centavos, e o pool global é a trava de fora.
   */
  async lerContador(chave: string, metric: string, janela: string): Promise<number> {
    const rows = await db
      .select({ count: usageCounters.count })
      .from(usageCounters)
      .where(and(eq(usageCounters.userId, chave), eq(usageCounters.metric, metric), eq(usageCounters.window, janela)))
      .limit(1)
    return rows[0]?.count ?? 0
  },

  /** Só o registro (a conta foi convertida: os contadores são dela agora e ficam). */
  async apagarRegistro(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return
    await db.delete(convidados).where(inArray(convidados.userId, userIds))
  },

  /**
   * Os contadores DIÁRIOS por IP (`convidado-ip:<hash>`) e o pool global do dia vivem em
   * `usage_counters` com janela `YYYY-MM-DD`. Apaga os de janelas anteriores a `janelaMenorQue`.
   */
  async podarContadoresDiarios(prefixos: string[], janelaMenorQue: string): Promise<void> {
    if (prefixos.length === 0) return
    await db
      .delete(usageCounters)
      .where(
        and(or(...prefixos.map((p) => like(usageCounters.userId, `${p}%`))), lt(usageCounters.window, janelaMenorQue)),
      )
  },
}
