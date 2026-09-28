/**
 * Métricas computadas de DADOS REAIS (metrics-pipeline). Agrega sessions/vocab/
 * review_logs. Princípio "honestidade como tipo": números de contagem são
 * `deterministic`; retenção é `probabilistic` (estimativa FSRS) e carrega
 * `confidence` que cai com amostra pequena. A UI não deve exibir falsa precisão.
 */
import { and, count, eq, isNotNull, isNull, sql } from 'drizzle-orm'

import type { AppMetrics } from '../../../src/core/learning/contract'
import {
  diaNumeroNoFuso,
  FUSO_PADRAO,
  fusoOuPadrao,
  marcosDeSequencia,
  palavrasPremiadas,
  sequencias,
} from '../../../src/core/learning/economia'
import { type BaldeDeXp, type HistoricoDeXp, historicoDeXp, type LinhasDoHistorico } from '../../../src/core/learning/historicoDeXp'
import { retrievability } from '../../../src/core/learning/scheduler'
import { economiaDeMetricas, sessaoRendeXp } from '../../../src/core/learning/xp'
import { ehRodadaPerfeita } from '../../../src/core/minigames/grade'
import { numeroDoDia, ofensivaComCongelamento } from '../../../src/core/missoes'
import type { UserId } from '../../lib/authContext'
import { CachePorVersao } from '../../lib/cachePorVersao'
import { db } from '../db'
import { lerCompacto } from '../leituraCompacta'
import { exerciseResults, reviewLogs, sessions, vocabCards } from '../schema'
import { economiaRepo } from './economia'
import { estadoDaContaRepo } from './estadoDaConta'
import { seedSpendsRepo } from './seedSpends'
import { versoesRepo } from './versoes'

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
 * AS LINHAS QUE `computeProfile` VARRE — as cinco tabelas da atividade, só com as colunas lidas.
 *
 * É a parte cara do perfil (fix/rotas-caras, medido em 3.000 cartões: ~55 dos ~70 ms eram o driver
 * materializando estas linhas). Por isso ela é separada do cálculo e só roda quando a versão de
 * `atividade` (`versoes_de_dados`) mudou desde a última vez.
 */
