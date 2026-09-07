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

/**
 * O melhor placar já feito num jogo, numa fonte. Chave = `exerciseKind`.
 *
 * O TIPO É UM SÓ, importado do core: o cliente (`src/data/api.ts`) declarava a sua própria cópia
 * com três campos a mais (`melhorCombo`, `precisao`, `ultimaEm`) que o servidor não devolvia — e
 * `montarContextoDeConquistas` lia `r.melhorCombo ?? 0` de um campo que nunca vinha. Duas cópias
 * de um contrato são duas oportunidades de discordar sobre ele.
 */
export type { RecordeDoJogo } from '../../../src/core/learning/contract'
import type { RecordeDoJogo } from '../../../src/core/learning/contract'

/** Uma linha do histórico agregado por item. Chave = `itemRef`. */
export interface HistoricoDeItem {
  itemRef: string
  vezes: number
  erros: number
  ultimaEm: number
  ultimoAcerto: boolean
  /** Erros consecutivos contados do fim (0 se a última foi acerto). */
  errosSeguidos: number
  /** Rodadas distintas do MESMO jogo já jogadas depois da última linha errada. */
  rodadasDesdeUltimoErro: number
}

/** A linha crua que a agregação consome — só as colunas que ela precisa. */
export interface LinhaDeResultado {
  itemRef: string | null
  correct: number | null
  createdAt: number
  roundId: string | null
  exerciseKind: string | null
}

/**
 * AGREGA O HISTÓRICO POR ITEM — e os dois últimos campos são o que fazia falta.
 *
 * `core/learning/memoriaDeItens.ts` define a régua de retorno do erro (1º → 2 rodadas; 2º → 4;
 * 3º → amanhã; 4º → leech, que sai do sorteio comum). Ela lê `errosSeguidos` e
 * `rodadasDesdeUltimoErro`. O servidor efêmero (modo sem conta) sempre os calculou; ESTE, que
 * atende quem tem conta, nunca — e a ausência não degradava para "sem informação", degradava para
 * o pior caso possível:
 *
 *   · `estadoDoItem` cai no fallback `min(erros, 1)`, que trava em 1. Com `LEECH_APOS = 4`,
 *     nenhuma palavra virava leech: a rodada de resgate era inalcançável.
 *   · `prontoParaVoltar` lê `rodadasDesdeUltimoErro ?? Infinity`, e `Infinity >= 2` é sempre
 *     verdadeiro. A palavra errada voltava na PRIMEIRA camada da rodada seguinte, para sempre.
 *
 * Pura e exportada de propósito: é a regra que merece teste, e testá-la não deve exigir um banco.
 *
 * `linhas` precisa vir em ordem ASCENDENTE de `createdAt` — é o que torna `ultimoAcerto` e a
 * contagem de seguidos uma simples varredura.
 */
export function agregarHistorico(linhas: LinhaDeResultado[]): HistoricoDeItem[] {
  interface Acc extends HistoricoDeItem { ultimoErroEm: number; jogoDoUltimoErro: string | null }
  const porItem = new Map<string, Acc>()
  for (const r of linhas) {
    const chave = r.itemRef
    if (!chave) continue
    const acertou = r.correct === 1
    const acc = porItem.get(chave) ?? {
      itemRef: chave, vezes: 0, erros: 0, ultimaEm: 0, ultimoAcerto: false,
      errosSeguidos: 0, rodadasDesdeUltimoErro: 0, ultimoErroEm: 0, jogoDoUltimoErro: null,
    }
    acc.vezes += 1
    if (acertou) {
      // Um acerto ZERA a escada: a régua é sobre erros SEGUIDOS, não sobre erros na vida.
      acc.errosSeguidos = 0
    } else {
      acc.erros += 1
      acc.errosSeguidos += 1
      acc.ultimoErroEm = r.createdAt
      acc.jogoDoUltimoErro = r.exerciseKind
    }
    acc.ultimaEm = r.createdAt
    acc.ultimoAcerto = acertou
    porItem.set(chave, acc)
  }

  /* Rodadas depois do erro: `roundId` DISTINTO do mesmo jogo. Distinto porque uma rodada grava uma
     linha por item — sem deduplicar, uma única rodada de 8 itens contaria como oito e a janela de
     2 venceria na hora. Por jogo porque a régua é por jogo: jogar Memória não devolve ao Termo a
     palavra que se errou nele. */
  for (const acc of porItem.values()) {
    if (!acc.ultimoErroEm) continue
    const rodadas = new Set<string>()
    for (const r of linhas) {
      if (r.roundId && r.exerciseKind === acc.jogoDoUltimoErro && r.createdAt > acc.ultimoErroEm) rodadas.add(r.roundId)
    }
    acc.rodadasDesdeUltimoErro = rodadas.size
  }

  // Mais recentes primeiro — mesma convenção das outras leituras deste repositório.
  return [...porItem.values()]
    .sort((a, b) => b.ultimaEm - a.ultimaEm)
    .map(({ ultimoErroEm: _a, jogoDoUltimoErro: _b, ...h }) => h)
}

