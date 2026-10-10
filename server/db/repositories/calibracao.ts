/**
 * A CALIBRAÇÃO DO FSRS DE UM USUÁRIO (change `modelo-do-aluno-e-dados`, tarefa 1.3): lê o histórico
 * de revisões e entrega à função pura do core (`src/core/learning/calibracao.ts`). Só leitura.
 *
 * Só as revisões que continuam no histórico (`deleted_at` nulo): a desfeita foi um engano de quem
 * revisava, e a de cartão apagado não tem mais a quem servir. O dia da "primeira nota do dia" é o
 * dia local no fuso gravado do usuário, o mesmo da ofensiva.
 */
import { and, eq, isNull } from 'drizzle-orm'

import {
  type Calibracao,
  calibracaoDoFsrs,
  calibracaoPorOrigem,
  type RevisaoParaCalibrar,
} from '../../../src/core/learning/calibracao'
import { diaNumeroNoFuso } from '../../../src/core/learning/economia'
import type { UserId } from '../../lib/authContext'
import { db } from '../db'
import { reviewLogs } from '../schema'
import { agregadosRepo } from './agregados'

export interface CalibracaoDoUsuario {
  userId: string
  fuso: string
  /** Se as repetições do mesmo cartão no mesmo dia ficaram de fora. */
  soPrimeiraDoDia: boolean
  /** Quantas revisões o histórico tem (antes dos filtros da conta). */
  historico: number
  geral: Calibracao
  /** A mesma conta por origem da nota: 'revisao', 'jogo:<id>' e 'sem-origem' (revisões antigas). */
  porOrigem: Record<string, Calibracao>
}

export async function calibracaoDoUsuario(
  userId: UserId,
  opts: { soPrimeiraDoDia?: boolean } = {},
): Promise<CalibracaoDoUsuario> {
  const soPrimeiraDoDia = opts.soPrimeiraDoDia ?? true
  const fuso = await agregadosRepo.fusoGravado(userId)
  const linhas = await db
    .select({
      cardId: reviewLogs.cardId,
      createdAt: reviewLogs.createdAt,
      reviewedAt: reviewLogs.reviewedAt,
      grade: reviewLogs.grade,
      prevStability: reviewLogs.prevStability,
      elapsedDays: reviewLogs.elapsedDays,
      retencaoPrevista: reviewLogs.retencaoPrevista,
      origem: reviewLogs.origem,
    })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), isNull(reviewLogs.deletedAt)))
  const historico: RevisaoParaCalibrar[] = linhas.map((l) => ({
    cardId: l.cardId,
    em: l.reviewedAt ?? l.createdAt,
    grade: l.grade,
    prevStability: l.prevStability,
    elapsedDays: l.elapsedDays,
    retencaoPrevista: l.retencaoPrevista,
    origem: l.origem,
  }))
  const conta = { soPrimeiraDoDia, diaDe: (em: number) => diaNumeroNoFuso(em, fuso) }
  return {
    userId,
    fuso,
    soPrimeiraDoDia,
    historico: historico.length,
    geral: calibracaoDoFsrs(historico, conta),
    porOrigem: calibracaoPorOrigem(historico, conta),
  }
}
