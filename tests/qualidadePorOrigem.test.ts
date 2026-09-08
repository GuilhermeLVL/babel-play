import { describe, it, expect } from 'vitest';
import { avaliarCartao, pistasDaTriagem, type Triagem } from '../src/core/learning/quality';
import type { VocabCard } from '../src/types';

/**
 * O PERFIL 'curado' EXISTE PORQUE A RÉGUA DE CAPTURA NÃO SERVE PARA UM BARALHO ANKI.
 *
 * `pistaUtil`/`avaliarCartao` foram calibrados para fala transcrita (docblock de `quality.ts`):
 * pista com mais de 42 caracteres ou 5 palavras é reprovada porque, nesse funil, pista longa é
 * fragmento de fala. Só que um verso de dicionário — "To agree is to have the same opinion or
 * belief as another person." — também é longo, e por um motivo oposto: é definição de verdade.
 *
 * Medido no baralho real "4000 Essential English Words" (3.600 notas): mediana do verso 57
 * chars/11 palavras, p90 76/15, p99 96/18, máximo 125/24. Com o limite de captura (42/5), 2.981
 * notas (82,8%) eram reprovadas só por tamanho, e o resultado final era 61 de 3.600 aprovadas.
 */

function card(over: Partial<VocabCard> = {}): VocabCard {
  return {
    id: 'c', word: 'agree', phonetics: '', translation: 'concordar', explanation: '',
    leitnerBox: 1, leitnerDueAt: '2026-08-01T00:00:00.000Z',
    fsrsState: 'Review', fsrsStability: 5, fsrsDifficulty: 5, fsrsPredictedRetention: 0,
    fsrsDueAt: '2026-08-01T00:00:00.000Z', inDeck: true, srcLang: 'en', ...over,
  };
}

describe('perfil curado aceita definição de dicionário que captura reprovaria', () => {
  const definicao = 'To agree is to have the same opinion or belief as another person.';

  it('recusada em captura (default), aceita em curado', () => {
    const captura = avaliarCartao(card({ translation: definicao }));
    const curado = avaliarCartao(card({ translation: definicao }), { origem: 'curado' });
    expect(captura.serve).toBe(false);
    expect(captura.motivo).toBe('pista-ruim');
    expect(curado.serve).toBe(true);
  });
});

describe('fragmentos de fala continuam recusados no perfil captura', () => {
  const casos: Array<[string, string]> = [
    ['Isso é', 'Isso é'],
    ['rápida!!', 'rápida!!'],
  ];

  for (const [nome, traducao] of casos) {
    it(nome + ' → recusado em captura', () => {
      expect(avaliarCartao(card({ translation: traducao })).serve).toBe(false);
    });
  }

  /**
   * O BURACO QUE ESTE TESTE PEGOU, e por que a régua mudou por causa dele.
   *
   * O perfil curado nasceu afrouxando só tamanho, dígito, pontuação e a heurística de pronome. Aí
   * "Isso é" (6 chars/2 palavras) e "rápida!!" (8 chars/1 palavra) passaram a ser aceitos como
   * pista de baralho: cabem nos limites de tamanho e nenhuma regra restante os pegava. Fragmento
   * de fala não vira material de estudo só porque veio de um arquivo `.apkg`.
   *
   * Duas regras voltaram a valer nos DOIS perfis: pronome sozinho (nenhuma tradução real tem a
   * forma "pronome + no máximo mais uma palavra") e pontuação repetida (nenhum dicionário escreve
   * "!!"). São as únicas que separam fragmento curto de tradução curta — e tradução curta ("água")
   * precisa continuar passando, o que os testes abaixo garantem.
   */
  it('fragmento de fala continua recusado no curado — o tamanho não é a única régua', () => {
    expect(avaliarCartao(card({ translation: 'Isso é' }), { origem: 'curado' }).serve).toBe(false);
    expect(avaliarCartao(card({ translation: 'rápida!!' }), { origem: 'curado' }).serve).toBe(false);
  });

  it('mas tradução CURTA e legítima passa nos dois perfis', () => {
    for (const origem of ['captura', 'curado'] as const) {
      expect(avaliarCartao(card({ word: 'water', translation: 'água' }), { origem }).serve).toBe(true);
      expect(avaliarCartao(card({ word: 'fast', translation: 'rápida' }), { origem }).serve).toBe(true);
    }
  });
});

