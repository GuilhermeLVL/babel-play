import { LEITNER_DAYS } from './contract'

/**
 * Agendador de revisão PLUGÁVEL (srs-fsrs) — puro, determinístico, sem IA/rede.
 *
 * Default = FSRS-5 (estado da arte em retenção). Leitner permanece como opção.
 * Implementação própria (não dependemos de lib externa): ~determinística e
 * testável, validável contra os vetores conhecidos do FSRS-5. O estado vive na
 * própria carta e PRESERVA `box`/`dueAt` (Leitner) para reversibilidade e
 * migração não-destrutiva.
 */

const DAY = 86_400_000

/** Nota de revisão FSRS: 1=Again(errou) · 2=Hard · 3=Good · 4=Easy. */
export type Grade = 1 | 2 | 3 | 4

/** Mapeia o `correct` binário da UI atual p/ grade FSRS (errou→Again, acertou→Good). */
export function gradeFromCorrect(correct: boolean): Grade {
  return correct ? 3 : 1
}

/** Estado de agendamento embutido na carta (compatível com Leitner). */
export interface SchedulingState {
  /** Leitner: caixa 1..5 (legado, mantido p/ reversibilidade). */
  box: number
  /** Próxima revisão (epoch ms). */
  dueAt: number
  /** FSRS: estabilidade em dias (≈ intervalo p/ ~90% de retenção). undefined = ainda não revisada por FSRS. */
  stability?: number
  /** FSRS: dificuldade 1..10. */
  difficulty?: number
  /** nº de revisões FSRS. */
  reps?: number
  /** nº de lapsos (Again). */
  lapses?: number
  /** epoch ms da última revisão (insumo da retrievability). */
  lastReview?: number
}

export interface SchedulerStrategy {
  id: 'fsrs' | 'leitner'
  /** Estado de uma carta NOVA, vencendo agora. */
  init(now: number): SchedulingState
  /** Aplica uma revisão e devolve o novo estado (com `dueAt`). */
  review(state: SchedulingState, grade: Grade, now: number): SchedulingState
  /** Retenção prevista AGORA (0..1) — probabilística; undefined se indisponível. */
  predictedRetention(state: SchedulingState, now: number): number | undefined
}

// ───────────────────────────── Leitner ─────────────────────────────

/** Leitner 5-box (comportamento atual, extraído): erra→box1 vence agora; acerta→sobe e agenda. */
export const LeitnerStrategy: SchedulerStrategy = {
  id: 'leitner',
  init: (now) => ({ box: 1, dueAt: now }),
  review: (state, grade, now) => {
    const box = grade === 1 ? 1 : Math.min(5, state.box + 1)
    const dueAt = grade === 1 ? now : now + LEITNER_DAYS[box - 1] * DAY
    return { ...state, box, dueAt }
  },
  predictedRetention: () => undefined // Leitner não modela retrievability
}

// ───────────────────────────── FSRS-5 ─────────────────────────────

/** Pesos default do FSRS-5 (19 parâmetros). Fixos nesta fase; otimização = srs-fsrs-optimization. */
export const FSRS5_DEFAULT_WEIGHTS: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621
]

const DECAY = -0.5
/** 0.9^(1/DECAY) - 1 = 19/81. Faz `intervalo(S) ≈ S` quando a retenção alvo é 0.9. */
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1
/** Retenção alvo no agendamento (clássico FSRS = 90%). */
export const REQUEST_RETENTION = 0.9

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x))
const clampS = (s: number): number => clamp(s, 0.01, 36500)
const clampD = (d: number): number => clamp(d, 1, 10)

/** Retrievability após `t` dias com estabilidade `s`. */
export function retrievability(t: number, s: number): number {
  return Math.pow(1 + (FACTOR * Math.max(0, t)) / s, DECAY)
}

/** Intervalo (dias) p/ a estabilidade `s` cair até a retenção alvo. */
function intervalDays(s: number): number {
  return (s / FACTOR) * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1)
}

function initialStability(w: readonly number[], grade: Grade): number {
  return clampS(w[grade - 1])
}
function initialDifficulty(w: readonly number[], grade: Grade): number {
  return clampD(w[4] - Math.exp(w[5] * (grade - 1)) + 1)
}
function nextDifficulty(w: readonly number[], d: number, grade: Grade): number {
  const delta = -w[6] * (grade - 3)
  const damped = d + delta * (10 - d) / 9 // damping linear (FSRS-5)
  // reversão à média rumo à dificuldade de "Easy"
  return clampD(w[7] * initialDifficulty(w, 4) + (1 - w[7]) * damped)
}
function nextStabilitySuccess(w: readonly number[], d: number, s: number, r: number, grade: Grade): number {
  const hard = grade === 2 ? w[15] : 1
  const easy = grade === 4 ? w[16] : 1
  const inc =
    Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hard * easy
  return clampS(s * (1 + inc))
}
function nextStabilityLapse(w: readonly number[], d: number, s: number, r: number): number {
  const sLapse =
    w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r))
  return clampS(Math.min(sLapse, s)) // pós-lapso nunca aumenta a estabilidade
}

