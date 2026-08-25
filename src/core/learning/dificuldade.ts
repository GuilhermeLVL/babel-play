/**
 * DIFICULDADE POR PALAVRA — cold-start por construção.
 *
 * POR QUE ASSIM: as medições sobre o banco real mandam no desenho.
 *  - FSRS cobre **152 de 2.126 cartões (7,1%)** → não existe retrievability para 93% do deck;
 *  - CEFR real cobre **11,4%** depois da troca do estimador por wordlist.
 * Um modelo centrado em CEFR+FSRS com "fallback" teria fallback em quase todo lugar. Aqui o
 * caminho SEM sinal forte é o principal, e os sinais fortes se somam quando existem.
 *
 * A FÓRMULA é uma média ponderada sobre os componentes DISPONÍVEIS, com os pesos renormalizados.
 * Componente ausente é OMITIDO, nunca preenchido com um valor neutro: tratar "não sei" como 0,5
 * empurraria a maior parte do deck para o meio da escala e apagaria os sinais que existem.
 *
 * A dificuldade é camada de SELEÇÃO sobre o FSRS, não um segundo motor de agendamento. O FSRS
 * continua dono da agenda; aqui a retrievability entra como um sinal entre outros.
 */
import { retrievability } from './scheduler'

export type FaixaDificuldade = 'facil' | 'medio' | 'dificil'
export type MotivoDificuldade = 'lapsos' | 'desempenho' | 'escore'

export interface SinaisDoCartao {
  word: string
  cefrLevel: string | null
  cefrSource: 'curado' | 'wordlist' | 'ausente'
  occurrences: number
  lastSeenAt: number | null
  reps: number
  lapses: number
  stability: number | null
  lastReview: number | null
  acertos: number
  tentativas: number
  agora: number
}

export interface Dificuldade {
  score: number
  faixa: FaixaDificuldade
  motivo: MotivoDificuldade
  /** Quais sinais entraram de fato — a UI usa para não afirmar precisão que não existe. */
  sinaisUsados: string[]
  /** 0..1 — proporção do peso total que estava disponível. */
  confianca: number
  componentes: Partial<Record<string, number>>
  pesos: Partial<Record<string, number>>
}

/* ── Pesos ────────────────────────────────────────────────────────────────────────────────────
   `lexical` só vale quando o nível tem procedência real. Nível estimado por comprimento de palavra
   tem peso ZERO — não é rebaixado, é excluído (ver cefrWordlist.ts). */
const PESO = {
  lexical: 0.35,
  familiaridade: 0.25,
  desempenho: 0.25,
  recencia: 0.10,
  forma: 0.05,
} as const

/**
 * Teto do peso da retrievability, e quantas revisões para chegar lá.
 *
 * N = 3 não é arbitrário. Medido no banco real: os 152 cartões com histórico têm **reps = 1 e
 * `stability` idêntica (1,18)** — uma revisão só não distingue um cartão do outro, porque o FSRS
 * ainda está na estimativa inicial. Dar peso cheio a esse sinal seria dar peso cheio a um valor
 * que é o mesmo para todo mundo. Com N = 3 o peso entra gradualmente (1/3, 2/3, 1) enquanto a
 * `stability` começa a refletir o desempenho real.
 */
export const PESO_MAXIMO_RETRIEVABILITY = 0.30
export const REVISOES_PARA_PESO_CHEIO = 3

/** Cortes das faixas. Explícitos porque a UI e a API precisam concordar com eles. */
export const CORTE_FACIL = 0.34
export const CORTE_DIFICIL = 0.67

export interface CortesDeFaixa {
  corte1: number
  corte2: number
  tipo: 'fixo' | 'quantil'
  /** Por que caiu para fixo, quando cair. */
  motivo?: 'deck-pequeno' | 'sem-dispersao'
}

export const CORTES_FIXOS: CortesDeFaixa = { corte1: CORTE_FACIL, corte2: CORTE_DIFICIL, tipo: 'fixo' }

/** Abaixo disto, quantil é ruído: um deck de 10 palavras não tem terços significativos. */
export const MINIMO_PARA_QUANTIL = 30
/** Dispersão mínima (p90 − p10) para que dividir em terços signifique alguma coisa. */
export const DISPERSAO_MINIMA = 0.05

/**
 * CORTES POR QUANTIL, relativos ao deck do usuário (Z3).
 *
 * A MEDIÇÃO que motivou (`results/Z3-distribuicao.json`, 1.902 cartões): o score contínuo NÃO é
 * degenerado — vai de 0,20 a 0,75 —, mas é fortemente concentrado: **78% entre 0,55 e 0,70**, com
 * pico de 38% na faixa 0,60–0,65. Os cortes fixos (0,34/0,67) caem FORA do pico, então o pico
 * inteiro vira "médio": **77,8%** numa faixa só.
 *
 * Por que quantil e não recalibrar o fixo: recalibrar significaria pôr os cortes em 0,602 e 0,648
 * — que são exatamente os quantis DESTE deck. Seriam quantis disfarçados de constante, errados
 * para outro usuário e desatualizados assim que o deck evoluir. Além disso, um corte fixo DENTRO
 * do pico é instável: uma variação minúscula de score troca a faixa da palavra.
 *
 * O CUSTO, declarado: o rótulo passa a ser RELATIVO ("difícil para você, hoje") e uma palavra pode
 * mudar de faixa sem o usuário agir sobre ela. Mitigações: (a) os cortes são materializados junto
 * dos scores, então só mudam quando há recálculo — não a cada leitura; (b) `cortesDoDeck` devolve
 * os valores usados, para a UI poder explicar a mudança em vez de o usuário descobrir sozinho.
 *
 * DUAS GUARDAS contra fingir separação:
 *  - deck pequeno (< 30) → fixo;
 *  - dispersão insuficiente (p90 − p10 < 0,05) → fixo. Dividir em três um conjunto de scores
 *    praticamente iguais seria inventar uma distinção que o dado não sustenta — o mesmo defeito
 *    do estimador CEFR antigo, noutra roupa.
 */