async function lerAtividade(userId: UserId) {
  // Marco 1: todo scan é escopado por userId. reviewLogs, que não tinha filtro nenhum, passa a
  // filtrar por user_id (o review() carimba o dono no log).
  /* LEITURA COMPACTA (fix/rotas-caras): as mesmas cinco consultas — mesmo WHERE, mesmas colunas,
     mesma ordem —, serializadas pelo SQLite numa célula só em vez de um objeto do driver por
     linha (ver `server/db/leituraCompacta.ts`; ~2,5x menos CPU na leitura). */
  const [sessTodas, cardsTodos, logs, uttsTodas, drills] = await Promise.all([
    /* `source_lang`: uma coluna a mais na varredura que já acontecia — é o que a conquista
       "Poliglota" precisava, e ela nunca disparava na conta logada por falta deste dado. */
    lerCompacto<{
      id: string
      createdAt: number
      wordCount: number | null
      durationMs: number | null
      sourceLang: string | null
    }>(
      [
        ['id', 'id', 'texto'],
        ['createdAt', 'created_at'],
        ['wordCount', 'word_count'],
        ['durationMs', 'duration_ms'],
        ['sourceLang', 'source_lang', 'texto'],
      ],
      { tabela: 'sessions', onde: sql`user_id = ${userId} AND deleted_at IS NULL` },
    ),
    /* `vocab_cards` tem 34 colunas e o perfil lê treze. As que ficam de fora incluem `sentence`,
       `cloze_prompt` e `cloze_answer` — frases inteiras, por cartão, em todo o acervo. */
    lerCompacto<{
      id: string
      word: string
      sessionId: string | null
      createdAt: number
      addedAt: number | null
      inDeck: number | null
      dueAt: number | null
      stability: number | null
      difficulty: number | null
      lapses: number | null
      lastReview: number | null
      cefrLevel: string | null
      cefrConfidence: number | null
    }>(
      [
        ['id', 'id', 'texto'],
        ['word', 'word', 'texto'],
        ['sessionId', 'session_id', 'texto'],
        ['createdAt', 'created_at'],
        ['addedAt', 'added_at'],
        ['inDeck', 'in_deck'],
        ['dueAt', 'due_at'],
        ['stability', 'stability'],
        ['difficulty', 'difficulty'],
        ['lapses', 'lapses'],
        ['lastReview', 'last_review'],
        ['cefrLevel', 'cefr_level', 'texto'],
        ['cefrConfidence', 'cefr_confidence'],
      ],
      { tabela: 'vocab_cards', onde: sql`user_id = ${userId} AND deleted_at IS NULL` },
    ),
    /* SÓ AS COLUNAS QUE ESTA FUNÇÃO LÊ (auditoria de 2026-09-07, seção 5). Era `SELECT *`, e em
       `utterances` isso trazia o transcrito INTEIRO (`source_text` e `translated_text`) para contar
       palavras e somar duração de fala. */
    lerCompacto<{ cardId: string; createdAt: number; reviewedAt: number | null; grade: number | null }>(
      [
        ['cardId', 'card_id', 'texto'],
        ['createdAt', 'created_at'],
        ['reviewedAt', 'reviewed_at'],
        ['grade', 'grade'],
      ],
      { tabela: 'review_logs', onde: sql`user_id = ${userId}` },
    ),
    lerCompacto<{
      sessionId: string
      source: string | null
      sourceText: string | null
      tStartMs: number | null
      tEndMs: number | null
    }>(
      [
        ['sessionId', 'session_id', 'texto'],
        ['source', 'source', 'texto'],
        ['sourceText', 'source_text', 'texto'],
        ['tStartMs', 't_start_ms'],
        ['tEndMs', 't_end_ms'],
      ],
      { tabela: 'utterances', onde: sql`user_id = ${userId} AND deleted_at IS NULL` },
    ),
    // `exercise_results` existia e NINGUÉM lia — por isso o XP dos exercícios nunca chegava
    // ao perfil. É a tabela que fecha a ponte, sem precisar de nenhuma nova.
    lerCompacto<{
      createdAt: number
      correct: number | null
      kind: string | null
      exerciseKind: string | null
      origem: string | null
      roundId: string | null
    }>(
      [
        ['createdAt', 'created_at'],
        ['correct', 'correct'],
        ['kind', 'kind', 'texto'],
        ['exerciseKind', 'exercise_kind', 'texto'],
        ['origem', 'origem', 'texto'],
        ['roundId', 'round_id', 'texto'],
      ],
      { tabela: 'exercise_results', onde: sql`user_id = ${userId} AND deleted_at IS NULL` },
    ),
  ])
  return { sessTodas, cardsTodos, logs, uttsTodas, drills }
}

type LinhasDaAtividade = Awaited<ReturnType<typeof lerAtividade>>

/**
 * O PERFIL SEM O RELÓGIO: tudo o que sai das cinco tabelas e NÃO depende de `now`, já calculado,
 * mais o mínimo que a parte dependente do relógio precisa (vencimentos, estabilidades, carimbos
 * de revisão). É isto que o cache guarda — dezenas de KB por usuário em vez das linhas.
 *
 * O cálculo é o de antes, na mesma ordem: as somas de ponto flutuante (`avgStability`,
 * `levelConfidence`, `avgRetention`) percorrem os cartões na ordem em que o banco os devolve,
 * então o resultado é o mesmo número, bit a bit. `tests/integration/rotas-caras-equivalencia`
 * compara o JSON inteiro com o gravado antes desta divisão.
 */
/**
 * `fuso`: o fuso GRAVADO do usuário (revisão de 27/09, P2). Dia de prática, ofensiva, marcos e o
 * teto diário de palavras contam no dia de quem estuda — `diaLocal` usava o fuso do PROCESSO, e o
 * servidor em UTC fechava o dia de quem está em São Paulo às 21h.
 */
