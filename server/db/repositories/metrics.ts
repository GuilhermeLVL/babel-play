/**
 * Métricas computadas de DADOS REAIS (metrics-pipeline). Agrega sessions/vocab/
 * review_logs. Princípio "honestidade como tipo": números de contagem são
 * `deterministic`; retenção é `probabilistic` (estimativa FSRS) e carrega
 * `confidence` que cai com amostra pequena. A UI não deve exibir falsa precisão.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { sessions, vocabCards, reviewLogs, utterances, exerciseResults } from '../schema'
import { retrievability } from '../../../src/core/learning/scheduler'
import { xpDeEventos, nivelDoXp, type EventosDeXp } from '../../../src/core/learning/xp'
import type { AppMetrics } from '../../../src/core/learning/contract'
import { seedSpendsRepo } from './seedSpends'
import type { UserId } from '../../lib/authContext'

// M-06: `AppMetrics` agora vem do contrato único em src/core/learning/contract.ts (era duplicado
// aqui e no cliente, e já divergia). Re-exportado para não quebrar quem importava daqui.
export type { AppMetrics }

const DAY = 86_400_000
const WEEK = 7 * DAY

/** Opções de escopo. Sem `sessionId`, o comportamento é exatamente o de antes. */
export interface OpcoesDePerfil {
  /** Restringe TODAS as agregações a uma gravação. `null`/ausente = conta inteira. */
  sessionId?: string | null
}

/**
 * MÉTRICAS DO PERFIL — agora com escopo.
 *
 * Antes esta função só sabia responder "como está a conta inteira?", e a aba de métricas da
 * Sessão, sem endpoint para chamar, preenchia o vazio misturando estatística do texto com
 * `vocabByWeek` da conta — dado global dentro de um painel que anunciava uma gravação. Não era
 * possível unificar os dois componentes sem antes existir a pergunta "e só desta sessão?".
 *
 * O escopo filtra as CINCO agregações. Filtrar só algumas produziria o pior resultado possível:
 * números parcialmente escopados, que parecem coerentes e não são.
 *
 * `reviewLogs` e `exerciseResults` não têm coluna de sessão — são escopados pelos CARTÕES da
 * sessão, que é a relação real entre eles.
 */
