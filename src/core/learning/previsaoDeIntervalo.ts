/**
 * PREVISÃO DO INTERVALO POR NOTA — o que os quatro botões de revisão escrevem.
 *
 * Nasceu para matar uma mentira pequena e persistente: `Study.tsx` exibia
 * "Again (10m) · Hard (1.2d) · Good (3.5d) · Easy (8d)" como string fixa no JSX. Os números não
 * vinham do agendador; eram os mesmos para um cartão nunca revisado e para um com 200 dias de
 * estabilidade. O próprio `Study.tsx:160-169` já documentava ter eliminado a simulação local do
 * FSRS — a correção parou no cartão persistido e não alcançou os rótulos.
 *
 * A regra aqui é uma só: NÃO calcular nada. Perguntar ao agendador o que ele faria com cada nota
 * (`Fsrs5Strategy.review`) e formatar a diferença. É o mesmo caminho que o servidor percorre para
 * agendar de verdade, então rótulo e agendamento não têm como divergir.
 */
import { Fsrs5Strategy,type Grade, type SchedulerStrategy, type SchedulingState } from './scheduler'

const DAY = 86_400_000
const MES = 30
const ANO = 365

/**
 * Formata uma distância em ms como rótulo curto de intervalo.
 *
 * Mesmo dia vira `agora`, e não um número de minutos: o FSRS-5 deste projeto zera o intervalo no
 * lapso (`scheduler.ts`: `dueAt = grade === 1 ? now : ...`), então "10m" seria invenção. Acima de
 * um dia o agendador já arredondou para dias inteiros — este formatador não reintroduz casa
 * decimal nenhuma.
 */
export function rotuloDeIntervalo(ms: number): string {
  const dias = Math.max(0, Math.round(ms / DAY))
  if (dias === 0) return 'agora'
  if (dias < MES) return `${dias}d`
  if (dias < ANO) return `${Math.round(dias / MES)}mes`
  return `${Math.round(dias / ANO)}a`
}

/**
 * O mínimo que um cartão precisa expor para ser agendável.
 *
 * Tipado por estrutura, e não por `VocabCard`, para o núcleo não passar a depender da camada de
 * app. Aceita os dois nomes que convivem no código (`stability` e `fsrsStability`) porque a
 * conversão do banco escreve os dois (`src/data/rotas/vocabulario.ts:87`).
 */
export interface CartaoAgendavel {
  stability?: number | null
  fsrsStability?: number | null
  fsrsDifficulty?: number | null
  reps?: number | null
  lastReview?: number | null
  leitnerBox?: number | null
  dueAtMs?: number | null
}

/**
 * Estado do agendador lido de um cartão do deck.
 *
 * ARMADILHA QUE ESTA FUNÇÃO EXISTE PARA FECHAR: `rowToVocabCard` escreve
 * `fsrsStability: row.stability ?? 0` — ou seja, cartão nunca revisado chega com **0**, não com
 * `undefined`. Mas o FSRS-5 distingue os dois: `stability === undefined` é o ramo da PRIMEIRA
 * revisão (`scheduler.ts`: `const first = state.stability === undefined`), enquanto 0 seria um
 * cartão real com estabilidade zero. Passar o 0 adiante faria a previsão de um cartão novo sair
 * do ramo errado do agendador. Por isso o `|| undefined`.
 */
export function estadoDoCartao(c: CartaoAgendavel, agora: number): SchedulingState {
  const stability = c.stability ?? c.fsrsStability ?? undefined
  return {
    box: c.leitnerBox ?? 1,
    dueAt: c.dueAtMs ?? agora,
    stability: stability || undefined,
    difficulty: c.fsrsDifficulty ?? undefined,
    reps: c.reps ?? undefined,
    lastReview: c.lastReview ?? undefined,
  }
}

/**
 * O que cada uma das quatro notas faria com ESTE cartão, agora.
 *
 * `estrategia` é injetável para que o teste possa travar o contrato sem depender dos pesos
 * default; a UI usa o default e não precisa saber disso.
 */
export function previsaoDosBotoes(
  estado: SchedulingState,
  agora: number,
  estrategia: SchedulerStrategy = Fsrs5Strategy,
): Record<Grade, string> {
  const de = (nota: Grade) => rotuloDeIntervalo(estrategia.review(estado, nota, agora).dueAt - agora)
  return { 1: de(1), 2: de(2), 3: de(3), 4: de(4) }
}
