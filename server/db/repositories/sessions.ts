import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { sessions } from '../schema'
import { utterancesRepo, type NewUtterance, type Utterance } from './utterances'
import type { UserId } from '../../lib/authContext'

export type Session = typeof sessions.$inferSelect

/**
 * Lê o `meta` para MESCLAR nele. Falha alto se o JSON estiver ilegível.
 *
 * P1-8: aqui havia `catch { meta = {} }`, e logo abaixo um `JSON.stringify(meta)` no UPDATE.
 * Ou seja: um `meta` corrompido não era reportado — era SOBRESCRITO por vazio e persistido,
 * destruindo `audioFile`, `pinned` e `imageUrl` sem deixar rastro. Engolir erro na leitura é
 * ruim; na escrita é perda de dado. Quem só LÊ o meta (readMeta, nas rotas) pode continuar
 * degradando para `{}` — ali o valor não volta para o banco.
 */
function parseMetaOuFalhe(metaStr: string | null, id: string): Record<string, unknown> {
  if (!metaStr) return {}
  try {
    const v = JSON.parse(metaStr) as unknown
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
    throw new Error('meta não é um objeto')
  } catch (err) {
    throw new Error(`meta da sessão ${id} está ilegível (${String((err as Error).message).slice(0, 60)}) — não sobrescrito`)
  }
}

export interface NewSession {
  title?: string
  kind?: string
  sourceLang?: string
  targetLang?: string
  status?: string
  durationMs?: number
  wordCount?: number
  meta?: unknown
  /** Id da sessão no navegador de origem (migração sem conta → conta). */
  origemLocalId?: string
}

