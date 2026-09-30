import { randomUUID } from 'node:crypto'

import { and, asc, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm'

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

/** A tradução polida de uma fala (D5), com a procedência — o que "retomar a captura" preserva. */
type Polimento = Pick<Utterance, 'traducaoPolida' | 'polimentoModelo' | 'polimentoVersao' | 'polidoEm'>

/**
 * AS POLIDAS QUE SOBREVIVEM À TROCA DAS FALAS, pelo texto e pela tradução da fala. "Retomar a
 * captura" (`replaceUtterances`) e o lote da captura longa (`appendUtterances`) APAGAM as falas e
 * inserem de novo — com ids novos. Sem isto, a polida de uma fala que voltou IGUAL sumia, e polir de
 * novo cobraria outra vez o que já foi polido. A chave é o texto e a tradução, não o `idx`: a fala
 * que mudou não herda a polida de outro texto, e a que só mudou de lugar a mantém.
 */
export type PolidasPreservadas = ReadonlyMap<string, Polimento>
const chaveDaPolida = (sourceText: string | null | undefined, translatedText: string | null | undefined) =>
  `${sourceText ?? ''}\u0000${translatedText ?? ''}`

/** As linhas do INSERT de falas — um `now` só para o lote inteiro. */
function montarLinhas(
  userId: UserId,
  sessionId: string,
  items: NewUtterance[],
  preservadas?: PolidasPreservadas,
): (typeof utterances.$inferInsert)[] {
  const now = Date.now()
  return items.map((u, i) => ({
    ...preservadas?.get(chaveDaPolida(u.sourceText, u.translatedText)),
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
  stmtInsertMany(userId: UserId, sessionId: string, items: NewUtterance[], preservadas?: PolidasPreservadas) {
    const lote = tamanhoDoLoteDeInsert(utterances)
    return emLotes(montarLinhas(userId, sessionId, items, preservadas), lote).map((linhas) =>
      db.insert(utterances).values(linhas),
    )
  },

  /**
   * As polidas da sessão (ou de uma faixa de `idx`) que devem sobreviver à troca das falas — ver
   * `PolidasPreservadas`. Lida ANTES do batch que apaga e insere.
   */
  async polidasParaPreservar(
    userId: UserId,
    sessionId: string,
    faixa?: { de: number; ate: number },
  ): Promise<PolidasPreservadas> {
    const linhas = await db
      .select({
        sourceText: utterances.sourceText,
        translatedText: utterances.translatedText,
        traducaoPolida: utterances.traducaoPolida,
        polimentoModelo: utterances.polimentoModelo,
        polimentoVersao: utterances.polimentoVersao,
        polidoEm: utterances.polidoEm,
      })
      .from(utterances)
      .where(
        and(
          eq(utterances.sessionId, sessionId),
          eq(utterances.userId, userId),
          isNotNull(utterances.traducaoPolida),
          ...(faixa ? [gte(utterances.idx, faixa.de), lte(utterances.idx, faixa.ate)] : []),
        ),
      )
    const mapa = new Map<string, Polimento>()
    for (const { sourceText, translatedText, ...polimento } of linhas) {
      const chave = chaveDaPolida(sourceText, translatedText)
      if (!mapa.has(chave)) mapa.set(chave, polimento)
    }
    return mapa
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
    const daFala = and(eq(utterances.id, id), eq(utterances.userId, userId))
    /* A TRADUÇÃO POLIDA (D5) é derivada do texto e da tradução: corrigir um dos dois a apaga, com a
       procedência dela — ela descrevia outro texto. Salvar sem mudar nada (a edição da Análise manda
       os dois campos sempre) não apaga: a comparação é com o que está no banco. */
    if (patch.sourceText !== undefined || patch.translatedText !== undefined) {
      const [atual] = await db
        .select({ sourceText: utterances.sourceText, translatedText: utterances.translatedText })
        .from(utterances)
        .where(daFala)
        .limit(1)
      const mudou =
        !!atual &&
        ((patch.sourceText !== undefined && patch.sourceText !== atual.sourceText) ||
          (patch.translatedText !== undefined && patch.translatedText !== atual.translatedText))
      if (mudou) Object.assign(values, SEM_POLIMENTO)
    }
    await db.update(utterances).set(values).where(daFala)
    const rows = await db.select().from(utterances).where(daFala).limit(1)
    return rows[0]
  },

  /**
   * GRAVA A TRADUÇÃO POLIDA (D5 da Fase D, `server/ai/polimento.ts`) AO LADO da original — nunca em
   * `translated_text`. Cada UPDATE é condicional:
   *   - `traducao_polida IS NULL`: dois pedidos do mesmo bloco não gravam por cima um do outro, e o
   *     que já foi polido não muda (o polimento é idempotente);
   *   - o texto e a tradução ainda são os que foram ao modelo: uma correção feita enquanto o bloco
   *     estava no provedor não recebe uma polida do texto velho.
   * Um `db.batch` só (uma ida ao banco, atômico). Devolve os ids das falas que de fato gravou.
   */
  async gravarPolimento(
    userId: UserId,
    sessionId: string,
    itens: ReadonlyArray<{ id: string; sourceText: string | null; translatedText: string | null; polida: string }>,
    procedencia: { modelo: string; versao: string; em: number },
  ): Promise<string[]> {
    const instrucoes = itens.map((it) =>
      db
        .update(utterances)
        .set({
          traducaoPolida: it.polida,
          polimentoModelo: procedencia.modelo,
          polimentoVersao: procedencia.versao,
          polidoEm: procedencia.em,
          updatedAt: procedencia.em,
        })
        .where(
          and(
            eq(utterances.id, it.id),
            eq(utterances.userId, userId),
            eq(utterances.sessionId, sessionId),
            isNull(utterances.traducaoPolida),
            it.sourceText === null ? isNull(utterances.sourceText) : eq(utterances.sourceText, it.sourceText),
            it.translatedText === null
              ? isNull(utterances.translatedText)
              : eq(utterances.translatedText, it.translatedText),
          ),
        ),
    )
    if (!instrucoes.length) return []
    const resultados = await db.batch(tuplaDeBatch(instrucoes))
    return itens
      .filter((_, i) => Number((resultados[i] as { rowsAffected?: number }).rowsAffected ?? 0) > 0)
      .map((it) => it.id)
  },
}

/** As quatro colunas do polimento, zeradas (a polida sai junto com a procedência dela). */
const SEM_POLIMENTO = { traducaoPolida: null, polimentoModelo: null, polimentoVersao: null, polidoEm: null }