export async function computeProfile(userId: UserId, opts: OpcoesDePerfil = {}): Promise<AppMetrics> {
  const now = Date.now()
  const sessionId = opts.sessionId ?? null
  const escopo: AppMetrics['escopo'] = sessionId ? 'sessao' : 'global'

  // Marco 1: todo scan é escopado por userId. reviewLogs, que não tinha filtro nenhum, passa a
  // filtrar por user_id (o review() carimba o dono no log).
  const [sessTodas, cardsTodos, logs, uttsTodas, drills] = await Promise.all([
    db.select().from(sessions).where(and(eq(sessions.userId, userId), isNull(sessions.deletedAt))),
    db.select().from(vocabCards).where(and(eq(vocabCards.userId, userId), isNull(vocabCards.deletedAt))),
    db.select().from(reviewLogs).where(eq(reviewLogs.userId, userId)),
    db.select().from(utterances).where(and(eq(utterances.userId, userId), isNull(utterances.deletedAt))),
    // `exercise_results` existia e NINGUÉM lia — por isso o XP dos exercícios nunca chegava
    // ao perfil. É a tabela que fecha a ponte, sem precisar de nenhuma nova.
    db.select().from(exerciseResults).where(and(eq(exerciseResults.userId, userId), isNull(exerciseResults.deletedAt))),
  ])

  const sess = sessionId ? sessTodas.filter((s) => s.id === sessionId) : sessTodas
  const cards = sessionId ? cardsTodos.filter((c) => c.sessionId === sessionId) : cardsTodos
  const utts = sessionId ? uttsTodas.filter((u) => u.sessionId === sessionId) : uttsTodas
  /* Ligação por cartão: um log de revisão pertence à sessão de onde o cartão veio. */
  const idsDeCartao = new Set(cards.map((c) => c.id))
  const logsNoEscopo = sessionId ? logs.filter((l) => idsDeCartao.has(l.cardId)) : logs
  const drillsNoEscopo = sessionId
    ? drills.filter((d) => (d.origem ?? '') === `sessao:${sessionId}`)
    : drills

  const inDeck = cards.filter((c) => c.inDeck !== 0)
  const wordsCaptured = sess.reduce((n, s) => n + (s.wordCount ?? 0), 0)

  // Tempo de fala real: soma das durações dos enunciados com timing válido.
  let speakingMs = 0
  for (const u of utts) {
    const a = u.tStartMs, b = u.tEndMs
    if (a != null && b != null && b > a) speakingMs += b - a
  }
  // Palavras faladas nos enunciados com timing (para um WPM coerente com o tempo medido).
  let timedWords = 0
  for (const u of utts) {
    if (u.tStartMs != null && u.tEndMs != null && u.tEndMs > u.tStartMs) {
      timedWords += (u.sourceText ?? '').trim().split(/\s+/).filter(Boolean).length
    }
  }
  const speakingMin = speakingMs / 60_000
  const wpm = speakingMin > 0 ? Math.round(timedWords / speakingMin) : 0

  // Palavras distintas no deck.
  const uniqueWords = new Set(inDeck.map((c) => (c.word ?? '').toLowerCase()).filter(Boolean)).size

  // Distribuição por nível CEFR (estimativa) das cartas do deck.
  const levelOrder = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  const levelMap = new Map<string, number>()
  for (const c of inDeck) {
    const lvl = c.cefrLevel ?? 'N/D'
    levelMap.set(lvl, (levelMap.get(lvl) ?? 0) + 1)
  }
  const levelDistribution = [...levelMap.entries()]
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level))
  // Confiança média das estimativas de nível (baixa por construção).
  const lvlConfs = inDeck.map((c) => c.cefrConfidence).filter((x): x is number => x != null)
  const levelConfidence = lvlConfs.length ? lvlConfs.reduce((a, b) => a + b, 0) / lvlConfs.length : 0
  const newCards = inDeck.filter((c) => c.stability == null).length
  const dueToday = inDeck.filter((c) => (c.dueAt ?? 0) <= now).length

  /**
   * Itens de exercício/minigame que NÃO viraram revisão de SRS. O discriminador `kind` evita a
   * DUPLA CONTAGEM: um item que gravou nota no agendador já é contado em `reviews` — contá-lo
   * aqui também inflaria o XP e tornaria a curva de nível ruído.
   */
  const drillRows = drillsNoEscopo.filter((d) => d.kind === 'drill')
  const drillItems = drillRows.length
  const drillCorrect = drillRows.filter((d) => (d.correct ?? 0) > 0).length

  const reviews = logsNoEscopo.length
  const correctReviews = logsNoEscopo.filter((l) => (l.grade ?? 0) >= 3).length
  const accuracy = reviews > 0 ? correctReviews / reviews : 0

  const stabilities = inDeck.map((c) => c.stability).filter((s): s is number => s != null)
  const avgStability = stabilities.length ? stabilities.reduce((a, b) => a + b, 0) / stabilities.length : 0

  const retentions = inDeck
    .filter((c) => c.stability != null)
    .map((c) => {
      const t = c.lastReview ? Math.max(0, (now - c.lastReview) / DAY) : 0
      return retrievability(t, c.stability as number)
    })
  const avgRetention = retentions.length ? retentions.reduce((a, b) => a + b, 0) / retentions.length : 0

  // Streak: dias consecutivos (a partir de hoje) com ao menos uma revisão.
  const reviewDays = new Set(logsNoEscopo.map((l) => new Date(l.reviewedAt ?? l.createdAt).toDateString()))
  let streakDays = 0
  const cursor = new Date()
  for (let i = 0; i < 3650; i++) {
    if (reviewDays.has(cursor.toDateString())) streakDays++
    else break
    cursor.setDate(cursor.getDate() - 1)
  }

  /* O outro lado da moeda. Vem de uma tabela de eventos, e não de contagem derivada: gasto que
     se recalcula não é gasto — voltaria ao valor cheio no próximo carregamento. */
  const seedsGastas = await seedSpendsRepo.totalGasto(userId)

  const byWeek = new Map<number, number>()
  for (const c of inDeck) {
    const t = c.addedAt ?? c.createdAt
    const wk = Math.floor(t / WEEK) * WEEK
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1)
  }
  const vocabByWeek = [...byWeek.entries()]
    .map(([weekStart, count]) => ({ weekStart, count }))
    .sort((a, b) => a.weekStart - b.weekStart)

  return {
    sessions: sess.length,
    wordsCaptured,
    deckSize: inDeck.length,
    newCards,
    dueToday,
    reviews,
    correctReviews,
    drillItems,
    drillCorrect,
    accuracy,
    accuracyConfidence: reviews >= 4 ? 0.9 : reviews > 0 ? 0.4 : 0,
    streakDays,
    seedsGastas,
    avgStability,
    avgRetention,
    avgRetentionConfidence: retentions.length >= 4 ? 0.7 : retentions.length > 0 ? 0.3 : 0,
    vocabByWeek,
    speakingMs,
    wpm,
    wpmConfidence: speakingMs >= 60_000 ? 0.7 : speakingMs > 0 ? 0.4 : 0,
    uniqueWords,
    levelDistribution,
    levelConfidence,
    asOf: now,

    escopo,
    /**
     * A BASE das métricas de retenção: `retentions` só inclui cartões com estabilidade FSRS.
     * É este par que permite a UI dizer "calculado sobre 149 de 1.902" ao lado do número, em vez
     * de deixar a ressalva como nota de rodapé em cinza — que era como o painel "Requer Atenção"
     * anunciava quatro palavras calculadas sobre 8% do acervo.
     */
    base: { considerados: retentions.length, total: inDeck.length },
  }
}