/** Repositório de sessões (adapter de SERVIDOR). Marco 1: `userId` obrigatório em toda função. */
export const sessionsRepo = {
  async list(userId: UserId): Promise<Session[]> {
    return db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.deletedAt)))
      .orderBy(desc(sessions.createdAt))
  },

  async get(userId: UserId, id: string): Promise<Session | undefined> {
    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, userId), isNull(sessions.deletedAt)))
      .limit(1)
    return rows[0]
  },

  async create(userId: UserId, input: NewSession): Promise<Session> {
    const now = Date.now()
    const values: typeof sessions.$inferInsert = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      userId,
      startedAt: now,
      status: input.status ?? 'draft',
      title: input.title ?? null,
      kind: input.kind ?? null,
      sourceLang: input.sourceLang ?? null,
      targetLang: input.targetLang ?? null,
      durationMs: input.durationMs ?? null,
      wordCount: input.wordCount ?? null,
      meta: input.meta != null ? JSON.stringify(input.meta) : null,
    }
    await db.insert(sessions).values(values)
    const created = await this.get(userId, values.id)
    if (!created) throw new Error('falha ao criar sessão')
    return created
  },

  /**
   * Cria a sessão e insere suas utterances numa tacada (ponte "parar gravação").
   *
   * P1-7: eram duas operações soltas — falha na segunda deixava a sessão órfã, sem falas,
   * e nada limpava. Sob SQLITE_BUSY isso acontecia de verdade. Agora, se as falas não
   * entrarem, a sessão é desfeita e o erro sobe: melhor nada do que meia sessão.
   */
  async createWithUtterances(userId: UserId, input: NewSession, utts: NewUtterance[]): Promise<Session> {
    // P1-N3: era compensação manual (insert → catch → delete), e o delete compensatório
    // podia falhar pela MESMA razão que fez o insert falhar, deixando a sessão órfã. Agora é
    // transação de verdade: ou entram sessão e falas, ou não entra nada.
    const now = Date.now()
    const id = randomUUID()
    const wordCount =
      input.wordCount ??
      utts.reduce((n, u) => n + (u.sourceText ? u.sourceText.trim().split(/\s+/).length : 0), 0)

    const inserirSessao = db.insert(sessions).values({
      id,
      createdAt: now,
      updatedAt: now,
      userId,
      startedAt: now,
      status: input.status ?? 'draft',
      title: input.title ?? null,
      kind: input.kind ?? null,
      sourceLang: input.sourceLang ?? null,
      targetLang: input.targetLang ?? null,
      durationMs: input.durationMs ?? null,
      wordCount,
      meta: input.meta != null ? JSON.stringify(input.meta) : null,
      origemLocalId: input.origemLocalId ?? null,
    })
    const inserirFalas = utterancesRepo.stmtInsertMany(userId, id, utts)

    // `batch` e não `transaction`: o batch roda na MESMA conexão (preserva os PRAGMAs) e é
    // 9× mais rápido — `transaction()` do libsql abre conexão nova com synchronous=FULL, ou
    // seja fsync por commit. Medido em scripts/audit/v2-diag-batch.mjs. Atomicidade idêntica:
    // uma instrução que falha desfaz as anteriores.
    if (inserirFalas) await db.batch([inserirSessao, inserirFalas])
    else await inserirSessao

    const created = await this.get(userId, id)
    if (!created) throw new Error('falha ao criar sessão')
    return created
  },

  /** A sessão viva deste usuário que veio do navegador `origemLocalId`, se já migrou. */
  async findByOrigemLocal(userId: UserId, origemLocalId: string): Promise<Session | undefined> {
    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.origemLocalId, origemLocalId), isNull(sessions.deletedAt)))
      .limit(1)
    return rows[0]
  },

  /**
   * Cria UMA vez por `origemLocalId` — a migração sem conta → conta reenvia a mesma sessão
   * quando falha no meio ou quando a pessoa entra de novo, e isto devolve a que já existe.
   *
   * Consulta antes e trata o UNIQUE depois: a consulta cobre o caso comum sem erro; o índice
   * parcial `uq_sessions_user_origem_local` arbitra duas abas migrando ao mesmo tempo, e o
   * catch re-lê a vencedora. Sem `origemLocalId` é a criação normal.
   */
  async criarOuReusar(userId: UserId, input: NewSession, utts: NewUtterance[]): Promise<{ session: Session; jaExistia: boolean }> {
    if (input.origemLocalId) {
      const ja = await this.findByOrigemLocal(userId, input.origemLocalId)
      if (ja) return { session: ja, jaExistia: true }
    }
    try {
      return { session: await this.createWithUtterances(userId, input, utts), jaExistia: false }
    } catch (err) {
      if (input.origemLocalId && /UNIQUE|uq_sessions_user_origem_local/i.test(String((err as Error)?.message ?? err))) {
        const ja = await this.findByOrigemLocal(userId, input.origemLocalId)
        if (ja) return { session: ja, jaExistia: true }
      }
      throw err
    }
  },

  async getWithUtterances(
    userId: UserId,
    id: string
  ): Promise<{ session: Session; utterances: Utterance[] } | undefined> {
    const session = await this.get(userId, id)
    if (!session) return undefined
    const utterances = await utterancesRepo.listBySession(userId, id)
    return { session, utterances }
  },

  /** Atualiza campos escalares da sessão (renomear; recontar após retomar a captura). */
  async update(userId: UserId, id: string, patch: Partial<NewSession>): Promise<Session | undefined> {
    const values: Record<string, unknown> = { updatedAt: Date.now() }
    for (const k of ['title', 'kind', 'sourceLang', 'targetLang', 'status', 'durationMs', 'wordCount'] as const) {
      if (patch[k] !== undefined) values[k] = patch[k]
    }
    await db.update(sessions).set(values).where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    return this.get(userId, id)
  },

  /**
   * Substitui as falas da sessão e recalcula `wordCount` na mesma operação — os dois
   * andam juntos: um transcript novo com a contagem antiga daria métrica errada.
   */
  async replaceUtterances(userId: UserId, id: string, utts: NewUtterance[]): Promise<Session | undefined> {
    const s = await this.get(userId, id)
    if (!s) return undefined
    const wordCount = utts.reduce(
      (n, u) => n + (u.sourceText ? u.sourceText.trim().split(/\s+/).filter(Boolean).length : 0),
      0
    )
    // P1-N3: o DELETE das falas antigas e o INSERT das novas rodavam SOLTOS — falha no
    // insert apagava a transcrição inteira e não devolvia nada. É o caminho de "retomar
    // captura", então o que se perdia era trabalho do usuário. Agora ou troca tudo, ou nada.
    const apagar = utterancesRepo.stmtDeleteForSession(userId, id)
    const inserir = utterancesRepo.stmtInsertMany(userId, id, utts)
    const contar = db.update(sessions).set({ wordCount, updatedAt: Date.now() })
      .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    await (inserir ? db.batch([apagar, inserir, contar]) : db.batch([apagar, contar]))
    return this.get(userId, id)
  },

  /**
   * P2-N4: devolve se ALGUMA linha foi afetada. Antes era `void`, e a rota respondia
   * `{ok:true}` mesmo quando o recurso era de outro dono (o `where` inclui `userId`, então
   * zero linhas mudavam). Não vazava informação, mas o cliente não distinguia "apagado" de
   * "não era seu" — e as outras rotas respondem 404 nesse caso.
   *
   * F3-04: propaga para as falas. Sem isto elas ficavam vivas sob uma sessão invisível (4 linhas
   * neste banco) e continuavam entrando nas métricas por usuário, que filtram só `deleted_at`.
   * `vocab_cards` NÃO propaga de propósito: uma palavra salva sobrevive à sessão que a originou.
   */
  async remove(userId: UserId, id: string): Promise<boolean> {
    const now = Date.now()
    const alvo = await this.get(userId, id)
    if (!alvo) return false
    await db.batch([
      db.update(sessions).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(sessions.id, id), eq(sessions.userId, userId))),
      utterancesRepo.stmtSoftDeleteForSession(userId, id, now),
    ])
    return true
  },

  /** Registra o arquivo de áudio gravado da sessão no `meta` (mescla com o que já existe). */
  async setAudio(userId: UserId, id: string, audioFile: string, audioType: string): Promise<void> {
    const s = await this.get(userId, id)
    if (!s) return
    const meta = parseMetaOuFalhe(s.meta, id)
    meta.audioFile = audioFile
    meta.audioType = audioType
    await db
      .update(sessions)
      .set({ meta: JSON.stringify(meta), updatedAt: Date.now() })
      .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
  },

  /**
   * Mescla um patch arbitrário na coluna `meta` (mesmo padrão de `setAudio`): lê o
   * JSON existente, aplica o patch e regrava. Usado por pin/capa da Biblioteca.
   * Chaves com valor `null` são removidas do meta (ex.: limpar a capa).
   */
  async patchMeta(userId: UserId, id: string, patch: Record<string, unknown>): Promise<Session | undefined> {
    const s = await this.get(userId, id)
    if (!s) return undefined
    const meta = parseMetaOuFalhe(s.meta, id)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete meta[k]
      else meta[k] = v
    }
    await db
      .update(sessions)
      .set({ meta: JSON.stringify(meta), updatedAt: Date.now() })
      .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    return this.get(userId, id)
  },
}
