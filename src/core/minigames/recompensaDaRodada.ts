import { PESOS_SEEDS } from '../learning/xp';
import { gradeFor } from './grade';
import { MINIGAMES, type RoundReport } from './types';

/**
 * AS SEEDS QUE ESTA RODADA RENDE — o "+N Seeds" da raspadinha, com a régua do servidor.
 *
 * O saldo não é guardado: o servidor o recalcula a partir do que foi gravado
 * (`seedsGanhasDeEventos` em `learning/xp.ts`, contado em `server/db/repositories/metrics.ts`).
 * Esta função repete, para UMA rodada, as três parcelas que uma rodada move:
 *
 *   - item de JOGO certo (linha `kind: 'drill'`, a que não vira revisão) → `jogoCerto`;
 *   - item que vira REVISÃO (tem `cardId` e o jogo escreve no agendador) e sai com nota ≥ 3 →
 *     `revisaoCerta` — é o mesmo corte de `correctReviews` (`grade >= 3`);
 *   - rodada PERFEITA (todos certos, com o mínimo de itens do jogo) → `rodadaPerfeita`.
 *
 * O baú da rodada (`SEEDS_DO_DROP`) fica de fora de propósito: quem sorteia é o servidor, e ele
 * tem o próprio aviso. Somá-lo aqui seria prometer um prêmio que pode não vir.
 */
export function seedsDaRodada(report: RoundReport): number {
  const def = MINIGAMES[report.gameId];
  let seeds = 0;
  for (const o of report.items) {
    const revisao = !!o.cardId && !!def?.writesSrs;
    if (revisao) {
      if (gradeFor(report.gameId, o) >= 3) seeds += PESOS_SEEDS.revisaoCerta;
    } else if (o.correct) {
      seeds += PESOS_SEEDS.jogoCerto;
    }
  }
  const minimo = def?.minItems ?? 3;
  const perfeita = report.items.length >= minimo && report.items.every((o) => o.correct);
  if (perfeita) seeds += PESOS_SEEDS.rodadaPerfeita;
  return seeds;
}
