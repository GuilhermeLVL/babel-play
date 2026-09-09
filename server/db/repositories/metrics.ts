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
import { diaLocal, sequencias, marcosDeSequencia, minutosPremiados } from '../../../src/core/learning/economia'
import { MINIGAMES } from '../../../src/core/minigames/types'
import { economiaRepo } from './economia'
import { economiaDeMetricas } from '../../../src/core/learning/xp'
import { historicoDeXp, type BaldeDeXp, type HistoricoDeXp } from '../../../src/core/learning/historicoDeXp'
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
    db
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        wordCount: sessions.wordCount,
        durationMs: sessions.durationMs,
        /* Uma coluna a mais na varredura que já acontecia — é o que a conquista "Poliglota"
         precisava, e ela nunca disparava na conta logada por falta deste dado. */
        sourceLang: sessions.sourceLang,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.deletedAt))),
    /* `vocab_cards` tem 34 colunas e o perfil lê treze. As que ficam de fora incluem `sentence`,
       `cloze_prompt` e `cloze_answer` — frases inteiras, por cartão, em todo o acervo. */
    db
      .select({
        id: vocabCards.id,
        word: vocabCards.word,
        sessionId: vocabCards.sessionId,
        createdAt: vocabCards.createdAt,
        addedAt: vocabCards.addedAt,
        inDeck: vocabCards.inDeck,
        dueAt: vocabCards.dueAt,
        stability: vocabCards.stability,
        difficulty: vocabCards.difficulty,
        lapses: vocabCards.lapses,
        lastReview: vocabCards.lastReview,
        cefrLevel: vocabCards.cefrLevel,
        cefrConfidence: vocabCards.cefrConfidence,
      })
      .from(vocabCards)
      .where(and(eq(vocabCards.userId, userId), isNull(vocabCards.deletedAt))),
    /* SÓ AS COLUNAS QUE ESTA FUNÇÃO LÊ (auditoria de 2026-09-07, seção 5).
       Era `select()`, ou seja, `SELECT *`. Em `utterances` isso traz `source_text` e
       `translated_text` — o transcrito INTEIRO de todas as sessões da pessoa — para contar
       palavras e somar duração de fala. Num acervo de tamanho real são megabytes lidos do disco,
       serializados pelo driver e descartados depois de um `split(/\s+/)`. As cinco colunas abaixo
       são exatamente as que o laço usa. */
    db
      .select({
        cardId: reviewLogs.cardId,
        createdAt: reviewLogs.createdAt,
        reviewedAt: reviewLogs.reviewedAt,
        grade: reviewLogs.grade,
      })
      .from(reviewLogs)
      .where(eq(reviewLogs.userId, userId)),
    db
      .select({
        sessionId: utterances.sessionId,
        source: utterances.source,
        sourceText: utterances.sourceText,
        tStartMs: utterances.tStartMs,
        tEndMs: utterances.tEndMs,
      })
      .from(utterances)
      .where(and(eq(utterances.userId, userId), isNull(utterances.deletedAt))),
    // `exercise_results` existia e NINGUÉM lia — por isso o XP dos exercícios nunca chegava
    // ao perfil. É a tabela que fecha a ponte, sem precisar de nenhuma nova.
    db
      .select({
        createdAt: exerciseResults.createdAt,
        correct: exerciseResults.correct,
        kind: exerciseResults.kind,
        exerciseKind: exerciseResults.exerciseKind,
        origem: exerciseResults.origem,
        roundId: exerciseResults.roundId,
      })
      .from(exerciseResults)
      .where(and(eq(exerciseResults.userId, userId), isNull(exerciseResults.deletedAt))),
  ])

  const sess = sessionId ? sessTodas.filter((s) => s.id === sessionId) : sessTodas
  const cards = sessionId ? cardsTodos.filter((c) => c.sessionId === sessionId) : cardsTodos
  const utts = sessionId ? uttsTodas.filter((u) => u.sessionId === sessionId) : uttsTodas
  /* Ligação por cartão: um log de revisão pertence à sessão de onde o cartão veio. */
  const idsDeCartao = new Set(cards.map((c) => c.id))
  const logsNoEscopo = sessionId ? logs.filter((l) => idsDeCartao.has(l.cardId)) : logs
  const drillsNoEscopo = sessionId ? drills.filter((d) => (d.origem ?? '') === `sessao:${sessionId}`) : drills

  const inDeck = cards.filter((c) => c.inDeck !== 0)
  const wordsCaptured = sess.reduce((n, s) => n + (s.wordCount ?? 0), 0)

  /**
   * ATIVO × PASSIVO (spec progresso-de-idioma): `utterances.source` distingue a VOZ do usuário
   * ('mic') do áudio que ele ouviu ('tab') — e a soma antiga misturava os dois, então o "tempo de
   * fala" incluía o YouTube. Agora os dois tempos existem separados, `speakingMs` é SÓ o mic, e o
   * WPM (ritmo da fala do usuário) só conta palavras que ELE disse. Falas antigas sem `source`
   * caem em passivo: inflar o tempo ativo seria o erro pior.
   */
  let speakingMs = 0
  let listeningMs = 0
  let timedWords = 0
  for (const u of utts) {
    const a = u.tStartMs,
      b = u.tEndMs
    if (a == null || b == null || b <= a) continue
    if (u.source === 'mic') {
      speakingMs += b - a
      timedWords += (u.sourceText ?? '').trim().split(/\s+/).filter(Boolean).length
    } else {
      listeningMs += b - a
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
  /* "Nunca agendado" (dueAt null) NÃO é "vencido" — são coisas diferentes. Antes,
     `(c.dueAt ?? 0) <= now` tratava um cartão que nunca foi revisado nem uma vez como se
     estivesse atrasado desde epoch, inflando `dueToday`. Esse número vai para um banner global da
     tela de jogos ("N pedindo revisão") que já mente por ESCOPO (conta fora do deck selecionado,
     achado de outra auditoria) — mas ao menos a SEMÂNTICA para de mentir aqui: só conta quem tem
     data marcada E essa data já passou. */
  const dueToday = inDeck.filter((c) => c.dueAt != null && c.dueAt <= now).length

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

  /**
   * PALAVRAS DIFÍCEIS (spec progresso-de-idioma): o schema grava lapses, difficulty (FSRS) e o
   * grade de cada revisão há meses — e nada agregava. O ranking pesa o que o usuário ERRA:
   * lapses (esquecimentos, o sinal mais forte), dificuldade FSRS e a fração de notas ruins.
   * Só entra cartão com >= 2 revisões: com menos, "difícil" seria chute — a base vai junto.
   */
  const logsPorCartao = new Map<string, { total: number; ruins: number }>()
  for (const l of logsNoEscopo) {
    const r = logsPorCartao.get(l.cardId) ?? { total: 0, ruins: 0 }
    r.total += 1
    if ((l.grade ?? 0) < 3) r.ruins += 1
    logsPorCartao.set(l.cardId, r)
  }
  const palavrasDificeis = inDeck
    .map((c) => {
      const logs = logsPorCartao.get(c.id) ?? { total: 0, ruins: 0 }
      const lapses = c.lapses ?? 0
      const fsrsDif = c.difficulty ?? 0 // FSRS: 1..10
      const fracRuim = logs.total > 0 ? logs.ruins / logs.total : 0
      return {
        cardId: c.id,
        word: c.word ?? '',
        lapses,
        revisoes: logs.total,
        fracaoDeErro: Math.round(fracRuim * 100) / 100,
        // Peso: cada lapse vale muito; erro recente e dificuldade FSRS desempatam.
        pontuacao: lapses * 3 + fracRuim * 2 + fsrsDif / 10,
      }
    })
    .filter((x) => x.word && x.revisoes >= 2 && x.pontuacao > 0.5)
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .slice(0, 12)

  // Acerto por TIPO de exercício — o dado existia linha a linha em exercise_results.
  const porTipo = new Map<string, { total: number; certos: number }>()
  for (const d of drillsNoEscopo) {
    if (d.correct == null || !d.exerciseKind) continue
    const r = porTipo.get(d.exerciseKind) ?? { total: 0, certos: 0 }
    r.total += 1
    if (d.correct > 0) r.certos += 1
    porTipo.set(d.exerciseKind, r)
  }
  const acertoPorExercicio = [...porTipo.entries()]
    .map(([kind, r]) => ({ kind, total: r.total, acerto: Math.round((r.certos / r.total) * 100) }))
    .filter((x) => x.total >= 3) // menos que isso é anedota, não taxa
    .sort((a, b) => a.acerto - b.acerto)
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
  const cromasComprados = await seedSpendsRepo.cromasComprados(userId)
  const aprimoramentos = await seedSpendsRepo.aprimoramentosComprados(userId)
  /* B4 fechada (economia-de-creditos 1.2): a posse da Loja viaja no perfil, derivada do log de
     compras — o cliente hidrata o espelho local a partir daqui em vez de confiar só nele. */
  const itensComprados = await seedSpendsRepo.itensComprados(userId)

  /* ECONOMIA v2 (A7): os créditos avulsos e a presença agora existem no servidor real. O cliente
     (`deriveProgress`) já lia estes campos com `?? 0` — a paridade é com o servidor efêmero. */
  const { seedsCreditadas, xpCreditado } = await economiaRepo.totaisCreditados(userId)
  const diasDePresenca = await economiaRepo.diasDePresenca(userId)
  const seqPresenca = sequencias(diasDePresenca, diaLocal(now))

  /**
   * OS TRÊS CONTADORES QUE FALTAVAM — e por que eles passaram a importar.
   *
   * `docs/economia-v2.md` registrou como follow-up "os mesmos agregados em
   * server/db/repositories/metrics.ts", e ficou. Enquanto o saldo era calculado só no navegador
   * (`src/lib/progress.ts`), a ausência custava pouco: o cliente tratava como `?? 0` e a conta
   * fechava com um ganho subestimado. A partir do momento em que o SERVIDOR passa a recusar um
   * gasto por saldo insuficiente, subestimar o ganho vira recusar compra legítima — a ausência
   * deixa de ser imprecisão e passa a ser defeito.
   *
   * O cálculo é o do servidor efêmero (`src/data/efemero/servidor.ts`), que é a implementação de
   * referência em uso: os mesmos ajudantes puros do core, sobre as mesmas linhas.
   */
  const sequencias7 = marcosDeSequencia(diasDePresenca, 7)

  // Minutos de captura por DIA LOCAL — o teto diário vive no core (`minutosPremiados`), e é ele
  // que impede uma gravação de oito horas de virar Seeds de oito horas.
  const minutosPorDia = new Map<number, number>()
  /* DOIS números, e não um: o PREMIADO paga Seeds (com teto diário) e o TOTAL é o que a conquista
     "Ouvinte" conta ("some 60 minutos de sessão gravada"). O servidor emitia só o premiado, então
     `m.capturaMinutos` chegava indefinido a `progresso()` e a conquista ficava presa em zero para
     sempre — quem gravasse 60 minutos num dia só via o teto diário engolir a diferença. */
  let capturaMinutos = 0
  for (const x of sess) {
    const min = (x.durationMs ?? 0) / 60_000
    if (min <= 0) continue
    capturaMinutos += min
    const d = diaLocal(x.createdAt)
    minutosPorDia.set(d, (minutosPorDia.get(d) ?? 0) + min)
  }
  const capturaMinutosPremiados = Math.floor(minutosPremiados(minutosPorDia.values()))

  /* Idiomas distintos das sessões — a conquista "Poliglota". Mesma conta do modo sem conta
     (`src/data/efemero/servidor.ts`): `sourceLang` não nulo, contado uma vez. `sess` já está
     escopado, então dentro de uma sessão o número é 1, que é a resposta certa. */
  const idiomas = new Set(sess.map((x) => x.sourceLang).filter((l): l is string => !!l)).size

  /* Rodada perfeita = todos os itens certos E tamanho ≥ mínimo do jogo. Sem o piso, uma rodada de
     um item só viraria fábrica de "perfeitas" — e cada uma vale 5 Seeds e 15 XP. */
  const porRodada = new Map<string, { kind: string | null; total: number; certos: number }>()
  for (const e of drillsNoEscopo) {
    if (!e.roundId) continue
    const r = porRodada.get(e.roundId) ?? { kind: e.exerciseKind, total: 0, certos: 0 }
    r.total += 1
    if ((e.correct ?? 0) > 0) r.certos += 1
    porRodada.set(e.roundId, r)
  }
  let rodadasPerfeitas = 0
  for (const r of porRodada.values()) {
    /* Com `r.kind === ''` o `&&` devolve a própria string vazia, e o `>=` a coage para 0. O
       `Number()` reproduz EXATAMENTE essa coerção e tira o `string` do tipo de `minimo`. */
    const minimo = Number(
      (r.kind && (MINIGAMES as Record<string, { minItems?: number } | undefined>)[r.kind]?.minItems) ?? 3,
    )
    if (r.total >= minimo && r.certos === r.total) rodadasPerfeitas += 1
  }

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
    // A ofensiva exibida é a MAIOR entre revisar e aparecer — mesma regra do efêmero.
    streakDays: Math.max(streakDays, seqPresenca.atual),
    seedsGastas,
    itensComprados,
    cromasComprados,
    aprimoramentos,
    seedsCreditadas,
    xpCreditado,
    presencas: diasDePresenca.length,
    sequencias7,
    capturaMinutos: Math.round(capturaMinutos),
    capturaMinutosPremiados,
    idiomas,
    rodadasPerfeitas,
    streakPresenca: seqPresenca.atual,
    maiorSequenciaPresenca: seqPresenca.maior,
    avgStability,
    avgRetention,
    avgRetentionConfidence: retentions.length >= 4 ? 0.7 : retentions.length > 0 ? 0.3 : 0,
    vocabByWeek,
    speakingMs,
    listeningMs,
    palavrasDificeis,
    acertoPorExercicio,
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
 * O QUE ELA COBRE, E O QUE NÃO (corrigido em 01/09 — o texto abaixo afirmava uma igualdade que o
 * código não cumpre, e afirmar invariante que não existe é pior do que não ter invariante):
 *
 *   · ENTRA, porque cada evento tem carimbo próprio: sessões e as palavras delas, revisões e
 *     acertos (`review_logs.reviewedAt`), itens de jogo (`exercise_results.createdAt`).
 *   · NÃO ENTRA: o XP de conquista (`seed_credits.xp`), presença, marcos de sequência e rodadas
 *     perfeitas. Os dois primeiros TÊM carimbo e caberiam; os dois últimos são agregados
 *     derivados, e situá-los no tempo exige decidir em que dia um marco "acontece".
 *
 * A CONSEQUÊNCIA HONESTA: o último ponto do gráfico fica ABAIXO do XP que o distintivo mostra,
 * pela soma dos termos de fora. O gráfico responde "quando eu subi de nível?", que é a pergunta
 * dele; o número do distintivo continua sendo `deriveProgress` sobre `computeProfile`. Igualar os
 * dois é trabalho de uma mudança própria — e enquanto não for feito, isto fica escrito.
 *
 * A RESSALVA, que a tela deve repetir: isto é reconstrução SOB A FÓRMULA ATUAL, não um livro-razão.
 * Mudar os pesos reescreve o passado. É aceitável porque é a mesma propriedade que o número de hoje
 * sempre teve; o que não seria aceitável é fingir um registro histórico que não existe.
 *
 * POR QUE FORA DE `computeProfile`: aquela função já faz cinco varreduras de tabela inteira e roda
 * a cada mudança de `recordings.length` e a cada gasto de seeds. O custo desta aqui tem de ser
 * opt-in da tela que desenha o gráfico.
 */
/* A CURVA E OS TIPOS DELA VIVEM NO CORE desde 07/09 (`src/core/learning/historicoDeXp.ts`).
 *
 * A agregação era daqui, e o modo sem conta não tinha `/api/metrics/xp`: a aba de Progresso levava
 * um 501 e o gráfico ficava vazio para quem estuda sem conta. Copiá-la para o servidor efêmero
 * resolveria a tela e criaria a segunda verdade — setenta linhas de "some evento por balde" que
 * concordariam só enquanto ninguém mexesse numa delas.
 *
 * O que ficou aqui é o que só o servidor sabe fazer: LER as três tabelas. A fórmula é do core. */
export type { BaldeDeXp, PontoDeXp, MarcoDeNivel, HistoricoDeXp } from '../../../src/core/learning/historicoDeXp'

export async function computeXpHistory(
  userId: UserId,
  opts: { balde?: BaldeDeXp; desde?: number } = {},
): Promise<HistoricoDeXp> {
  const [sess, logs, drills] = await Promise.all([
    db
      .select({ createdAt: sessions.createdAt, wordCount: sessions.wordCount })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.deletedAt))),
    db
      .select({ createdAt: reviewLogs.createdAt, reviewedAt: reviewLogs.reviewedAt, grade: reviewLogs.grade })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), isNull(reviewLogs.deletedAt))),
    db
      .select({ createdAt: exerciseResults.createdAt, kind: exerciseResults.kind, correct: exerciseResults.correct })
      .from(exerciseResults)
      .where(and(eq(exerciseResults.userId, userId), isNull(exerciseResults.deletedAt))),
  ])

  return historicoDeXp(
    {
      sessoes: sess.map((s) => ({ em: s.createdAt, palavras: s.wordCount ?? 0 })),
      revisoes: logs.map((l) => ({ em: l.reviewedAt ?? l.createdAt, certa: (l.grade ?? 0) >= 3 })),
      /* `kind === 'drill'` é o mesmo discriminador de `computeProfile`, e pelo mesmo motivo: um item
       que gravou nota no agendador JÁ está em `revisoes`; contá-lo de novo inflaria a curva. */
      itensDeJogo: drills
        .filter((d) => d.kind === 'drill')
        .map((d) => ({ em: d.createdAt, certo: (d.correct ?? 0) > 0 })),
    },
    opts,
  )
}