function resumirAtividade(linhas: LinhasDaAtividade, sessionId: string | null, fuso: string) {
  const { sessTodas, cardsTodos, logs, uttsTodas, drills } = linhas
  const sess = sessionId ? sessTodas.filter((s) => s.id === sessionId) : sessTodas
  const cards = sessionId ? cardsTodos.filter((c) => c.sessionId === sessionId) : cardsTodos
  const utts = sessionId ? uttsTodas.filter((u) => u.sessionId === sessionId) : uttsTodas
  /* Ligação por cartão: um log de revisão pertence à sessão de onde o cartão veio. */
  const idsDeCartao = new Set(cards.map((c) => c.id))
  const logsNoEscopo = sessionId ? logs.filter((l) => idsDeCartao.has(l.cardId)) : logs
  const drillsNoEscopo = sessionId ? drills.filter((d) => (d.origem ?? '') === `sessao:${sessionId}`) : drills

  const inDeck = cards.filter((c) => c.inDeck !== 0)
  const wordsCaptured = sess.reduce((n, s) => n + (s.wordCount ?? 0), 0)
  /* SÓ SESSÃO COM PALAVRA SALVA RENDE XP (revisão de 27/09, `sessaoRendeXp` no core). */
  const salvasPorSessao = new Map<string, number>()
  for (const c of inDeck) if (c.sessionId) salvasPorSessao.set(c.sessionId, (salvasPorSessao.get(c.sessionId) ?? 0) + 1)
  const sessoesComPalavraSalva = sess.filter((x) => sessaoRendeXp(salvasPorSessao.get(x.id) ?? 0)).length

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
     data marcada E essa data já passou. `dueToday` depende do relógio: aqui ficam só as datas. */
  const vencimentos = inDeck.filter((c) => c.dueAt != null).map((c) => c.dueAt as number)

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

  /* A RETENÇÃO depende do relógio (dias desde a última revisão). Guardam-se os dois insumos por
     cartão, na ordem do deck — a média é somada nessa mesma ordem em `montarPerfil`. `lastReview`
     falsy (null ou 0) vira 0, e 0 é tratado como "sem revisão" lá, como `c.lastReview ? … : 0`. */
  const comEstabilidade = inDeck.filter((c) => c.stability != null)
  const retencao = {
    estabilidade: Float64Array.from(comEstabilidade, (c) => c.stability as number),
    ultimaRevisao: Float64Array.from(comEstabilidade, (c) => c.lastReview || 0),
  }

  // Streak: dias consecutivos (a partir de hoje) com ao menos uma revisão. O conjunto de dias não
  // depende do relógio; a contagem a partir de hoje, sim (fica em `montarPerfil`).
  const reviewDays = new Set(logsNoEscopo.map((l) => new Date(l.reviewedAt ?? l.createdAt).toDateString()))
  /* `revisoesRecentes` é um recorte POR TEMPO dos mesmos carimbos: guardá-los já ordenados e
     filtrar depois dá o mesmo array que filtrar e ordenar (a ordem de números iguais é a mesma). */
  const temposDeRevisao = logsNoEscopo.map((l) => l.reviewedAt ?? l.createdAt).sort((a, b) => a - b)

  /* Minutos TOTAIS de captura — a conquista "Ouvinte" ("some 60 minutos de sessão gravada") e a
     estatística. Desde as recompensas v2 (27/09) minuto gravado NÃO paga Seeds nem XP: premiar
     tempo é o que o Decreto 12.880/2026, art. 9º, chama de incentivo compulsivo. */
  let capturaMinutos = 0
  for (const x of sess) {
    const min = (x.durationMs ?? 0) / 60_000
    if (min > 0) capturaMinutos += min
  }

  /* PALAVRAS SALVAS DA CAPTURA por DIA LOCAL (recompensas v2): cartão do caderno que nasceu de uma
     sessão. O teto diário vive no core (`palavrasPremiadas`) — é ele que impede uma importação de
     300 palavras de virar 300 Seeds. */
  const palavrasPorDia = new Map<number, number>()
  /* Os carimbos das mesmas palavras: a missão "salvar N palavras" conta no dia do FUSO do usuário. */
  const temposDePalavraSalva: number[] = []
  for (const c of inDeck) {
    if (!c.sessionId) continue
    const t = c.addedAt ?? c.createdAt
    const d = diaNumeroNoFuso(t, fuso)
    palavrasPorDia.set(d, (palavrasPorDia.get(d) ?? 0) + 1)
    temposDePalavraSalva.push(t)
  }
  temposDePalavraSalva.sort((a, b) => a - b)
  const palavrasSalvasPremiadas = palavrasPremiadas(palavrasPorDia.values())

  /* DIAS DE PRÁTICA (recompensas v2): revisão, rodada de jogo ou palavra salva. É a unidade da
     ofensiva e dos marcos de 7 dias — abrir o app, sozinho, não entra mais. */
  const diasDePratica = new Set<number>(palavrasPorDia.keys())
  for (const l of logsNoEscopo) diasDePratica.add(diaNumeroNoFuso(l.reviewedAt ?? l.createdAt, fuso))
  for (const e of drillsNoEscopo) if (e.roundId) diasDePratica.add(diaNumeroNoFuso(e.createdAt, fuso))

  /* Carimbos dos ACERTOS (revisão certa ou item de jogo certo), ordenados: a meta do dia é
     conferida sobre eles, no fuso do usuário, na parte que depende do relógio. */
  const temposDeAcerto: number[] = []
  for (const l of logsNoEscopo) if ((l.grade ?? 0) >= 3) temposDeAcerto.push(l.reviewedAt ?? l.createdAt)
  for (const d of drillsNoEscopo) if (d.kind === 'drill' && (d.correct ?? 0) > 0) temposDeAcerto.push(d.createdAt)
  temposDeAcerto.sort((a, b) => a - b)

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
  /* A régua é a do core (`ehRodadaPerfeita`), a mesma que a raspadinha usa para prometer o bônus. */
  for (const r of porRodada.values()) if (ehRodadaPerfeita(r.kind, r.total, r.certos)) rodadasPerfeitas += 1

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
    sessoesComPalavraSalva,
    wordsCaptured,
    deckSize: inDeck.length,
    newCards,
    reviews,
    correctReviews,
    drillItems,
    drillCorrect,
    accuracy,
    capturaMinutos,
    palavrasSalvasPremiadas,
    diasDePratica: [...diasDePratica].sort((a, b) => a - b),
    idiomas,
    rodadasPerfeitas,
    avgStability,
    vocabByWeek,
    speakingMs,
    listeningMs,
    palavrasDificeis,
    acertoPorExercicio,
    wpm,
    uniqueWords,
    levelDistribution,
    levelConfidence,
    // Os insumos da parte que depende do relógio.
    vencimentos: Float64Array.from(vencimentos),
    retencao,
    reviewDays,
    temposDeRevisao: Float64Array.from(temposDeRevisao),
    temposDeAcerto: Float64Array.from(temposDeAcerto),
    temposDePalavraSalva: Float64Array.from(temposDePalavraSalva),
  }
}

