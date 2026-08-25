import { describe, it, expect } from 'vitest';
import { isDueAt, isDueNow, countDue, byUrgency } from '../src/core/learning/due';
import type { VocabCard } from '../src/types';

const AGORA = Date.parse('2026-07-28T12:00:00.000Z');
const iso = (deltaMs: number) => new Date(AGORA + deltaMs).toISOString();
const DIA = 86_400_000;

function card(over: Partial<VocabCard> = {}): VocabCard {
  return {
    id: 'c1', word: 'w', phonetics: '', translation: 't', explanation: '',
    frequency: 'medium', leitnerBox: 1, leitnerDueAt: iso(-DIA),
    fsrsState: 'Review', fsrsStability: 5, fsrsDifficulty: 5, fsrsPredictedRetention: 0,
    fsrsDueAt: iso(-DIA), inDeck: true, ...over,
  };
}

describe('isDueAt — o formato que a API realmente grava', () => {
  it('ISO no passado está vencido; no futuro, não', () => {
    expect(isDueAt(iso(-1000), AGORA)).toBe(true);
    expect(isDueAt(iso(+1000), AGORA)).toBe(false);
  });

  it('aceita o rótulo LEGADO "hoje" (mutações locais ainda produzem)', () => {
    expect(isDueAt('hoje', AGORA)).toBe(true);
    expect(isDueAt('Today', AGORA)).toBe(true);
  });

  it('ausente ou ilegível NÃO conta como vencido — não inventa urgência', () => {
    expect(isDueAt(undefined, AGORA)).toBe(false);
    expect(isDueAt('', AGORA)).toBe(false);
    expect(isDueAt('amanhã de manhã', AGORA)).toBe(false);
  });

  it('exatamente agora conta como vencido', () => {
    expect(isDueAt(iso(0), AGORA)).toBe(true);
  });
});

describe('isDueNow / countDue', () => {
  /** O BUG: com dados do servidor (ISO), a comparação com 'hoje' dava SEMPRE 0. */
  it('conta os vencidos com data ISO — antes o resultado era sempre zero', () => {
    const deck = [
      card({ id: 'a', fsrsDueAt: iso(-DIA) }),
      card({ id: 'b', fsrsDueAt: iso(-3 * DIA) }),
      card({ id: 'c', fsrsDueAt: iso(+DIA) }),
    ];
    expect(countDue(deck, 'fsrs', AGORA)).toBe(2);
  });

  it('cartão fora do baralho nunca está vencido', () => {
    expect(isDueNow(card({ inDeck: false }), 'fsrs', AGORA)).toBe(false);
  });

  it('respeita o agendador escolhido (fsrs vs leitner)', () => {
    const c = card({ fsrsDueAt: iso(+DIA), leitnerDueAt: iso(-DIA) });
    expect(isDueNow(c, 'fsrs', AGORA)).toBe(false);
    expect(isDueNow(c, 'leitner', AGORA)).toBe(true);
  });

  it('baralho vazio conta zero', () => {
    expect(countDue([], 'fsrs', AGORA)).toBe(0);
  });
});

describe('byUrgency — a fila do Duelo Relâmpago', () => {
  it('devolve só vencidos, do MAIS atrasado para o menos', () => {
    const deck = [
      card({ id: 'recente', fsrsDueAt: iso(-DIA) }),
      card({ id: 'futuro', fsrsDueAt: iso(+DIA) }),
      card({ id: 'antigo', fsrsDueAt: iso(-10 * DIA) }),
    ];
    expect(byUrgency(deck, 'fsrs', AGORA).map(c => c.id)).toEqual(['antigo', 'recente']);
  });

  it('o legado "hoje" entra na fila como vencendo agora', () => {
    const deck = [card({ id: 'legado', fsrsDueAt: 'hoje' }), card({ id: 'antigo', fsrsDueAt: iso(-5 * DIA) })];
    expect(byUrgency(deck, 'fsrs', AGORA).map(c => c.id)).toEqual(['antigo', 'legado']);
  });
});
