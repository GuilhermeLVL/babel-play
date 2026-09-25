import { randomUUID } from 'node:crypto'

import { and, asc, eq, isNull } from 'drizzle-orm'

import type { UserId } from '../../lib/authContext'
import { db, type ExecutorDb } from '../db'
import { emLotes, tamanhoDoLoteDeInsert, tuplaDeBatch } from '../lotes'
import { utterances } from '../schema'

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

/** As linhas do INSERT de falas — um `now` só para o lote inteiro. */
function montarLinhas(userId: UserId, sessionId: string, items: NewUtterance[]): (typeof utterances.$inferInsert)[] {
  const now = Date.now()
  return items.map((u, i) => ({
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
}

// Marco 1: toda função exige `userId` (parâmetro branded) — o TS impede esquecer de escopar.
export const utterancesRepo = {
  /**
   * MONTA os inserts das falas sem executá-los — para o chamador juntar num `db.batch()`
   * atômico (P1-N3). Devolve lista vazia quando não há nada a inserir.
   *
   * É uma LISTA de instruções, e não uma só, por causa do teto de 32.766 variáveis do SQLite:
   * cada fala são 17 variáveis, e o schema aceita 5.000 falas — uma instrução única passava do
   * teto a partir de 1.928 falas e a sessão inteira era recusada. Os lotes vão todos no MESMO
   * batch do chamador, então a atomicidade continua a da sessão inteira.
   */
  stmtInsertMany(userId: UserId, sessionId: string, items: NewUtterance[]) {
    const lote = tamanhoDoLoteDeInsert(utterances)
    return emLotes(montarLinhas(userId, sessionId, items), lote).map((linhas) => db.insert(utterances).values(linhas))
  },

  /** MONTA o delete das falas de uma sessão, para compor um batch atômico. */
  stmtDeleteForSession(userId: UserId, sessionId: string) {
    return db.delete(utterances).where(and(eq(utterances.sessionId, sessionId), eq(utterances.userId, userId)))
  },

  /** MONTA a propagação do soft delete da sessão para as falas dela (F3-04). */
  stmtSoftDeleteForSession(userId: UserId, sessionId: string, now: number) {
    return db
      .update(utterances)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(utterances.sessionId, sessionId), eq(utterances.userId, userId), isNull(utterances.deletedAt)))
  },

  /**
   * `exec` permite rodar DENTRO de uma transação do chamador (P1-N3). Sem isso, a sessão e
   * suas falas entravam em operações separadas e uma falha no meio deixava sessão órfã.
   * Em lotes pelo mesmo motivo de `stmtInsertMany`; a atomicidade é a do `exec`.
   */
  async insertMany(userId: UserId, sessionId: string, items: NewUtterance[], exec: ExecutorDb = db): Promise<void> {
    const lote = tamanhoDoLoteDeInsert(utterances)
    for (const linhas of emLotes(montarLinhas(userId, sessionId, items), lote)) {
      await exec.insert(utterances).values(linhas)
    }
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
    const now = Date.now()
    // Era um UPDATE por item num laço — até 5.000 idas ao banco por requisição. Agora é UM
    // `db.batch`: uma ida só e atômico (ou reetiqueta tudo, ou nada). Cada UPDATE é pela chave
    // primária, então a transação é curta mesmo no teto do schema.
    const instrucoes = items
      .filter((it) => it?.id && it.sourceLang && it.targetLang)
      .map((it) =>
        db
          .update(utterances)
          .set({ sourceLang: it.sourceLang, targetLang: it.targetLang, updatedAt: now })
          .where(and(eq(utterances.id, it.id), eq(utterances.userId, userId))),
      )
    if (!instrucoes.length) return 0
    const resultados = await db.batch(tuplaDeBatch(instrucoes))
    return resultados.reduce((n, r) => n + Number((r as { rowsAffected?: number }).rowsAffected ?? 0), 0)
  },

  /** Troca TODAS as falas da sessão pelas novas (fluxo "retomar captura"). */
  /**
   * P1-N3: era DELETE seguido de INSERT em operações SOLTAS — sem transação e sem
   * compensação. Falha no insert apagava a transcrição inteira do usuário e não devolvia
   * nada. É o caminho de "retomar captura", então o dado perdido é trabalho dele.
   */
  async replaceForSession(
    userId: UserId,
    sessionId: string,
    items: NewUtterance[],
    exec: ExecutorDb = db,
  ): Promise<void> {
    await exec.delete(utterances).where(and(eq(utterances.sessionId, sessionId), eq(utterances.userId, userId)))
    await this.insertMany(userId, sessionId, items, exec)
  },

  /** Edição pontual de uma fala (corrigir transcrição/tradução/falante). */
  async update(userId: UserId, id: string, patch: Partial<NewUtterance>): Promise<Utterance | undefined> {
    const values: Record<string, unknown> = { updatedAt: Date.now() }
    for (const k of ['sourceText', 'translatedText', 'speakerName', 'speakerId'] as const) {
      if (patch[k] !== undefined) values[k] = patch[k]
    }
    await db
      .update(utterances)
      .set(values)
      .where(and(eq(utterances.id, id), eq(utterances.userId, userId)))
    const rows = await db
      .select()
      .from(utterances)
      .where(and(eq(utterances.id, id), eq(utterances.userId, userId)))
      .limit(1)
    return rows[0]
  },
}