type ResumoDaAtividade = ReturnType<typeof resumirAtividade>

/** Bytes aproximados de um resumo — o "peso" que o cache usa para respeitar o teto de memória. */
function pesoDoResumo(r: ResumoDaAtividade): number {
  return (
    4096 +
    8 *
      (r.vencimentos.length +
        2 * r.retencao.estabilidade.length +
        r.temposDeRevisao.length +
        r.temposDeAcerto.length +
        r.temposDePalavraSalva.length) +
    8 * r.diasDePratica.length +
    32 * r.reviewDays.size +
    256 * (r.palavrasDificeis.length + r.vocabByWeek.length)
  )
}

/**
 * O CACHE DO RESUMO DA CONTA INTEIRA, por usuário e versão de `atividade`.
 *
 * Só o escopo GLOBAL entra: é o que roda "a cada mudança da lista de gravações e a cada gasto de
 * seeds", na conferência de posse de `PUT /api/settings` e em `gastar`. O escopo de sessão é a aba
 * de métricas de uma gravação — raro, e continua lendo as linhas na hora.
 *
 * Tetos: 512 usuários e ~48 MB. Um usuário pesado (3.000 cartões, 1.000 revisões) pesa ~60 KB.
 */
const resumosDaConta = new CachePorVersao<ResumoDaAtividade>(512, 48 * 1024 * 1024)

/**
 * O RAZÃO DE MOEDAS E A PRESENÇA — pequeno, e por isso lido SEMPRE, fora do cache.
 *
 * `seed_spends`, `seed_credits` e `presencas` não disparam a versão de `atividade`: um gasto de
 * Seeds não muda nenhuma das cinco tabelas grandes, e é justamente o caso de `gastar`, que lê a
 * economia logo depois de escrever no razão. Deixar estas três leituras fora do cache é o que faz
 * o gasto nunca ver saldo velho sem precisar invalidar o resumo.
 */
