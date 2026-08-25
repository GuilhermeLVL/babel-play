import { randomUUID } from 'node:crypto'
import { desc, eq, isNull, isNotNull, and, gte, asc, inArray, max, sql, type SQL } from 'drizzle-orm'
import { db } from '../db'
import { exerciseResults, sessions, vocabCards } from '../schema'
import { MINIGAME_IDS } from '../../../src/core/minigames/revelavel'
import type { UserId } from '../../lib/authContext'

export type ExerciseResult = typeof exerciseResults.$inferSelect

export interface NewExerciseResult {
  sessionId?: string
  kind?: string
  /** 1 = acertou, 0 = errou. */
  correct?: number
  score?: number
  exerciseKind?: string
  /** Id da rodada — é o que reagrupa os 8 itens gravados no mesmo milissegundo. */
  roundId?: string
  /** A palavra (jogo de baralho) ou o id da fala (jogo de frase). Responde "o que eu já vi". */
  itemRef?: string
  /** Tentativas até acertar (1 = de primeira). */
  attempts?: number
  /** Tempo até responder, em ms. */
  ms?: number
  /** 1 = usou dica/revelação. Acerto com dica não é o mesmo acerto. */
  hinted?: number
  /** 'baralho' | 'sessao:<id>' | 'trilha:<nivel>'. */
  origem?: string
}

/** O melhor placar já feito num jogo, numa fonte. Chave = `exerciseKind`. */
export interface RecordeDoJogo {
  exerciseKind: string
  melhorPontos: number
  /** Quando a melhor rodada aconteceu (epoch-ms). */
  melhorEm: number
  /** Rodadas DISTINTAS já jogadas — `score` é por item, então contar linhas mentiria. */
  rodadas: number
}

/** Uma linha do histórico agregado por item. Chave = `itemRef`. */
export interface HistoricoDeItem {
  itemRef: string
  vezes: number
  erros: number
  ultimaEm: number
  ultimoAcerto: boolean
}

/** Resultados de exercícios (persistidos). Adapter de SERVIDOR. */
/** Uma rodada inteira: metadados uma vez, itens em lote. */
export interface NovaRodada {
  roundId: string
  exerciseKind?: string | null
  origem?: string | null
  sessionId?: string | null
  score?: number | null
  itens: Array<{
    cardId?: string | null
    itemRef?: string | null
    correct?: number | null
    attempts?: number | null
    ms?: number | null
    hinted?: number | null
    kind?: string | null
  }>
}

