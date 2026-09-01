/** Relatório de progresso (spec progresso-de-idioma): texto dos dados reais, nunca inventado. */
import { describe, it, expect } from 'vitest';
import { gerarRelatorioDeProgresso } from '../src/lib/relatorioDeProgresso';
import type { AppMetrics } from '@core';

const base: AppMetrics = {
  sessions: 2, wordsCaptured: 300, deckSize: 201, newCards: 180, dueToday: 20,
  reviews: 40, correctReviews: 30, drillItems: 0, drillCorrect: 0,
  accuracy: 0.75, accuracyConfidence: 0.9, streakDays: 3, seedsGastas: 0,
  avgStability: 2, avgRetention: 0.8, avgRetentionConfidence: 0.7,
  vocabByWeek: [], speakingMs: 120_000, wpm: 110, wpmConfidence: 0.5, uniqueWords: 150,
  levelDistribution: [], levelConfidence: 0,
} as unknown as AppMetrics;

describe('gerarRelatorioDeProgresso', () => {
  it('separa ativo de passivo e calcula a proporção', () => {
    const r = gerarRelatorioDeProgresso({ ...base, listeningMs: 240_000 });
    expect(r).toContain('Falando (sua voz): 2 min');
    expect(r).toContain('Ouvindo (áudio de terceiros): 4 min');
    expect(r).toContain('Proporção ativa: 33%');
  });

  it('sem palavras difíceis, diz a base em vez de inventar lista', () => {
    const r = gerarRelatorioDeProgresso(base);
    expect(r).toContain('Nenhuma com base suficiente');
  });

  it('com palavras difíceis, lista lapses e erro por palavra', () => {
    const r = gerarRelatorioDeProgresso({
      ...base,
      palavrasDificeis: [{ cardId: 'c1', word: 'leverage', lapses: 3, revisoes: 7, fracaoDeErro: 0.43, pontuacao: 9 }],
    });
    expect(r).toContain('- leverage: 3 esquecimentos, 43% de erro em 7 revisões');
  });

  it('retenção sem base vira frase honesta, não zero', () => {
    const r = gerarRelatorioDeProgresso({ ...base, avgRetentionConfidence: 0 });
    expect(r).toContain('sem base ainda');
  });

  /* "Exportar Meu Caderno" gerava um arquivo sem nenhuma palavra — o usuário pedia o caderno e
     recebia o boletim (spec entrega-honesta). */
  it('o caderno exportado contém as palavras, e diz quais estão sem tradução', () => {
    const cartoes = [
      { id: 'a', word: 'leverage', translation: 'alavancagem' },
      { id: 'b', word: 'cohort', translation: '' },
    ] as never;
    const r = gerarRelatorioDeProgresso(base, cartoes);
    expect(r).toContain('== Meu caderno (2 palavras) ==');
    expect(r).toContain('- leverage — alavancagem');
    expect(r).toContain('- cohort — (sem tradução)');
  });

  it('sem cartões, o relatório continua válido e não inventa seção vazia', () => {
    expect(gerarRelatorioDeProgresso(base)).not.toContain('Meu caderno');
  });
});
