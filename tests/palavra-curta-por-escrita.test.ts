/**
 * A régua de comprimento mínimo conta CARACTERES, e isso só faz sentido em escrita alfabética.
 * Medido no G0: um baralho japonês de 10 notas perdeu 7 por `palavra-curta` — 窓 (janela),
 * 家 (casa), 本 (livro) são palavras inteiras.
 */
import { describe, expect,it } from 'vitest';

import { avaliarCartao, foraDoBulkAdd } from '../src/core/learning/quality';

const cartao = (word: string, translation: string) =>
  ({ word, translation, sentence: '', srcLang: 'ja', inDeck: 1 } as never);

describe('palavra de um caractere', () => {
  it.each([
    ['窓', 'janela'],
    ['家', 'casa'],
    ['本', 'livro'],
    ['道', 'caminho'],
    ['町', 'cidade'],
    ['水', 'agua'],
  ])('%s é palavra inteira em japonês e não pode ser reprovada por tamanho', (palavra, traducao) => {
    const v = avaliarCartao(cartao(palavra, traducao));
    expect(v.motivo).not.toBe('palavra-curta');
  });

  it('hangul de um bloco também conta', () => {
    expect(avaliarCartao(cartao('물', 'agua')).motivo).not.toBe('palavra-curta');
  });

  it('mas letra latina solta continua curta demais', () => {
    expect(avaliarCartao(cartao('a', 'artigo')).motivo).toBe('palavra-curta');
    expect(avaliarCartao(cartao('я', 'eu')).motivo).toBe('palavra-curta');
  });

  it('vazio continua reprovado', () => {
    expect(avaliarCartao(cartao('', 'nada')).motivo).toBe('palavra-curta');
  });
});

describe('a segunda régua de comprimento (foraDoBulkAdd, usada na projeção do Anki)', () => {
  it.each(['車', '山', '窓', '물'])('%s passa', (p) => {
    expect(foraDoBulkAdd(p)).toBeNull();
  });

  it('letra latina solta continua barrada', () => {
    expect(foraDoBulkAdd('a')).toBe('palavra-curta');
  });

  it('e o teto continua valendo', () => {
    expect(foraDoBulkAdd('x'.repeat(201))).toBe('palavra-longa');
  });
});
