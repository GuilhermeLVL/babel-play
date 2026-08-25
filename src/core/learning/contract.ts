/**
 * Contrato da capability `learning` — TIPOS agnósticos de plataforma, liftados do
 * app desktop (`../Tradutor/src/shared/learning/contract.ts`). O mapa de canais IPC
 * do Electron (`LEARNING_IPC`) foi DESCARTADO no lift (local-shaped; na web os
 * contratos viram rotas HTTP). Ver `docs/estrategia-reuso-web.md`.
 */

/** Resultado da análise IA de uma sessão (JSON estrito pedido ao LLM). */
export interface SessionAnalysis {
  /** Nível estimado do usuário no idioma alvo (ex.: "A2–B1"). */
  levelEstimate: string
  /** Resumo da conversa em 2–3 frases (pt-BR). */
  summary: string
  /** Palavras/expressões recorrentes do OUTRO idioma, com tradução. */
  recurringWords: Array<{ word: string; count: number; translation: string }>
  /** Erros/vícios do usuário com correção e explicação. */
  mistakes: Array<{ original: string; better: string; why: string }>
  /** Dicas práticas de comunicação p/ as próximas partidas. */
  tips: string[]
  /** Frases-chave úteis da conversa (original → tradução). */
  keyPhrases: Array<{ source: string; target: string }>
  /** Temas abordados na conversa, com frases representativas (debrief por temas). */
  topics: Array<{ topic: string; phrases: string[] }>
  /** Gírias/expressões/ditados detectados (learning-hub). */
  slang: Array<{ text: string; meaning: string; literal?: string; usage: string }>
  /** Notas 0–10 por habilidade (learning-agent: análise profunda). */
  skillScores: { vocabulary: number; grammar: number; fluency: number; comprehension: number }
  /** Plano de prática concreto (3–5 exercícios p/ os próximos dias). */
  practicePlan: string[]
  /** Comparação com as análises anteriores (evolução/regressão). */
  progressNote: string
}

/** Análise cacheada (no desktop era cifrada em disco; na web vai para `analyses`). */
export interface CachedAnalysis {
  sessionId: string
  analyzedAt: number
  providerId: string
  analysis: SessionAnalysis
}

/**
 * Métricas agregadas de DADOS REAIS (metrics-pipeline). Contrato ÚNICO entre o servidor
 * (`computeProfile`) e o cliente (`fetchMetrics`) — antes duplicado nos dois lados e JÁ divergindo
 * (M-06: o cliente tinha `seedsGastas?` opcional; o servidor sempre computa → obrigatório).
 * Honestidade como tipo: contagens são determinísticas; retenção é probabilística e carrega `confidence`.
 */
export interface AppMetrics {
  sessions: number
  wordsCaptured: number
  deckSize: number
  newCards: number
  dueToday: number
  reviews: number
  correctReviews: number
  /** itens de exercício/minigame que NÃO viraram revisão de SRS (evita dupla contagem). */
  drillItems: number
  drillCorrect: number
  /** grade>=3 / total (0..1) — determinístico (contagem). */
  accuracy: number
  accuracyConfidence: number
  /** dias consecutivos com revisão, a partir de hoje. */
  streakDays: number
  /** Total de seeds JÁ GASTAS. O servidor sempre computa; `deriveProgress` faz ganhas − gastas. */
  seedsGastas: number
  /** média de estabilidade FSRS (dias) das cartas revisadas. */
  avgStability: number
  /** retenção prevista média (0..1) — PROBABILÍSTICA. */
  avgRetention: number
  avgRetentionConfidence: number
  /** vocabulário adicionado por semana (para o gráfico de evolução). */
  vocabByWeek: Array<{ weekStart: number; count: number }>
  /** tempo total de fala (ms) somado dos enunciados com timing — determinístico. */
  speakingMs: number
  /** palavras por minuto (fala) — determinístico, mas confiança cai com amostra curta. */
  wpm: number
  wpmConfidence: number
  /** palavras distintas no deck (determinístico). */
  uniqueWords: number
  /** distribuição por nível CEFR das cartas do deck (ESTIMATIVA — baixa confiança). */
  levelDistribution: Array<{ level: string; count: number }>
  levelConfidence: number
  asOf: number