/** Resultados de exercícios (persistidos). Adapter de SERVIDOR. */
/** Uma rodada inteira: metadados uma vez, itens em lote. */
export interface NovaRodada {
  roundId: string
  exerciseKind?: string | null
  origem?: string | null
  sessionId?: string | null
  score?: number | null
  /** Combo máximo da rodada. Vira `exercise_results.combo` em todas as linhas dela. */
  melhorSequencia?: number | null
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
        // As duas colunas que a régua de retorno do erro precisa — ver `agregarHistorico`.
        roundId: exerciseResults.roundId,
        exerciseKind: exerciseResults.exerciseKind,
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

    return agregarHistorico(rows)
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
        /* `max` ignora NULL: as rodadas anteriores à migração 0025 não empurram o recorde para
           zero, elas simplesmente não participam dele. */
        melhorCombo: max(exerciseResults.combo),
        /* Precisão sobre os itens que TÊM resposta. `correct` é anulável (jogos de frase não
           respondem certo/errado por item) e contar essas linhas rebaixaria a precisão de quem
           joga karaokê. */
        certos: sql<number>`sum(case when ${exerciseResults.correct} = 1 then 1 else 0 end)`,
        respondidos: sql<number>`sum(case when ${exerciseResults.correct} is null then 0 else 1 end)`,
        ultimaEm: max(exerciseResults.createdAt),
      })
      .from(exerciseResults)
      .where(and(...filtros))
      .groupBy(exerciseResults.exerciseKind)

    return rows
      .filter(r => !!r.exerciseKind)
      .map(r => {
        const respondidos = Number(r.respondidos ?? 0)
        return {
          exerciseKind: r.exerciseKind as string,
          melhorPontos: Number(r.melhorPontos ?? 0),
          melhorEm: Number(r.melhorEm ?? 0),
          rodadas: Number(r.rodadas ?? 0),
          melhorCombo: Number(r.melhorCombo ?? 0),
          precisao: respondidos > 0 ? Math.round((Number(r.certos ?? 0) / respondidos) * 100) : null,
          ultimaEm: Number(r.ultimaEm ?? 0),
        }
      })
  },

  /**
   * O COMBO MÁXIMO POR JOGO — a leitura que a conquista "Duelista" pedia.
   *
   * Separada de `listarRecordes` de propósito: aquela é a resposta de uma ROTA, com filtro de
   * origem e o corte por `score` não nulo; esta é a entrada de uma REGRA, e um combo feito numa
   * rodada sem placar continua sendo um combo. Reaproveitar a outra faria a conquista depender de
   * um filtro escrito para outra pergunta.
   */
  async melhorComboPorJogo(userId: UserId): Promise<Record<string, number>> {
    const rows = await db
      .select({
        exerciseKind: exerciseResults.exerciseKind,
        melhorCombo: max(exerciseResults.combo),
      })
      .from(exerciseResults)
      .where(and(
        eq(exerciseResults.userId, userId),
        isNull(exerciseResults.deletedAt),
        isNotNull(exerciseResults.combo),
      ))
      .groupBy(exerciseResults.exerciseKind)

    const out: Record<string, number> = {}
    for (const r of rows) if (r.exerciseKind) out[r.exerciseKind] = Number(r.melhorCombo ?? 0)
    return out
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
        combo: rodada.melhorSequencia ?? null,
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
