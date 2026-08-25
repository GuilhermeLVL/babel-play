import { describe, it, expect } from 'vitest';
import { deriveProgress } from '../src/lib/progress';
import type { AppMetrics } from '../src/data/api';

function metrics(over: Partial<AppMetrics> = {}): AppMetrics {
  return {
    sessions: 0, wordsCaptured: 0, deckSize: 0, newCards: 0, dueToday: 0,
    reviews: 0, correctReviews: 0, drillItems: 0, drillCorrect: 0, accuracy: 0,
    streakDays: 0, avgStability: 0, avgRetention: 0, retentionConfidence: 0,
    vocabByWeek: [], speakingMs: 0, wpm: 0, wpmConfidence: 0, uniqueWords: 0,
    levelDistribution: [], levelConfidence: 0, asOf: Date.now(),
    ...over,
  } as AppMetrics;
}

describe('ponte de XP — o esforço nos minigames chega ao perfil', () => {
  /** Antes desta ponte, jogar não movia o XP do Hub: o número animava na tela e sumia. */
  it('itens de minigame somam XP', () => {
    const semJogo = deriveProgress(metrics()).xp;
    const comJogo = deriveProgress(metrics({ drillItems: 10, drillCorrect: 7 })).xp;
    expect(comJogo).toBeGreaterThan(semJogo);
    expect(comJogo - semJogo).toBe(10 * 1 + 7 * 2);
  });

  it('acertar vale mais do que só participar', () => {
    const soParticipou = deriveProgress(metrics({ drillItems: 10, drillCorrect: 0 })).xp;
    const acertouTudo = deriveProgress(metrics({ drillItems: 10, drillCorrect: 10 })).xp;
    expect(acertouTudo).toBeGreaterThan(soParticipou);
    expect(soParticipou).toBeGreaterThan(0); // participar nunca vale zero
  });

  /** O jogo é a porta de entrada; a revisão é o que move a memória. A ordem tem de aparecer. */
  it('um item de jogo vale MENOS que uma revisão de verdade', () => {
    const jogo = deriveProgress(metrics({ drillItems: 1, drillCorrect: 1 })).xp;
    const revisao = deriveProgress(metrics({ reviews: 1, correctReviews: 1 })).xp;
    expect(jogo).toBeLessThan(revisao);
  });

  it('métricas antigas (sem os campos) não quebram — nível não regride', () => {
    const antigo = { ...metrics(), reviews: 20, correctReviews: 15 } as AppMetrics;
    delete (antigo as unknown as Record<string, unknown>).drillItems;
    delete (antigo as unknown as Record<string, unknown>).drillCorrect;
    const p = deriveProgress(antigo);
    expect(p.xp).toBe(20 * 3 + 15 * 2);
    expect(p.level).toBeGreaterThanOrEqual(1);
  });

  it('a curva de nível continua íntegra com o XP novo', () => {
    const p = deriveProgress(metrics({ drillItems: 50, drillCorrect: 50 }));
    expect(p.xp).toBe(50 + 100);
    expect(p.level).toBe(2);              // nível 2 começa em 100
    expect(p.xpIntoLevel).toBe(50);
    expect(p.levelPct).toBeGreaterThan(0);
  });
});