async function lerRazao(userId: UserId) {
  /* O outro lado da moeda. Vem de uma tabela de eventos, e não de contagem derivada: gasto que
     se recalcula não é gasto — voltaria ao valor cheio no próximo carregamento.
     B4 fechada (economia-de-creditos 1.2): a posse da Loja viaja no perfil, derivada do log de
     compras — o cliente hidrata o espelho local a partir daqui em vez de confiar só nele. */
  const gastos = await seedSpendsRepo.razao(userId)
  /* ECONOMIA v2 (A7): os créditos avulsos e a presença agora existem no servidor real. O cliente
     (`deriveProgress`) já lia estes campos com `?? 0` — a paridade é com o servidor efêmero. */
  /* Os dias com meta creditada (recompensas v2, onda 5) rendem o congelamento da ofensiva; vêm
     na mesma consulta dos totais, para o perfil não pagar uma leitura a mais. */
  const { diasDeMeta, ...creditos } = await economiaRepo.totaisEMetas(userId)
  const diasDePresenca = await economiaRepo.diasDePresenca(userId)
  return { gastos, creditos, diasDePresenca, diasDeMeta }
}

/**
 * A OFENSIVA COM CONGELAMENTO: dias de prática e dias de meta creditada, no core
 * (`ofensivaComCongelamento`). Derivada no servidor, nunca guardada: um dia perdido gasta o
 * congelamento sozinho, e nada aqui se compra.
 */
function ofensivaDoResumo(r: ResumoDaAtividade, diasDeMeta: readonly string[], now: number, fuso: string) {
  return ofensivaComCongelamento({
    diasDePratica: r.diasDePratica,
    diasDeMeta: diasDeMeta.map(numeroDoDia).filter((d): d is number => d !== null),
    hoje: diaNumeroNoFuso(now, fuso),
  })
}