describe('dígito na pista: ruído em captura, definição legítima em curado', () => {
  const pista = 'a period of 100 years';

  it('aceita em curado, recusa em captura (dígito)', () => {
    const captura = avaliarCartao(card({ word: 'century', translation: pista }));
    const curado = avaliarCartao(card({ word: 'century', translation: pista }), { origem: 'curado' });
    expect(captura.serve).toBe(false);
    expect(captura.motivo).toBe('pista-ruim');
    expect(curado.serve).toBe(true);
  });
});

describe('pista de 300 caracteres é parágrafo, não cabe em cartão de jogo', () => {
  const pistaEnorme = 'a '.repeat(150).trim(); // bem acima de 160 chars e de 30 palavras

  it('recusada nos dois perfis', () => {
    expect(avaliarCartao(card({ translation: pistaEnorme })).serve).toBe(false);
    expect(avaliarCartao(card({ translation: pistaEnorme }), { origem: 'curado' }).serve).toBe(false);
  });
});

describe('regras de LIXO continuam valendo nos dois perfis (não são regra de comprimento)', () => {
  it('palavra com dígito → palavra-ruido nos dois', () => {
    const captura = avaliarCartao(card({ word: 'casa2', translation: 'casa' }));
    const curado = avaliarCartao(card({ word: 'casa2', translation: 'casa' }), { origem: 'curado' });
    expect(captura.motivo).toBe('palavra-ruido');
    expect(curado.motivo).toBe('palavra-ruido');
  });

  it('tradução igual à palavra → traducao-igual nos dois', () => {
    const captura = avaliarCartao(card({ word: 'hotel', translation: 'Hotel' }));
    const curado = avaliarCartao(card({ word: 'hotel', translation: 'Hotel' }), { origem: 'curado' });
    expect(captura.motivo).toBe('traducao-igual');
    expect(curado.motivo).toBe('traducao-igual');
  });
});

describe('regressão: sem opts.origem, o veredito é idêntico ao de antes (default não mudou nada)', () => {
  const amostra: Array<Partial<VocabCard>> = [
    { translation: 'casa' },
    { translation: 'Isso é' },
    { translation: 'rápida!!' },
    { translation: '...ambém o idioma que' },
    { word: 'a', translation: 'um' },
    { word: 'covid19', translation: 'doença' },
    { word: 'hotel', translation: 'Hotel' },
    { word: 'the', translation: 'o' },
    { translation: '', sentence: '' },
    { translation: 'casa', sentence: 'I live in a house.' },
    { translation: 'lugar onde se mora' },
  ];

  for (const over of amostra) {
    it(JSON.stringify(over), () => {
      const semOrigem = avaliarCartao(card(over));
      const comOrigemExplicita = avaliarCartao(card(over), { origem: 'captura' });
      expect(semOrigem).toEqual(comOrigemExplicita);
    });
  }
});

describe('S1a — pistasDaTriagem usava a régua errada para cartão daAnki (bug medido: "20/827")', () => {
  /* Definição de dicionário: 100 chars, bem acima do limite de captura (42/5) e dentro do de
   * curado (160/30). `avaliarCartao` já a aprova como 'curado' quando `card.daAnki` é true (é a
   * origem que `triarCartoes` deriva). `pistasDaTriagem` chamava `pistaUtil` sem origem — sempre
   * captura — e reprovava o MESMO cartão que o vizinho `avaliarCartao` tinha aprovado: um baralho
   * de 847 cartões Anki, todos com tradução, aparecia como "20 com tradução · 827 só com frase". */
  const definicaoDeDicionario =
    'A period of one hundred years, often used to describe a century in historical or scientific contexts today.';

  const usavel = (over: Partial<import('../src/types').VocabCard>): Triagem => ({
    usaveis: [card(over)], fora: [], outroIdioma: [],
  });

  it('cartão daAnki com definição de 100 chars vai para comTraducao (a régua curada aprova)', () => {
    const t = usavel({ daAnki: true, translation: definicaoDeDicionario });
    const { comTraducao, soComFrase } = pistasDaTriagem(t);
    expect(comTraducao).toHaveLength(1);
    expect(soComFrase).toHaveLength(0);
  });

  it('o MESMO texto, sem daAnki, vai para soComFrase — a régua de captura reprova (regressão intacta)', () => {
    const t = usavel({ daAnki: false, translation: definicaoDeDicionario });
    const { comTraducao, soComFrase } = pistasDaTriagem(t);
    expect(comTraducao).toHaveLength(0);
    expect(soComFrase).toHaveLength(1);
  });
});
