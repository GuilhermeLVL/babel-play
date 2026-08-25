import { describe, it, expect } from 'vitest';
import { buildCartela, marcarFala, linhasCompletas, cartelaCheia, CASAS } from '../src/core/minigames/bingo';
import type { VocabCard } from '../src/types';

const card = (word: string, id = word): VocabCard => ({
  id, word, phonetics: '', translation: 't', explanation: '',
  frequency: 'medium', leitnerBox: 1, leitnerDueAt: '', fsrsState: 'New',
  fsrsStability: 0, fsrsDifficulty: 5, fsrsPredictedRetention: 0, fsrsDueAt: '', inDeck: true,
});
const semSorte = <T,>(xs: T[]) => [...xs];

describe('buildCartela', () => {
  it('descarta palavras curtas — artigos fechariam a cartela sozinhos', () => {
    const deck = [card('a'), card('of'), card('house'), card('water')];
    const c = buildCartela(deck, { shuffle: semSorte });
    expect(c.map(x => x.palavra)).toEqual(['house', 'water']);
  });

  it('não repete a mesma palavra (mesmo vinda de cartões diferentes)', () => {
    const c = buildCartela([card('house', 'a'), card('House', 'b'), card('water', 'c')], { shuffle: semSorte });
    expect(c.length).toBe(2);
  });

  it('respeita o tamanho da cartela', () => {
    const deck = 'abcdefghijklmnopqrstuvwxyzabcd'.split('').map((l, i) => card(`palavra${'x'.repeat(i % 5)}${l}`));
    expect(buildCartela(deck, { shuffle: semSorte }).length).toBe(CASAS);
  });

  it('ignora cartões fora do baralho', () => {
    expect(buildCartela([{ ...card('house'), inDeck: false }], { shuffle: semSorte })).toEqual([]);
  });
});

describe('marcarFala', () => {
  const cartela = () => buildCartela([card('house'), card('water'), card('green')], { shuffle: semSorte });

  it('acende a casa quando a palavra é dita', () => {
    const { cartela: nova, novas } = marcarFala(cartela(), 'I live in a big house', 1000);
    expect(novas.map(n => n.palavra)).toEqual(['house']);
    expect(nova.find(c => c.palavra === 'house')?.ouvidaEm).toBe(1000);
    expect(nova.find(c => c.palavra === 'water')?.ouvidaEm).toBeNull();
  });

  /** Sem comparação por palavra inteira, "arte" acenderia ao ouvir "partes". */
  it('NÃO acende por pedaço de palavra', () => {
    const c = buildCartela([card('arte')], { shuffle: semSorte });
    expect(marcarFala(c, 'as partes do motor', 1).novas).toEqual([]);
    expect(marcarFala(c, 'a arte moderna', 1).novas.length).toBe(1);
  });

  it('ignora acento e caixa', () => {
    const c = buildCartela([card('coração')], { shuffle: semSorte });
    expect(marcarFala(c, 'meu CORACAO dispara', 1).novas.length).toBe(1);
  });

  it('a primeira vez é a que vale — não sobrescreve o instante', () => {
    const { cartela: c1 } = marcarFala(cartela(), 'house', 1000);
    const { cartela: c2, novas } = marcarFala(c1, 'house again', 5000);
    expect(c2.find(c => c.palavra === 'house')?.ouvidaEm).toBe(1000);
    expect(novas).toEqual([]);
  });

  it('marca várias de uma vez quando a fala tem mais de uma', () => {
    expect(marcarFala(cartela(), 'the green house has water', 1).novas.length).toBe(3);
  });
});

describe('linhas e cartela cheia', () => {
  const NOMES = ['alfa', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india'];
  const nove = () => buildCartela(NOMES.map(n => card(n)), { shuffle: semSorte });
  const marcar = (c: ReturnType<typeof nove>, idx: number[]) =>
    c.map((casa, i) => (idx.includes(i) ? { ...casa, ouvidaEm: 1 } : casa));

  it('conta linha, coluna e diagonais', () => {
    expect(linhasCompletas(marcar(nove(), [0, 1, 2]))).toBe(1);       // 1ª linha
    expect(linhasCompletas(marcar(nove(), [0, 3, 6]))).toBe(1);       // 1ª coluna
    expect(linhasCompletas(marcar(nove(), [0, 4, 8]))).toBe(1);       // diagonal
    expect(linhasCompletas(marcar(nove(), [2, 4, 6]))).toBe(1);       // anti-diagonal
  });

  it('cartela sem nada marcado não tem linha', () => {
    expect(linhasCompletas(nove())).toBe(0);
  });

  it('cartela cheia conta todas as linhas de uma vez', () => {
    const cheia = marcar(nove(), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(cartelaCheia(cheia)).toBe(true);
    expect(linhasCompletas(cheia)).toBe(8); // 3 linhas + 3 colunas + 2 diagonais
  });

  it('cartela vazia não é "cheia"', () => {
    expect(cartelaCheia([])).toBe(false);
  });
});
