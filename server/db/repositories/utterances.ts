import { randomUUID } from 'node:crypto'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db, type ExecutorDb } from '../db'
import { utterances } from '../schema'
import type { UserId } from '../../lib/authContext'

export type Utterance = typeof utterances.$inferSelect

export interface NewUtterance {
  idx?: number
  tStartMs?: number
  tEndMs?: number
  speakerId?: string
  speakerName?: string
  source?: string
  sourceLang?: string
  sourceText?: string
  targetLang?: string
  translatedText?: string
  confidence?: number
  engine?: string
}

// Marco 1: toda função exige `userId` (parâmetro branded) — o TS impede esquecer de escopar.
export const utterancesRepo = {
  /**
   * MONTA o insert das falas sem executá-lo — para o chamador juntar num `db.batch()`
   * atômico (P1-N3). Devolve `null` quando não há nada a inserir.
   */
  stmtInsertMany(userId: UserId, sessionId: string, items: NewUtterance[]) {
    if (!items.length) return null
    const now = Date.now()
    const rows: (typeof utterances.$inferInsert)[] = items.map((u, i) => ({
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      userId,
      sessionId,
      idx: u.idx ?? i,
      tStartMs: u.tStartMs ?? null,
      tEndMs: u.tEndMs ?? null,
      speakerId: u.speakerId ?? null,
      speakerName: u.speakerName ?? null,
      source: u.source ?? null,
      sourceLang: u.sourceLang ?? null,
      sourceText: u.sourceText ?? null,
      targetLang: u.targetLang ?? null,
      translatedText: u.translatedText ?? null,
      confidence: u.confidence ?? null,
      engine: u.engine ?? null,
    }))
    return db.insert(utterances).values(rows)
  },

  /** MONTA o delete das falas de uma sessão, para compor um batch atômico. */
  stmtDeleteForSession(userId: UserId, sessionId: string) {
    return db.delete(utterances).where(and(eq(utterances.sessionId, sessionId), eq(utterances.userId, userId)))
  },

  /** MONTA a propagação do soft delete da sessão para as falas dela (F3-04). */
  stmtSoftDeleteForSession(userId: UserId, sessionId: string, now: number) {
    return db.update(utterances).set({ deletedAt: now, updatedAt: now })
      .where(and(eq(utterances.sessionId, sessionId), eq(utterances.userId, userId), isNull(utterances.deletedAt)))
  },

  /**
   * `exec` permite rodar DENTRO de uma transação do chamador (P1-N3). Sem isso, a sessão e
   * suas falas entravam em operações separadas e uma falha no meio deixava sessão órfã.
   */
  async insertMany(userId: UserId, sessionId: string, items: NewUtterance[], exec: ExecutorDb = db): Promise<void> {
    if (!items.length) return
    const now = Date.now()
    const rows: (typeof utterances.$inferInsert)[] = items.map((u, i) => ({
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      userId,
      sessionId,
      idx: u.idx ?? i,
      tStartMs: u.tStartMs ?? null,
      tEndMs: u.tEndMs ?? null,
      speakerId: u.speakerId ?? null,
      speakerName: u.speakerName ?? null,
      source: u.source ?? null,
      sourceLang: u.sourceLang ?? null,
      sourceText: u.sourceText ?? null,
      targetLang: u.targetLang ?? null,
      translatedText: u.translatedText ?? null,
      confidence: u.confidence ?? null,
      engine: u.engine ?? null,
    }))
    await exec.insert(utterances).values(rows)
  },

  async listBySession(userId: UserId, sessionId: string): Promise<Utterance[]> {
    return db
      .select()
      .from(utterances)
      .where(and(eq(utterances.sessionId, sessionId), eq(utterances.userId, userId)))
      .orderBy(asc(utterances.idx))
  },

  /** Todas as falas do usuário (não deletadas) — usado só pela Auditoria de idioma. */
  async listAll(userId: UserId): Promise<Utterance[]> {
    return db
      .select()
      .from(utterances)
      .where(and(isNull(utterances.deletedAt), eq(utterances.userId, userId)))
      .orderBy(asc(utterances.createdAt))
  },

  /**
   * Reetiqueta o idioma de falas já existentes (Auditoria de idioma). Só toca `sourceLang`/`targetLang`.
   * O `AND user_id` garante que ninguém reetiquete a fala de outro usuário.
   */
  async relabel(userId: UserId, items: Array<{ id: string; sourceLang: string; targetLang: string }>): Promise<number> {
    if (!items.length) return 0
    const now = Date.now()
    let changed = 0
    for (const it of items) {
      if (!it?.id || !it.sourceLang || !it.targetLang) continue
      const res = await db
        .update(utterances)
        .set({ sourceLang: it.sourceLang, targetLang: it.targetLang, updatedAt: now })
        .where(and(eq(utterances.id, it.id), eq(utterances.userId, userId)))
      changed += Number((res as { rowsAffected?: number }).rowsAffected ?? 0)
    }
    return changed
  },

  /** Troca TODAS as falas da sessão pelas novas (fluxo "retomar captura"). */
  /**
   * P1-N3: era DELETE seguido de INSERT em operações SOLTAS — sem transação e sem
   * compensação. Falha no insert apagava a transcrição inteira do usuário e não devolvia
   * nada. É o caminho de "retomar captura", então o dado perdido é trabalho dele.
   */
  async replaceForSession(userId: UserId, sessionId: string, items: NewUtterance[], exec: ExecutorDb = db): Promise<void> {
    await exec.delete(utterances).where(and(eq(utterances.sessionId, sessionId), eq(utterances.userId, userId)))
    await this.insertMany(userId, sessionId, items, exec)
  },

  /** Edição pontual de uma fala (corrigir transcrição/tradução/falante). */
  async update(userId: UserId, id: string, patch: Partial<NewUtterance>): Promise<Utterance | undefined> {
    const values: Record<string, unknown> = { updatedAt: Date.now() }
    for (const k of ['sourceText', 'translatedText', 'speakerName', 'speakerId'] as const) {
      if (patch[k] !== undefined) values[k] = patch[k]
    }
    await db.update(utterances).set(values).where(and(eq(utterances.id, id), eq(utterances.userId, userId)))
    const rows = await db
      .select()
      .from(utterances)
      .where(and(eq(utterances.id, id), eq(utterances.userId, userId)))
      .limit(1)
    return rows[0]
  },
}