/** As linhas de hoje, o razão e o relógio viram o `AppMetrics` — a forma e a ordem de sempre. */
function montarPerfil(
  r: ResumoDaAtividade,
  razao: Awaited<ReturnType<typeof lerRazao>>,
  now: number,
  escopo: AppMetrics['escopo'],
  fuso: string,
): AppMetrics {
  let dueToday = 0
  for (const t of r.vencimentos) if (t <= now) dueToday++

  const { estabilidade, ultimaRevisao } = r.retencao
  let somaRetencao = 0
  for (let i = 0; i < estabilidade.length; i++) {
    const ultima = ultimaRevisao[i]
    const t = ultima ? Math.max(0, (now - ultima) / DAY) : 0
    somaRetencao += retrievability(t, estabilidade[i])
  }
  const considerados = estabilidade.length
  const avgRetention = considerados ? somaRetencao / considerados : 0

  let streakDays = 0
  const cursor = new Date()
  for (let i = 0; i < 3650; i++) {
    if (r.reviewDays.has(cursor.toDateString())) streakDays++
    else break
    cursor.setDate(cursor.getDate() - 1)
  }

  const { seedsGastas, itensComprados, cromasComprados } = razao.gastos
  const { seedsCreditadas, xpCreditado } = razao.creditos
  const diasDePresenca = razao.diasDePresenca
  /* A OFENSIVA CONTA PRÁTICA (recompensas v2): os dias de presença continuam gravados, só como
     estatística — abrir o app não estende sequência nem paga marco. */
  const seqPratica = sequencias(r.diasDePratica, diaNumeroNoFuso(now, fuso))
  /* O congelamento só estende: sem meta creditada o número é o de antes. */
  const comCongelamento = ofensivaDoResumo(r, razao.diasDeMeta, now, fuso)

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
  const sequencias7 = marcosDeSequencia(r.diasDePratica, 7)

  const limiteRecente = now - 8 * DAY
  const revisoesRecentes: number[] = []
  for (const t of r.temposDeRevisao) if (t >= limiteRecente) revisoesRecentes.push(t)
  const limiteDeAcerto = now - 3 * DAY
  const acertosRecentes: number[] = []
  for (const t of r.temposDeAcerto) if (t >= limiteDeAcerto) acertosRecentes.push(t)

  return {
    sessions: r.sessions,
    sessoesComPalavraSalva: r.sessoesComPalavraSalva,
    wordsCaptured: r.wordsCaptured,
    deckSize: r.deckSize,
    newCards: r.newCards,
    dueToday,
    reviews: r.reviews,
    correctReviews: r.correctReviews,
    drillItems: r.drillItems,
    drillCorrect: r.drillCorrect,
    accuracy: r.accuracy,
    accuracyConfidence: r.reviews >= 4 ? 0.9 : r.reviews > 0 ? 0.4 : 0,
    // A ofensiva exibida conta DIAS DE PRÁTICA — mesma regra do efêmero.
    streakDays: Math.max(streakDays, seqPratica.atual, comCongelamento.atual),
    seedsGastas,
    itensComprados,
    cromasComprados,
    seedsCreditadas,
    xpCreditado,
    presencas: diasDePresenca.length,
    sequencias7,
    capturaMinutos: Math.round(r.capturaMinutos),
    palavrasSalvasPremiadas: r.palavrasSalvasPremiadas,
    acertosRecentes,
    idiomas: r.idiomas,
    rodadasPerfeitas: r.rodadasPerfeitas,
    streakPresenca: seqPratica.atual,
    maiorSequenciaPresenca: seqPratica.maior,
    avgStability: r.avgStability,
    avgRetention,
    avgRetentionConfidence: considerados >= 4 ? 0.7 : considerados > 0 ? 0.3 : 0,
    /* Cópias rasas: o resumo é do cache e é compartilhado entre requisições; quem receber o
       perfil e mexer num array não pode alterar a resposta da próxima. */
    vocabByWeek: r.vocabByWeek.map((x) => ({ ...x })),
    revisoesRecentes,
    speakingMs: r.speakingMs,
    listeningMs: r.listeningMs,
    palavrasDificeis: r.palavrasDificeis.map((x) => ({ ...x })),
    acertoPorExercicio: r.acertoPorExercicio.map((x) => ({ ...x })),
    wpm: r.wpm,
    wpmConfidence: r.speakingMs >= 60_000 ? 0.7 : r.speakingMs > 0 ? 0.4 : 0,
    uniqueWords: r.uniqueWords,
    levelDistribution: r.levelDistribution.map((x) => ({ ...x })),
    levelConfidence: r.levelConfidence,
    asOf: now,

    escopo,
    /**
     * A BASE das métricas de retenção: `retentions` só inclui cartões com estabilidade FSRS.
     * É este par que permite a UI dizer "calculado sobre 149 de 1.902" ao lado do número, em vez
     * de deixar a ressalva como nota de rodapé em cinza — que era como o painel "Requer Atenção"
     * anunciava quatro palavras calculadas sobre 8% do acervo.
     */
    base: { considerados, total: r.deckSize },
  }
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
 *
 * CUSTO (fix/rotas-caras): a leitura das cinco tabelas é a parte cara (medido: ~70 ms de CPU com
 * 3.000 cartões, event loop preso o tempo todo pelo driver). No escopo da conta, o resumo delas
 * fica em cache enquanto a versão de `atividade` não muda (`versoes_de_dados`, mantida por
 * gatilho); a requisição seguinte lê o fuso gravado, a versão, o razão de moedas e a presença —
 * cinco consultas pequenas (o fuso entrou na revisão de 27/09: os dias de prática são do fuso de
 * quem estuda, e ele é a outra metade da chave do cache) — e refaz só a parte do relógio.
 */
export async function computeProfile(userId: UserId, opts: OpcoesDePerfil = {}): Promise<AppMetrics> {
  const now = Date.now()
  const sessionId = opts.sessionId ?? null
  const escopo: AppMetrics['escopo'] = sessionId ? 'sessao' : 'global'
  const fuso = await fusoDoPerfil(userId)
  const resumo = sessionId
    ? resumirAtividade(await lerAtividade(userId), sessionId, fuso)
    : await resumoDaConta(userId, fuso)
  return montarPerfil(resumo, await lerRazao(userId), now, escopo, fuso)
}

/** O fuso gravado do usuário (só leitura), ou o padrão — `decidirFuso` é de quem grava. */
async function fusoDoPerfil(userId: UserId): Promise<string> {
  const { fuso } = await estadoDaContaRepo.fusoGravado(userId)
  return fuso ? fusoOuPadrao(fuso) : FUSO_PADRAO
}

/** O resumo da conta inteira, do cache quando a versão de `atividade` (e o fuso) não mudou. */
async function resumoDaConta(userId: UserId, fuso: string): Promise<ResumoDaAtividade> {
  // A versão ANTES das linhas — ver `CachePorVersao` para o porquê da ordem. O fuso entra na
  // chave: os dias de prática do resumo são contados nele.
  const versao = `${(await versoesRepo.de(userId)).atividade}|${fuso}`
  let resumo = resumosDaConta.obter(userId, versao)
  if (!resumo) {
    resumo = resumirAtividade(await lerAtividade(userId), null, fuso)
    resumosDaConta.guardar(userId, versao, resumo, pesoDoResumo(resumo))
  }
  return resumo
}

/**
 * O QUE AS MISSÕES DO DIA LEEM (recompensas v2, onda 5) — `GET /api/metrics/missoes` e a
 * conferência do crédito `meta:<dia>`. Carimbos de revisão e de palavra salva dos últimos 3 dias
 * (a janela da meta é hoje ou ontem, em qualquer fuso), as metas já creditadas e a ofensiva com
 * congelamento. As rodadas vêm de `exerciseResultsRepo.linhasDeMaestria`.
 */
export async function dadosDasMissoes(
  userId: UserId,
  fuso: string,
): Promise<{
  revisoes: number[]
  palavrasSalvas: number[]
  metasCreditadas: string[]
  ofensiva: { atual: number; congelamentos: 0 | 1 | 2 }
}> {
  const now = Date.now()
  const [resumo, metasCreditadas] = await Promise.all([
    resumoDaConta(userId, fuso),
    economiaRepo.metasCreditadas(userId),
  ])
  const desde = now - 3 * DAY
  const recentes = (xs: Float64Array) => Array.from(xs).filter((t) => t >= desde)
  const { atual, congelamentos } = ofensivaDoResumo(resumo, metasCreditadas, now, fuso)
  return {
    revisoes: recentes(resumo.temposDeRevisao),
    palavrasSalvas: recentes(resumo.temposDePalavraSalva),
    metasCreditadas,
    ofensiva: { atual, congelamentos },
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
export type { BaldeDeXp, HistoricoDeXp, MarcoDeNivel, PontoDeXp } from '../../../src/core/learning/historicoDeXp'

export async function computeXpHistory(
  userId: UserId,
  opts: { balde?: BaldeDeXp; desde?: number } = {},
): Promise<HistoricoDeXp> {
  return historicoDeXp(await linhasDoHistoricoDeXp(userId), opts)
}

/**
 * As linhas com carimbo que a curva de XP soma — também o que a TEMPORADA soma, só que dentro da
 * janela dela (`xpDeTemporada`, do core). Uma leitura, dois leitores.
 */
export async function linhasDoHistoricoDeXp(userId: UserId): Promise<LinhasDoHistorico> {
  const [sess, salvas, logs, drills] = await Promise.all([
    db
      .select({ id: sessions.id, createdAt: sessions.createdAt, wordCount: sessions.wordCount })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.deletedAt))),
    /* As palavras salvas por sessão — só a sessão com palavra salva rende XP (`sessaoRendeXp`). */
    db
      .select({ sessionId: vocabCards.sessionId, n: count() })
      .from(vocabCards)
      .where(
        and(
          eq(vocabCards.userId, userId),
          isNull(vocabCards.deletedAt),
          isNotNull(vocabCards.sessionId),
          sql`coalesce(${vocabCards.inDeck}, 1) <> 0`,
        ),
      )
      .groupBy(vocabCards.sessionId),
    db
      .select({ createdAt: reviewLogs.createdAt, reviewedAt: reviewLogs.reviewedAt, grade: reviewLogs.grade })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), isNull(reviewLogs.deletedAt))),
    db
      .select({ createdAt: exerciseResults.createdAt, kind: exerciseResults.kind, correct: exerciseResults.correct })
      .from(exerciseResults)
      .where(and(eq(exerciseResults.userId, userId), isNull(exerciseResults.deletedAt))),
  ])

  return {
    sessoes: sess.map((s) => ({
      em: s.createdAt,
      palavras: s.wordCount ?? 0,
      palavrasSalvas: Number(salvas.find((x) => x.sessionId === s.id)?.n ?? 0),
    })),
    revisoes: logs.map((l) => ({ em: l.reviewedAt ?? l.createdAt, certa: (l.grade ?? 0) >= 3 })),
    /* `kind === 'drill'` é o mesmo discriminador de `computeProfile`, e pelo mesmo motivo: um item
     que gravou nota no agendador JÁ está em `revisoes`; contá-lo de novo inflaria a curva. */
    itensDeJogo: drills
      .filter((d) => d.kind === 'drill')
      .map((d) => ({ em: d.createdAt, certo: (d.correct ?? 0) > 0 })),
  }
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