export function makeFsrs5(weights: readonly number[] = FSRS5_DEFAULT_WEIGHTS): SchedulerStrategy {
  const w = weights
  return {
    id: 'fsrs',
    init: (now) => ({ box: 1, dueAt: now }),
    review: (state, grade, now) => {
      const first = state.stability === undefined
      let difficulty: number
      let stability: number
      if (first) {
        // 1ª revisão FSRS: estado inicial pela nota
        difficulty = initialDifficulty(w, grade)
        stability = initialStability(w, grade)
      } else {
        const t = Math.max(0, (now - (state.lastReview ?? now)) / DAY)
        const r = retrievability(t, state.stability!)
        difficulty = nextDifficulty(w, state.difficulty!, grade)
        stability =
          grade === 1
            ? nextStabilityLapse(w, difficulty, state.stability!, r)
            : nextStabilitySuccess(w, difficulty, state.stability!, r, grade)
      }
      const reps = (state.reps ?? 0) + 1
      const lapses = (state.lapses ?? 0) + (grade === 1 ? 1 : 0)
      // box legado espelha o resultado (reversibilidade): erra→1, acerta→sobe
      const box = grade === 1 ? 1 : Math.min(5, state.box + 1)
      // erro → revisa AGORA (UX atual do app); acerto → intervalo FSRS
      const dueAt = grade === 1 ? now : now + Math.max(1, Math.round(intervalDays(stability))) * DAY
      return { box, dueAt, stability, difficulty, reps, lapses, lastReview: now }
    },
    predictedRetention: (state, now) => {
      if (state.stability === undefined) return undefined
      const t = Math.max(0, (now - (state.lastReview ?? now)) / DAY)
      return retrievability(t, state.stability)
    }
  }
}

/** FSRS-5 com os pesos default. */
export const Fsrs5Strategy: SchedulerStrategy = makeFsrs5()

/** Seleciona a estratégia pelo id do config. */
export function getScheduler(id: 'fsrs' | 'leitner'): SchedulerStrategy {
  return id === 'leitner' ? LeitnerStrategy : Fsrs5Strategy
}

// ─────────────────────────── Gate de novos itens ───────────────────────────

/** Carta nova = nunca revisada pelo FSRS (stability não definida). */
export function isNewCard(card: Pick<SchedulingState, 'stability'>): boolean {
  return card.stability === undefined
}

/**
 * Seleciona a próxima carta a revisar, respeitando o gate de novos itens por dia.
 * Prioridade: revisões devidas primeiro; novas cartas só se `newSeenToday < newPerDay`.
 */
export function getNextCard<T extends SchedulingState>(
  deck: T[],
  now: number,
  newSeenToday: number,
  newPerDay: number
): T | undefined {
  const due = deck.filter((c) => c.dueAt <= now)
  const reviews = due.filter((c) => !isNewCard(c))
  if (reviews.length > 0) return reviews[0]
  if (newSeenToday < newPerDay) {
    return due.find((c) => isNewCard(c))
  }
  return undefined
}

// ─────────────────────────── Migração ───────────────────────────

/**
 * Migração NÃO-DESTRUTIVA Leitner→FSRS: mapeia `box`(1..5) para um estado FSRS
 * inicial cuja estabilidade ≈ o intervalo Leitner já conquistado, preservando
 * `box`/`dueAt`. Idempotente: cartas que já têm estado FSRS passam intactas, e
 * cartas novas (box 1, nunca revisadas) ficam sem estado (FSRS define na 1ª nota).
 */
export function migrateLeitnerToFsrs<T extends SchedulingState>(card: T, now: number): T {
  if (card.stability !== undefined) return card // idempotente
  const box = clamp(Math.round(card.box ?? 1), 1, 5)
  if (box <= 1) return card // carta nova: sem histórico p/ migrar, FSRS define ao revisar
  const stability = clampS(LEITNER_DAYS[box - 1])
  const difficulty = initialDifficulty(FSRS5_DEFAULT_WEIGHTS, 3)
  // lastReview retrocedido p/ a retrievability bater com o dueAt já agendado
  const lastReview = (card.dueAt && card.dueAt > 0 ? card.dueAt : now) - stability * DAY
  return { ...card, stability, difficulty, reps: box - 1, lapses: 0, lastReview }
}