/**
 * A CURVA DE XP AO LONGO DO TEMPO — reconstruída, não armazenada.
 *
 * O QUE ELA RESPONDE: "quando eu saí do nível 1 para o 2?". O app mostrava o nível atual e mais
 * nada; não havia como ver que se avançou, que é justamente a parte que faz progresso parecer
 * progresso.
 *
 * NÃO EXISTE TABELA DE XP, E NÃO PRECISA EXISTIR. Cada termo da fórmula tem carimbo de tempo no
 * banco: `sessions.createdAt` (a sessão e as palavras dela), `review_logs.reviewedAt` (a revisão e,
 * com `grade >= 3`, o acerto) e `exercise_results.createdAt` (os itens de jogo). Somar os eventos
 * em ordem reproduz a curva inteira.
 *
 * A INVARIANTE QUE SUSTENTA ISSO: no último balde, `xpAcumulado` é EXATAMENTE o `xp` que
 * `deriveProgress` calcula sobre `computeProfile`. Os dois usam `xpDeEventos`, do mesmo módulo.
 * Se divergirem, o gráfico e o distintivo passam a contar histórias diferentes sobre a mesma
 * pessoa — e é essa igualdade que o teste trava.
 *
 * A RESSALVA, que a tela deve repetir: isto é reconstrução SOB A FÓRMULA ATUAL, não um livro-razão.
 * Mudar os pesos reescreve o passado. É aceitável porque é a mesma propriedade que o número de hoje
 * sempre teve; o que não seria aceitável é fingir um registro histórico que não existe.
 *
 * POR QUE FORA DE `computeProfile`: aquela função já faz cinco varreduras de tabela inteira e roda
 * a cada mudança de `recordings.length` e a cada gasto de seeds. O custo desta aqui tem de ser
 * opt-in da tela que desenha o gráfico.
 */
export type BaldeDeXp = 'dia' | 'semana'

export interface PontoDeXp {
  /** Início do balde, epoch ms (meia-noite local do dia, ou do domingo da semana). */
  em: number
  xpNoPeriodo: number
  xpAcumulado: number
  nivel: number
}

export interface MarcoDeNivel {
  em: number
  nivel: number
}

export interface HistoricoDeXp {
  pontos: PontoDeXp[]
  /** "Saiu do 1 para o 2 em tal dia" — o que a pessoa pediu para ver. */
  marcos: MarcoDeNivel[]
  /** O total de hoje. Igual ao `xp` de `deriveProgress` — é a invariante desta função. */
  xpTotal: number
}

/** Meia-noite local do dia, ou o domingo da semana. Local, e não UTC: o dia é o do usuário. */
function inicioDoBalde(ts: number, balde: BaldeDeXp): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  if (balde === 'semana') d.setDate(d.getDate() - d.getDay())
  return d.getTime()
}

