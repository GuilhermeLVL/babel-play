import { describe, expect, it } from 'vitest';

import { buildCartela, marcarFala } from '../src/core/minigames/bingo';
import { buildRodadasConectores, conferirDitado } from '../src/core/minigames/escuta';
import { palavrasDaFrase } from '../src/core/minigames/palavrasDaFrase';
import { buildScrambleRounds, tokenize } from '../src/core/minigames/scramble';
import type { VocabCard } from '../src/types';

/**
 * OS JOGOS DE FRASE SEPARAM PALAVRAS PELO IDIOMA DA FALA (integração com "idioma da sessão",
 * 2026-09-26). `split(/\s+/)` tratava uma frase japonesa inteira como UMA palavra: a Frase
 * embaralhada nem montava (menos de 4 peças) e o Ditado dava 0% ou 100% para a frase toda.
 *
 * O que NÃO muda, de propósito: em idioma com espaço, a peça é a palavra COMO ESCRITA ("John's",
 * "d'água", com a pontuação colada). `palavrasDoTexto` devolve o verbete ("John", "água") — certo
 * para vocabulário e bingo, errado para remontar a frase que a pessoa ouviu.
 */
describe('palavrasDaFrase', () => {
  it('japonês é segmentado por palavra', () => {
    expect(palavrasDaFrase('私は学生です。', 'ja')).toEqual(['私', 'は', '学生', 'です']);
  });

  it('idioma com espaço mantém a forma escrita', () => {
    expect(palavrasDaFrase("John's car is red.", 'en')).toEqual(["John's", 'car', 'is', 'red.']);
    expect(palavrasDaFrase("Um copo d'água, por favor.", 'pt')).toContain("d'água,");
  });
});

describe('Frase embaralhada', () => {
  it('uma frase japonesa vira peças e a rodada monta', () => {
    expect(tokenize('私は毎日学校に行きます', 'ja').length).toBeGreaterThanOrEqual(4);
    const r = buildScrambleRounds([{ id: 's1', text: '私は毎日学校に行きます', translation: 'Vou à escola todo dia', lang: 'ja' }]);
    expect(r).toHaveLength(1);
  });
});

describe('Ditado', () => {
  it('japonês é conferido palavra a palavra', () => {
    const r = conferirDitado('私は学生です', '私は先生です', 'ja');
    expect(r.total).toBe(4);
    expect(r.acertos).toBe(3);
  });
});

describe('Caça-conectores', () => {
  it('as peças da frase saem da mesma régua', () => {
    const [r] = buildRodadasConectores(
      [{ id: 'c1', text: 'I wanted to go, but it was raining outside.', translation: 'x', lang: 'en', startMs: 0, endMs: 1000 }],
      { lang: 'en' },
    );
    expect(r.tokens[r.alvos[0]].toLowerCase()).toBe('but');
  });
});

describe('Bingo', () => {
  it('a forma com clítico marca o verbo na cartela (português)', () => {
    const palavras = ['fazer', 'casa', 'mesa', 'porta', 'livro', 'janela', 'escola', 'cidade', 'praia'];
    const cards = palavras.map((word, i) => ({ id: String(i), word, inDeck: true }) as unknown as VocabCard);
    const cartela = buildCartela(cards, { shuffle: (xs) => [...xs] });
    const { novas } = marcarFala(cartela, 'Vou fazê-lo amanhã', 0, 'pt');
    expect(novas.map((c) => c.palavra)).toContain('fazer');
  });
});
