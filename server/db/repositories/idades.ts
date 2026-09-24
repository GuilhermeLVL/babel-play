/**
 * DATA DE NASCIMENTO DECLARADA (migração 0028, Fase 4 — ECA Digital e LGPD art. 14).
 *
 * Uma linha por conta, gravada UMA vez: o INSERT com `DO NOTHING` no índice único de `user_id` é a
 * própria trava — a troca posterior não acontece nem sob corrida (corrigir é pelo suporte, senão um
 * menor viraria adulto trocando a data). A faixa etária NÃO é guardada: `server/lib/idade.ts` a
 * deriva, porque ela muda com o tempo.
 */
import { randomUUID } from 'node:crypto'

import { and, eq, isNull } from 'drizzle-orm'

import type { UserId } from '../../lib/authContext'
import { db } from '../db'
import { idadesDeclaradas } from '../schema'
import { usersRepo } from './users'

export const idadesRepo = {
  /** A data declarada (`AAAA-MM-DD`), ou `null` se a pessoa ainda não disse. */
  async nascimento(userId: UserId): Promise<string | null> {
    const rows = await db
      .select({ nascimento: idadesDeclaradas.nascimento })
      .from(idadesDeclaradas)
      .where(and(eq(idadesDeclaradas.userId, userId), isNull(idadesDeclaradas.deletedAt)))
      .limit(1)
    return rows[0]?.nascimento ?? null
  },

  /**
   * Declara a data. `'gravada'` = a conta está com ESTA data (inclusive se já estava);
   * `'divergente'` = já havia outra, e ela fica.
   */
  async declarar(userId: UserId, nascimento: string): Promise<'gravada' | 'divergente'> {
    await usersRepo.ensure(userId)
    const agora = Date.now()
    await db
      .insert(idadesDeclaradas)
      .values({ id: randomUUID(), createdAt: agora, updatedAt: agora, userId, nascimento })
      .onConflictDoNothing({ target: idadesDeclaradas.userId })
    return (await this.nascimento(userId)) === nascimento ? 'gravada' : 'divergente'
  },
}
