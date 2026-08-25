import { describe, it, expect } from 'vitest';
import { formatForCard, stabilityThreshold, STABILITY_THRESHOLD_DEFAULT } from '../src/lib/exercicios/progressionRules';
import { similarityPercentage, diffWords, normalize } from '../src/lib/exercicios/diff';
import type { VocabCard } from '../src/types';

/**
 * PROGRESSÃO E COMPARAÇÃO — as regras que decidem QUE FORMATO de revisão um cartão merece e o
 * quanto uma tentativa escrita se parece com o alvo. É a Produção Ativa, que continua viva.
 *
 * ESTAS ASSERÇÕES VIERAM DE UM SEGUNDO EXECUTOR DE TESTES. O repositório carregava, desde o
 * primeiro commit, um `test.ts` na raiz com `assert` artesanal e `process.exit`, ligado ao
 * `npm test` — enquanto os 299 testes de verdade rodavam por `npm run test:unit`. Dois executores
 * é como um deles apodrece sem ninguém notar: este quebrou no instante em que um módulo que ele
 * importava saiu, e ninguém teria visto, porque a CI e o hábito usam o outro comando.
 *
 * Nada se perdeu na mudança: cada asserção de lá está aqui, mais as que faltavam.
 */

const CARTA_BASE: VocabCard = {
  id: '1',
  word: 'innovation',
  phonetics: '/ˌɪn.əˈveɪ.ʃən/',
  translation: 'inovação',
  explanation: 'A new method, idea, product, etc.',
  frequency: 'high',
  leitnerBox: 1,
  leitnerDueAt: 'hoje',
  fsrsState: 'New',
  fsrsStability: 0,
  fsrsDifficulty: 5,
  fsrsPredictedRetention: 0.9,
  fsrsDueAt: 'hoje',
  inDeck: true,
};

describe('normalize', () => {
  it('ignora pontuação, caixa e acento — a tentativa é medida pelo conteúdo', () => {
    expect(normalize('Hello, World!')).toBe('hello world');
    expect(normalize('café')).toBe('cafe');
    expect(normalize('  multiple   spaces  ')).toBe('multiple spaces');
  });
});

describe('similarityPercentage', () => {
  it('idêntico é 1, e caixa/pontuação não tiram nota', () => {
    expect(similarityPercentage('innovation', 'innovation')).toBe(1);
    expect(similarityPercentage('innovation', 'Innovation!')).toBe(1);
  });

  it('erro de digitação fica acima de 80%, palavra truncada fica abaixo', () => {
    const comErro = similarityPercentage('innovation', 'innvation');
    expect(comErro).toBeGreaterThanOrEqual(0.8);
    expect(comErro).toBeLessThan(1);
    expect(similarityPercentage('innovation', 'inv')).toBeLessThan(0.8);
  });

  it('tentativa vazia não vira nota parcial', () => {
    expect(similarityPercentage('innovation', '')).toBe(0);
  });
});

describe('formatForCard — o formato acompanha o quanto a memória já segurou', () => {
  it('memória fraca pede múltipla escolha', () => {
    expect(formatForCard({ ...CARTA_BASE, fsrsStability: 0 })).toBe('mc');
    expect(formatForCard({ ...CARTA_BASE, fsrsStability: 2.5 })).toBe('mc');
  });

  it('memória média pede digitação', () => {
    expect(formatForCard({ ...CARTA_BASE, fsrsStability: 5 })).toBe('typing');
  });

  it('memória firme pede produção ativa', () => {
    expect(formatForCard({ ...CARTA_BASE, fsrsStability: 15 })).toBe('active-production');
  });

  it('sem estabilidade nenhuma NÃO promove — na dúvida, o formato mais fácil', () => {
    const semDado = { ...CARTA_BASE };
    delete (semDado as Partial<VocabCard>).fsrsStability;
    expect(formatForCard(semDado)).toBe('mc');
  });
});

describe('stabilityThreshold', () => {
  it('sem preferência salva, usa o padrão declarado', () => {
    expect(stabilityThreshold()).toBe(STABILITY_THRESHOLD_DEFAULT);
  });
});

/**
 * `diffWords` compara LETRA a letra, apesar do nome — é usada para mostrar onde uma palavra
 * digitada divergiu da esperada, não para comparar frases. Estes testes fixam o comportamento
 * real; o nome enganoso fica registrado aqui em vez de virar surpresa para quem for reusá-la.
 */
describe('diffWords (letra a letra, não palavra a palavra)', () => {
  it('tudo igual é tudo match', () => {
    const d = diffWords('sky', 'sky');
    expect(d.every(p => p.type === 'match')).toBe(true);
    expect(d.map(p => p.value).join('')).toBe('sky');
  });

  it('letra faltando aparece como removida, e o resto reencontra o compasso', () => {
    const d = diffWords('innovation', 'innvation');
    expect(d.some(p => p.type === 'removed' && p.value === 'o')).toBe(true);
    expect(d.filter(p => p.type === 'match').length).toBeGreaterThan(7);
  });

  it('letra a mais aparece como acrescentada', () => {
    const d = diffWords('sky', 'skyy');
    expect(d.some(p => p.type === 'added' && p.value === 'y')).toBe(true);
  });
});