/**
 * A ECONOMIA DO USUÁRIO, no servidor — a metade que faltava para o gasto poder ser recusado e o
 * crédito poder ser conferido.
 *
 * Até 01/09 saldo e nível só existiam no navegador (`src/lib/progress.ts`), e as duas rotas de
 * moeda gravavam o que o cliente mandasse: dava para gastar o que não se tinha e para creditar
 * uma conquista que não aconteceu. Um cliente adulterado não tem botão desabilitado.
 *
 * A fórmula é a MESMA do cliente — `xpDeEventos` e `seedsGanhasDeEventos`, do core, sobre as
 * mesmas métricas. Duas fórmulas para o mesmo número é como o saldo do servidor e o da tela
 * passariam a discordar.
 */
export async function economiaDoUsuario(userId: UserId): Promise<{
  metricas: AppMetrics
  nivel: number
  ganhas: number
  gastas: number
  saldo: number
}> {
  const m = await computeProfile(userId)
  /* O mapeamento métrica → evento vive no core (`economiaDeMetricas`). Ele estava escrito aqui e
     de novo em `src/lib/progress.ts`, campo a campo — duas cópias que concordavam só enquanto
     ninguém acrescentasse um evento. */
  const { nivel, ganhas, gastas, saldo } = economiaDeMetricas(m)
  return { metricas: m, nivel, ganhas, gastas, saldo }
}