  /**
   * DE ONDE ESTES NÚMEROS VÊM. Sem este campo não havia como uma tela saber se estava exibindo
   * dado da conta inteira ou de uma gravação — e a aba de métricas da Sessão exibia os dois
   * misturados, sem distinção visual.
   */
  escopo: EscopoDeMetricas

  /**
   * SOBRE QUANTOS ITENS a métrica foi calculada.
   *
   * Existe porque "1.753 de 1.902 cartões ficaram FORA do cálculo" era uma frase solta, em cinza,
   * no rodapé de um painel — e o painel liderava com quatro palavras "que precisam de atenção"
   * calculadas sobre 8% do acervo. Virando campo do contrato, todo componente recebe a base e
   * pode exibi-la junto do número, em vez de depender de alguém lembrar de escrever a ressalva.
   */
  base: BaseDeCalculo
}

export type EscopoDeMetricas = 'global' | 'sessao'

export interface BaseDeCalculo {
  /** Itens que entraram no cálculo. */
  considerados: number
  /** Itens existentes no escopo. `total - considerados` é o que ficou de fora. */
  total: number
}

/** Tooltip de palavra. */
export interface WordInfo {
  word: string
  srcLang: string
  tgtLang: string
  /** Tradução isolada (cacheada). */
  translation: string
  /** Explicação opcional do LLM (significado/exemplo) — null até pedir. */
  explanation: string | null
}

/**
 * Carta de flashcard. Agendamento plugável (srs-fsrs): `box`(1..5)+`dueAt` são o
 * estado Leitner legado (sempre presente, reversível); os campos FSRS abaixo são
 * opcionais e preenchidos pelo FSRS-5 na 1ª revisão ou pela migração.
 */
export interface Flashcard {
  id: string
  front: string
  back: string
  /** Frase real da conversa de onde a palavra veio. */
  sentence: string
  srcLang: string
  tgtLang: string
  box: number
  dueAt: number
  addedAt: number
  /** Sessão de origem (deck da conversa); cartas antigas não têm. */
  sessionId?: string
  /** FSRS-5: estabilidade em dias (≈ intervalo p/ ~90% de retenção). */
  stability?: number
  /** FSRS-5: dificuldade 1..10. */
  difficulty?: number
  /** FSRS-5: nº de revisões. */
  reps?: number
  /** FSRS-5: nº de lapsos (Again). */
  lapses?: number
  /** FSRS-5: epoch ms da última revisão. */
  lastReview?: number
  /** liga o card à utterance de origem p/ frame/áudio. */
  uttId?: string
  /** caminho relativo do frame da cena. */
  frameRef?: string
  /** clipe de áudio do trecho. */
  audioRef?: { path: string; startMs: number; endMs: number }
  /** nível CEFR ESTIMADO da sentença-fonte (honesto: probabilístico + confiança). */
  cefrBadge?: CefrBadge
  /** CEFR do conteúdo multi-sentença de origem. */
  cefrEstimate?: CefrBadge
  /** lacuna da frase-contexto (gerada por makeCloze). */
  clozePrompt?: string
  /** palavra exata a preencher na lacuna. */
  clozeAnswer?: string
}

/** Bandas CEFR válidas. */
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

/** Badge de nível CEFR estimado por sentença. Honesto por tipo: nunca "nível
 *  oficial" — sempre estimativa probabilística com confiança 0..1. */
export interface CefrBadge {
  /** A1..C2. */
  level: string
  source: 'probabilistic'
  /** 0..1; cai com frases curtas (poucos tokens → menor confiança). */
  confidence: number
  /** Faixa estimada [percentil25, percentil75]. */
  range?: [CefrLevel, CefrLevel]
}