export function cortesDoDeck(scores: number[]): CortesDeFaixa {
  const validos = scores.filter((s) => Number.isFinite(s)).sort((a, b) => a - b)
  if (validos.length < MINIMO_PARA_QUANTIL) return { ...CORTES_FIXOS, motivo: 'deck-pequeno' }

  const em = (p: number) => validos[Math.min(validos.length - 1, Math.max(0, Math.round((p / 100) * (validos.length - 1))))]
  if (em(90) - em(10) < DISPERSAO_MINIMA) return { ...CORTES_FIXOS, motivo: 'sem-dispersao' }

  const corte1 = em(33)
  const corte2 = em(67)
  // Quantis colapsados (muitos valores repetidos) também não separam — cai para fixo.
  if (!(corte1 < corte2)) return { ...CORTES_FIXOS, motivo: 'sem-dispersao' }
  return { corte1, corte2, tipo: 'quantil' }
}

/** Faixa de um score. Sem `cortes`, usa os fixos — o comportamento anterior. */
export function faixaDe(score: number, cortes: CortesDeFaixa = CORTES_FIXOS): FaixaDificuldade {
  if (score < cortes.corte1) return 'facil'
  if (score < cortes.corte2) return 'medio'
  return 'dificil'
}

const NIVEL_PARA_ESCALA: Record<string, number> = { A1: 0, A2: 0.2, B1: 0.4, B2: 0.6, C1: 0.8, C2: 1 }

const DIA = 86_400_000

export function calcularDificuldade(s: SinaisDoCartao): Dificuldade {
  const componentes: Record<string, number> = {}
  const pesos: Record<string, number> = {}

  // ── lexical: só com procedência real ────────────────────────────────────────────────────────
  if (s.cefrSource !== 'ausente' && s.cefrLevel && s.cefrLevel in NIVEL_PARA_ESCALA) {
    componentes.lexical = NIVEL_PARA_ESCALA[s.cefrLevel]
    pesos.lexical = PESO.lexical
  }

  // ── familiaridade: quanto MENOS vista, mais difícil. Satura em 8 encontros ──────────────────
  componentes.familiaridade = 1 - Math.min(Math.max(s.occurrences, 0), 8) / 8
  pesos.familiaridade = PESO.familiaridade

  // ── desempenho: só com histórico. Laplace evita que 0/1 vire "erra sempre" ──────────────────
  if (s.tentativas > 0) {
    componentes.desempenho = 1 - (s.acertos + 1) / (s.tentativas + 2)
    pesos.desempenho = PESO.desempenho
  }

  // ── retrievability: peso CRESCENTE com o nº de revisões ─────────────────────────────────────
  if (s.reps > 0 && s.stability && s.lastReview) {
    const dias = Math.max(0, (s.agora - s.lastReview) / DIA)
    componentes.retrievability = 1 - Math.min(Math.max(retrievability(dias, s.stability), 0), 1)
    pesos.retrievability = PESO_MAXIMO_RETRIEVABILITY * (Math.min(s.reps, REVISOES_PARA_PESO_CHEIO) / REVISOES_PARA_PESO_CHEIO)
  }

  // ── recência: tempo sem encontrar a palavra, saturando em 90 dias ───────────────────────────
  if (s.lastSeenAt) {
    const dias = Math.max(0, (s.agora - s.lastSeenAt) / DIA)
    componentes.recencia = Math.min(dias / 90, 1)
    pesos.recencia = PESO.recencia
  }

  // ── forma: comprimento como proxy fraco. Peso baixo DE PROPÓSITO — foi exatamente este sinal
  //    que, sozinho, produziu a escala CEFR invertida do estimador antigo.
  componentes.forma = Math.min(Math.max(s.word.length - 3, 0) / 12, 1)
  pesos.forma = PESO.forma

  const somaPesos = Object.values(pesos).reduce((a, b) => a + b, 0)
  const score = somaPesos > 0
    ? Object.keys(pesos).reduce((acc, k) => acc + componentes[k] * pesos[k], 0) / somaPesos
    : 0.5

  /* PRECEDÊNCIA: erro repetido vence qualquer média. Errar sempre "the" é o caso que mais importa
     para quem aprende, e uma ponderação o esconderia atrás do nível A1 e das muitas repetições. */
  let faixa = faixaDe(score)
  let motivo: MotivoDificuldade = 'escore'
  if (s.lapses >= 2) { faixa = 'dificil'; motivo = 'lapsos' }
  else if (s.tentativas >= 3 && s.acertos / s.tentativas < 0.4) { faixa = 'dificil'; motivo = 'desempenho' }

  const TOTAL_POSSIVEL = PESO.lexical + PESO.familiaridade + PESO.desempenho + PESO.recencia + PESO.forma + PESO_MAXIMO_RETRIEVABILITY
  return {
    score: +score.toFixed(4),
    faixa,
    motivo,
    sinaisUsados: Object.keys(pesos),
    confianca: +(somaPesos / TOTAL_POSSIVEL).toFixed(3),
    componentes,
    pesos,
  }
}