export async function computeXpHistory(
  userId: UserId,
  opts: { balde?: BaldeDeXp; desde?: number } = {},
): Promise<HistoricoDeXp> {
  const balde = opts.balde ?? 'dia'

  const [sess, logs, drills] = await Promise.all([
    db.select().from(sessions).where(and(eq(sessions.userId, userId), isNull(sessions.deletedAt))),
    db.select().from(reviewLogs).where(and(eq(reviewLogs.userId, userId), isNull(reviewLogs.deletedAt))),
    db.select().from(exerciseResults).where(and(eq(exerciseResults.userId, userId), isNull(exerciseResults.deletedAt))),
  ])

  /* Um acumulador por balde. Guardamos os EVENTOS, não o XP: assim `xpDeEventos` é aplicada uma vez
     só, no fim, e continua sendo a única definição da fórmula. */
  const porBalde = new Map<number, EventosDeXp>()
  const somar = (ts: number, patch: Partial<EventosDeXp>) => {
    const chave = inicioDoBalde(ts, balde)
    const atual = porBalde.get(chave) ?? { sessoes: 0, palavrasCapturadas: 0, revisoes: 0, revisoesCertas: 0, itensDeJogo: 0, itensDeJogoCertos: 0 }
    porBalde.set(chave, {
      sessoes: atual.sessoes + (patch.sessoes ?? 0),
      palavrasCapturadas: atual.palavrasCapturadas + (patch.palavrasCapturadas ?? 0),
      revisoes: atual.revisoes + (patch.revisoes ?? 0),
      revisoesCertas: atual.revisoesCertas + (patch.revisoesCertas ?? 0),
      itensDeJogo: (atual.itensDeJogo ?? 0) + (patch.itensDeJogo ?? 0),
      itensDeJogoCertos: (atual.itensDeJogoCertos ?? 0) + (patch.itensDeJogoCertos ?? 0),
    })
  }

  /* A sessão e as palavras dela caem no MESMO instante: `wordCount` mora na linha da sessão, não
     numa tabela de palavras com data própria. É a aproximação certa — as palavras foram capturadas
     naquela gravação. */
  for (const s of sess) somar(s.createdAt, { sessoes: 1, palavrasCapturadas: s.wordCount ?? 0 })

  for (const l of logs) {
    somar(l.reviewedAt ?? l.createdAt, { revisoes: 1, revisoesCertas: (l.grade ?? 0) >= 3 ? 1 : 0 })
  }

  /* `kind === 'drill'` é o mesmo discriminador de `computeProfile`, e pelo mesmo motivo: um item que
     gravou nota no agendador JÁ está em `reviews`; contá-lo de novo aqui inflaria a curva. */
  for (const d of drills) {
    if (d.kind !== 'drill') continue
    somar(d.createdAt, { itensDeJogo: 1, itensDeJogoCertos: (d.correct ?? 0) > 0 ? 1 : 0 })
  }

  const chaves = [...porBalde.keys()].sort((a, b) => a - b)

  let acumulado = 0
  let nivelAnterior = 1
  const pontos: PontoDeXp[] = []
  const marcos: MarcoDeNivel[] = []

  for (const em of chaves) {
    const xpNoPeriodo = xpDeEventos(porBalde.get(em)!)
    acumulado += xpNoPeriodo
    const nivel = nivelDoXp(acumulado)

    /* Um balde pode cruzar MAIS DE UM nível (uma maratona de estudo). Cada travessia vira um marco,
       senão a tela mostraria "subiu para o 5" sem nunca ter mencionado o 3 e o 4. */
    for (let n = nivelAnterior + 1; n <= nivel; n++) marcos.push({ em, nivel: n })
    nivelAnterior = nivel

    // O recorte por data é aplicado DEPOIS do acúmulo: o "desde" corta a visão, não a história.
    if (!opts.desde || em >= inicioDoBalde(opts.desde, balde)) {
      pontos.push({ em, xpNoPeriodo, xpAcumulado: acumulado, nivel })
    }
  }

  return { pontos, marcos, xpTotal: acumulado }
}