/** Anotação do usuário numa palavra. */
export interface WordNote {
  note: string
  at: number
}

/** Metadados de sessão dados pelo usuário. */
export interface SessionMeta {
  name?: string
  pinned?: boolean
  /** Imagem de capa do card. */
  coverImage?: string
}

/** Acerto por tipo de exercício + geral (practice-stats). */
export interface ExerciseTypeStat {
  kind: string
  accuracy: number
  sample: number
}
export interface ExerciseStats {
  byType: ExerciseTypeStat[]
  overall: { accuracy: number; sample: number }
}

/** Resultado de uma rodada de exercício (practice-hub). */
export interface ExerciseResult {
  kind: 'read-aloud' | 'blocks' | 'dictation' | 'compose' | 'fill-blank' | 'active-production'
  correct: boolean
  /** Score por instância 0..1 (opcional → migração aditiva). */
  score?: number
  /** Formato de progressão do exercício. */
  exerciseKind?: 'mc' | 'typing' | 'active-production'
}

// ─────────────────── metrics-pipeline — honestidade como tipo ───────────────────

/**
 * Proveniência de uma métrica. A camada de exibição NÃO pode renderizar
 * `self-report`/`probabilistic` como se fosse `deterministic`.
 */
export type MetricSource = 'deterministic' | 'self-report' | 'probabilistic'

/** Uma métrica exposta — sempre carrega fonte, amostra e (opcional) confiança. */
export interface LearningMetric {
  key: string
  value: number
  unit?: string
  sampleSize: number
  source: MetricSource
  confidence?: number
  /** epoch ms — "medido até". */
  asOf: number
}

/** Ponto de série temporal (ex.: palavras numa semana). `n=0` = buraco honesto. */
export interface TrendPoint {
  /** epoch ms do início da semana (ISO, segunda). */
  weekStart: number
  value: number
  n: number
}

/** Regressão linear com confiabilidade explícita (`reliable=false` se `n<4`). */
export interface Slope {
  value: number
  n: number
  reliable: boolean
}

/** Tópico fraco — SEMPRE probabilístico (sugestão, não fato). */
export interface WeakTopic {
  topic: string
  source: 'probabilistic'
  confidence: number
  sampleSize: number
}

/** Rollup determinístico de exercícios. */
export interface ExerciseRollup {
  accuracy: LearningMetric
  precision: LearningMetric
  recall: LearningMetric
  f1: LearningMetric
  pif: LearningMetric
  constructValidated: boolean
}

/** Granularidade/janela do gráfico de evolução. */
export type BucketUnit = 'day' | 'week' | 'month'
export type TimeWindow = '7d' | '30d' | '90d' | 'all'
export interface ProfileQuery {
  unit?: BucketUnit
  window?: TimeWindow
}

/** Read-model do perfil de performance. SEM nível psicológico, SEM emoção como traço. */
export interface PerformanceProfile {
  wordsPerWeek: TrendPoint[]
  wordsSlope: Slope
  exercise: ExerciseRollup
  weakTopics: WeakTopic[]
  asOf: number
  /** Série de evolução na granularidade/janela pedidas. */
  trend?: TrendPoint[]
  /** Unidade do `trend` (eco do pedido p/ a UI rotular). */
  trendUnit?: BucketUnit
}

/** "Como um nativo diria": variantes casual/formal. */
export interface ReformulateResult {
  casual: string
  formal: string
}

/** Turno persistido do chat do professor. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
  at: number
}

/** Resultado do deckBulkAdd (card-quality): itens insanos são PULADOS. */
export interface DeckBulkAddResult {
  cards: Flashcard[]
  /** Quantos itens foram pulados por tradução não confiável. */
  skipped: number
}

/** Intervalos Leitner (dias) por box 1..5. */
export const LEITNER_DAYS = [1, 2, 4, 8, 16]