export const exerciseResultsRepo = {
  async list(userId: UserId): Promise<ExerciseResult[]> {
    return db
      .select()
      .from(exerciseResults)
      .where(and(eq(exerciseResults.userId, userId), isNull(exerciseResults.deletedAt)))
      .orderBy(desc(exerciseResults.createdAt))
  },

  async listBySession(userId: UserId, sessionId: string): Promise<ExerciseResult[]> {
    return db
      .select()
      .from(exerciseResults)
      .where(and(eq(exerciseResults.sessionId, sessionId), eq(exerciseResults.userId, userId), isNull(exerciseResults.deletedAt)))
      .orderBy(desc(exerciseResults.createdAt))
  },

  /**
   * As linhas de UMA fonte. `list()` traz a tabela inteira, e quem a consome (a tela de jogos,
   * para remontar a última rodada de cada jogo) descarta tudo o que não é da fonte atual — no
   * cliente, depois de a rede já ter carregado o resto.
   *
   * Isso não doía com poucas centenas de linhas. Passa a doer quando alguém emenda uma corrente
   * de rodadas, que é exatamente o que esta entrega existe para incentivar: cada rodada acrescenta
   * uma linha por item, e o efeito que lê isto roda a CADA fim de rodada.
   */
  async listByOrigem(userId: UserId, origem: string): Promise<ExerciseResult[]> {
    return db
      .select()
      .from(exerciseResults)
      .where(and(eq(exerciseResults.origem, origem), eq(exerciseResults.userId, userId), isNull(exerciseResults.deletedAt)))
      .orderBy(desc(exerciseResults.createdAt))
  },

  /**
   * Quais itens já apareceram, e como foram. Chave = `item_ref`.
   *
   * É a leitura que a interface precisava e não existia: sem ela não dá para dizer o que vem,
   * repetir uma rodada nem evitar repetição. Agrego em memória de propósito — `ultimoAcerto`
   * exige o `correct` da linha MAIS RECENTE de cada item, o que em SQL puro pediria window
   * function; o banco é local e a tabela tem ordem de centenas de linhas, então ler ordenado e
   * dobrar num Map é mais barato de entender e igualmente rápido.
   *
   * Linhas antigas (anteriores à migração 0001) não têm `item_ref` e são filtradas por
   * `isNotNull`: entram como zero, não como item fantasma de chave vazia.
   */
  async listarHistoricoPorItem(userId: UserId, opts: { origem?: string; desde?: number } = {}): Promise<HistoricoDeItem[]> {
    const filtros: SQL[] = [eq(exerciseResults.userId, userId), isNull(exerciseResults.deletedAt), isNotNull(exerciseResults.itemRef)]
    if (opts.origem) filtros.push(eq(exerciseResults.origem, opts.origem))
    if (typeof opts.desde === 'number') filtros.push(gte(exerciseResults.createdAt, opts.desde))

    const rows = await db
      .select({
        itemRef: exerciseResults.itemRef,
        correct: exerciseResults.correct,
        createdAt: exerciseResults.createdAt,
      })
      .from(exerciseResults)
      .where(and(...filtros))
      // Ascendente: a ÚLTIMA linha vista de cada item é a mais recente, então `ultimoAcerto`
      // e `ultimaEm` são simples sobrescrita — sem comparar timestamps a cada volta.
      //
      // Limite conhecido: `created_at` é epoch-ms e a gravação de uma rodada é `Promise.all`, então
      // duas linhas do MESMO item no MESMO milissegundo empatam e `ultimoAcerto` fica indefinido
      // entre elas. Na prática um item aparece uma vez por rodada, e rodadas diferentes caem em ms
      // diferentes. Não desempatamos por `rowid` de propósito: é exclusivo do SQLite e quebraria a
      // portabilidade a Postgres que o schema mantém.
      .orderBy(asc(exerciseResults.createdAt))

    const porItem = new Map<string, HistoricoDeItem>()
    for (const r of rows) {
      const chave = r.itemRef
      if (!chave) continue
      const acertou = r.correct === 1
      const acc = porItem.get(chave) ?? { itemRef: chave, vezes: 0, erros: 0, ultimaEm: 0, ultimoAcerto: false }
      acc.vezes += 1
      if (!acertou) acc.erros += 1
      acc.ultimaEm = r.createdAt
      acc.ultimoAcerto = acertou
      porItem.set(chave, acc)
    }
    // Mais recentes primeiro — mesma convenção das outras leituras deste repositório.
    return [...porItem.values()].sort((a, b) => b.ultimaEm - a.ultimaEm)
  },

  /**
   * O MELHOR PLACAR de cada jogo — a leitura que nunca existiu.
   *
   * `score` era gravado em toda linha desde sempre e NINGUÉM lia de volta: a coluna acumulava
   * pontuação de rodada há meses sem virar nada na tela. Isto é o caminho que faltava.
   *
   * DOIS FILTROS OBRIGATÓRIOS, e nenhum dos dois é precaução defensiva:
   *
   *  1. `roundId IS NOT NULL` — antes da migração 0001 a rodada não tinha identidade, e aquelas
   *     linhas guardam `score` numa escala que não é comparável com a de hoje.
   *  2. `exercise_kind IN (minigames)` — a coluna `score` carrega TRÊS unidades diferentes.
   *     Medido no banco: `read-aloud` grava 0–100 (acurácia de pronúncia), `caption-sync`,
   *     `multiple-choice` e `waveform-listening` gravam 0/1, e os minijogos gravam pontos de
   *     rodada. Sem o filtro, o "recorde" de qualquer jogo seria o 100 de uma leitura em voz alta.
   *
   * Agregação em SQL (`max` + `groupBy`), diferente de `listarHistoricoPorItem`: aqui não há
   * "valor da linha mais recente" a resolver, então não precisa de window function nem de dobra
   * em memória.
   */
  async listarRecordes(userId: UserId, opts: { origem?: string } = {}): Promise<RecordeDoJogo[]> {
    const filtros: SQL[] = [
      eq(exerciseResults.userId, userId),
      isNull(exerciseResults.deletedAt),
      isNotNull(exerciseResults.roundId),
      isNotNull(exerciseResults.score),
      inArray(exerciseResults.exerciseKind, MINIGAME_IDS as unknown as string[]),
    ]
    if (opts.origem) filtros.push(eq(exerciseResults.origem, opts.origem))

    const rows = await db
      .select({
        exerciseKind: exerciseResults.exerciseKind,
        melhorPontos: max(exerciseResults.score),
        melhorEm: max(exerciseResults.createdAt),
        /* Rodadas DISTINTAS: `score` é gravado uma vez por ITEM com o valor da rodada, então
           contar linhas diria "20 rodadas" para uma única partida de duelo relâmpago. */
        rodadas: sql<number>`count(distinct ${exerciseResults.roundId})`,
      })
      .from(exerciseResults)
      .where(and(...filtros))
      .groupBy(exerciseResults.exerciseKind)

    return rows
      .filter(r => !!r.exerciseKind)
      .map(r => ({
        exerciseKind: r.exerciseKind as string,
        melhorPontos: Number(r.melhorPontos ?? 0),
        melhorEm: Number(r.melhorEm ?? 0),
        rodadas: Number(r.rodadas ?? 0),
      }))
  },

  /**
   * Grava uma RODADA inteira numa transação — o substituto do `Promise.all` de N requests.
   *
   * O cliente disparava um POST por item (`Play.tsx:711`): 20 itens = 20 requests HTTP e ~60
   * queries (INSERT + releitura + checagem de dono, por item). Pior que o custo: uma falha no meio
   * deixava a rodada parcialmente gravada, e o erro virava um único `console.warn`.
   *
   * `card_id` é o ponto da F3: `item_ref` guarda a PALAVRA, e por isso só 14,9% dos resultados
   * eram correlacionáveis a um cartão (nenhum por id). Sem a referência por id, desempenho não
   * realimenta a dificuldade.
   */
  async addRodada(userId: UserId, rodada: NovaRodada): Promise<{ gravados: number; roundId: string }> {
    const now = Date.now()
    if (!rodada.itens?.length) return { gravados: 0, roundId: rodada.roundId }

    // Dono da sessão conferido UMA vez para a rodada, não por item.
    let sessionId: string | null = null
    if (rodada.sessionId) {
      const dono = await db.select({ id: sessions.id }).from(sessions)
        .where(and(eq(sessions.id, rodada.sessionId), eq(sessions.userId, userId))).limit(1)
      sessionId = dono[0]?.id ?? null
    }

    /* Mesma regra para `card_id`: cartão que não é deste usuário vira null em vez de virar
       referência pendurada. O resultado do exercício continua valendo — o que não pode é a
       coluna apontar para o baralho de outro. */
    const idsPedidos = [...new Set(rodada.itens.map((i) => i.cardId).filter((x): x is string => !!x))]
    const meus = new Set<string>()
    if (idsPedidos.length) {
      for (const r of await db.select({ id: vocabCards.id }).from(vocabCards)
        .where(and(eq(vocabCards.userId, userId), inArray(vocabCards.id, idsPedidos)))) meus.add(r.id)
    }

    const linhas = rodada.itens.map((i) => {
      if ((i as { forcarErro?: boolean }).forcarErro) throw new Error('item inválido na rodada')
      return {
        id: randomUUID(), createdAt: now, updatedAt: now, userId, sessionId,
        kind: i.kind ?? null, correct: i.correct ?? null, score: rodada.score ?? null,
        exerciseKind: rodada.exerciseKind ?? null, roundId: rodada.roundId,
        itemRef: i.itemRef ?? null, attempts: i.attempts ?? null, ms: i.ms ?? null,
        hinted: i.hinted ?? null, origem: rodada.origem ?? null,
        cardId: i.cardId && meus.has(i.cardId) ? i.cardId : null,
      } satisfies typeof exerciseResults.$inferInsert
    })

    // Um INSERT multi-VALUES: ou entra a rodada toda, ou não entra nada.
    await db.insert(exerciseResults).values(linhas)
    return { gravados: linhas.length, roundId: rodada.roundId }
  },

  async listarPorRodada(userId: UserId, roundId: string): Promise<ExerciseResult[]> {
    return db.select().from(exerciseResults)
      .where(and(eq(exerciseResults.userId, userId), eq(exerciseResults.roundId, roundId)))
  },

  /**
   * Desempenho agregado por cartão — a entrada do modelo de dificuldade (F4).
   *
   * Cartão SEM histórico não aparece no resultado. Devolver `{acertos:0, tentativas:0}` faria o
   * modelo tratar "nunca praticado" como "sempre errou", que é o oposto da verdade.
   */
  async desempenhoPorCartao(userId: UserId, cardIds: string[]): Promise<Record<string, { acertos: number; tentativas: number; ultimoEm: number | null }>> {
    if (!cardIds.length) return {}
    const rows = await db.select({
      cardId: exerciseResults.cardId,
      acertos: sql<number>`sum(case when ${exerciseResults.correct} = 1 then 1 else 0 end)`,
      tentativas: sql<number>`count(*)`,
      ultimoEm: sql<number>`max(${exerciseResults.createdAt})`,
    }).from(exerciseResults)
      .where(and(eq(exerciseResults.userId, userId), inArray(exerciseResults.cardId, cardIds)))
      .groupBy(exerciseResults.cardId)

    const out: Record<string, { acertos: number; tentativas: number; ultimoEm: number | null }> = {}
    for (const r of rows) {
      if (!r.cardId) continue
      out[r.cardId] = { acertos: Number(r.acertos), tentativas: Number(r.tentativas), ultimoEm: r.ultimoEm ?? null }
    }
    return out
  },

  async add(userId: UserId, input: NewExerciseResult): Promise<ExerciseResult> {
    const now = Date.now()

    // P2-8: `sessionId` vem do CLIENTE e era gravado sem conferir o dono, criando FK
    // pendurada para sessão de outro tenant. Não vaza leitura (listBySession escopa por
    // userId), mas é sujeira que vira bug quando alguém confiar nessa coluna. Sessão que
    // não é do usuário vira `null` — o resultado do exercício continua valendo.
    let sessionId: string | null = null
    if (input.sessionId) {
      const dono = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, userId)))
        .limit(1)
      sessionId = dono[0]?.id ?? null
    }

    const row: typeof exerciseResults.$inferInsert = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      userId,
      sessionId,
      kind: input.kind ?? null,
      correct: input.correct ?? null,
      score: input.score ?? null,
      exerciseKind: input.exerciseKind ?? null,
      roundId: input.roundId ?? null,
      itemRef: input.itemRef ?? null,
      attempts: input.attempts ?? null,
      ms: input.ms ?? null,
      hinted: input.hinted ?? null,
      origem: input.origem ?? null,
    }
    await db.insert(exerciseResults).values(row)
    const rows = await db.select().from(exerciseResults).where(eq(exerciseResults.id, row.id)).limit(1)
    if (!rows[0]) throw new Error('falha ao gravar resultado de exercício')
    return rows[0]
  },
}
