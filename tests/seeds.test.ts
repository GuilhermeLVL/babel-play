import { describe, it, expect } from 'vitest';
import { deriveProgress } from '../src/lib/progress';
import type { AppMetrics } from '../src/data/api';

/**
 * O MODELO DA MOEDA — as três coisas que precisavam mudar para Seeds poder ser gasta.
 *
 * Seeds era uma ESTATÍSTICA: `deriveProgress` a recalculava a cada carregamento a partir de
 * `wordsCaptured`, `correctReviews` e `streakDays`. Três consequências, e cada uma tem um teste:
 *
 *  1. Recalcular devolvia o valor cheio depois de uma compra — a compra evaporava no reload.
 *  2. `streakDays * 10` fazia o total GANHO **encolher** ao se perder um dia. Quem gastasse 300
 *     com 30 dias de ofensiva e perdesse a ofensiva ficaria com saldo negativo: o app cobraria de
 *     volta uma compra feita, por não ter estudado ontem.
 *  3. Sem idempotência, um duplo-clique cobra duas vezes (isso é travado no servidor, em
 *     `seedSpendsRepo.debitar`, por `spendId` único).
 */

const base = (over: Partial<AppMetrics> = {}): AppMetrics => ({
  sessions: 2, wordsCaptured: 100, deckSize: 100, newCards: 0, dueToday: 0,
  reviews: 50, correctReviews: 40, drillItems: 0, drillCorrect: 0,
  accuracy: 0.8, accuracyConfidence: 0.9, streakDays: 30,
  avgStability: 5, avgRetention: 0.9, avgRetentionConfidence: 0.7,
  vocabByWeek: [], speakingMs: 0, wpm: 0, wpmConfidence: 0,
  uniqueWords: 0, levelDistribution: {}, levelConfidence: 0, asOf: Date.now(),
  ...over,
} as AppMetrics);

describe('o ganho nunca encolhe', () => {
  it('perder a ofensiva NÃO reduz as seeds ganhas', () => {
    const comOfensiva = deriveProgress(base({ streakDays: 30 }));
    const semOfensiva = deriveProgress(base({ streakDays: 0 }));
    expect(semOfensiva.seedsGanhas).toBe(comOfensiva.seedsGanhas);
  });

  it('e o saldo também não — era aqui que nascia o saldo negativo', () => {
    // 100 palavras (×1) + 40 revisões certas (×4) = 260 ganhas. Gastou 250.
    const gastou = { seedsGastas: 250 };
    const comOfensiva = deriveProgress(base({ streakDays: 30, ...gastou }));
    const perdeuTudo = deriveProgress(base({ streakDays: 0, ...gastou }));
    expect(comOfensiva.seeds).toBe(perdeuTudo.seeds);
    expect(perdeuTudo.seeds).toBeGreaterThanOrEqual(0);
  });

  it('o ganho cresce com o trabalho feito, e só com ele', () => {
    const antes = deriveProgress(base({ correctReviews: 40 }));
    const depois = deriveProgress(base({ correctReviews: 41 }));
    expect(depois.seedsGanhas).toBeGreaterThan(antes.seedsGanhas);
  });
});

describe('o saldo é ganhas menos gastas', () => {
  it('gastar reduz o saldo e preserva o ganho', () => {
    const semGasto = deriveProgress(base());
    const comGasto = deriveProgress(base({ seedsGastas: 100 }));
    expect(comGasto.seeds).toBe(semGasto.seeds - 100);
    expect(comGasto.seedsGanhas).toBe(semGasto.seedsGanhas);
  });

  it('NUNCA fica negativo, mesmo com gasto maior que o ganho', () => {
    const r = deriveProgress(base({ seedsGastas: 999_999 }));
    expect(r.seeds).toBe(0);
  });

  it('métrica sem o campo (servidor antigo) trata como zero gasto', () => {
    const semCampo = deriveProgress(base({ seedsGastas: undefined }));
    expect(semCampo.seeds).toBe(semCampo.seedsGanhas);
  });
});

describe('a ofensiva continua existindo — como ofensiva', () => {
  it('sai da fórmula da moeda, mas não da tela', () => {
    const r = deriveProgress(base({ streakDays: 30 }));
    expect(r.streakDays).toBe(30);
    expect(r.practicedToday).toBe(true);
  });
});
