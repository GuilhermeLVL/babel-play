import { describe, expect, it } from 'vitest';

import { motivoDoDescarte } from '../scripts/trilha/filtrar.mjs';
import { avaliarCartao } from '../src/core/learning/quality';

/**
 * O diacrítico não é letra, e a regra de "só letras" jogava fora vocabulário essencial: medido no
 * árabe, 445 palavras de 6.000, entre elas "obrigado" e "olá". Vale para árabe, hebraico,
 * devanágari e tailandês, onde a marca faz parte da grafia.
 */
describe('marcas combinantes fazem parte da palavra', () => {
  it('aceita árabe com harakat', () => {
    expect(motivoDoDescarte('شكراً', 'ar')).toBeNull();
    expect(motivoDoDescarte('مرحباً', 'ar')).toBeNull();
  });

  it('aceita devanágari com matra', () => {
    expect(motivoDoDescarte('किताब', 'hi')).toBeNull();
    expect(motivoDoDescarte('नमस्ते', 'hi')).toBeNull();
  });

  it('aceita hebraico com niqqud', () => {
    expect(motivoDoDescarte('שָׁלוֹם', 'he')).toBeNull();
  });

  it('continua recusando pontuação e símbolo de verdade', () => {
    expect(motivoDoDescarte('،', 'ar')).toBe('simbolo');
    expect(motivoDoDescarte('%', 'en')).toBe('simbolo');
    expect(motivoDoDescarte('a.m.', 'en')).toBe('abreviacao');
  });
});

describe('a régua do app conta a marca como parte da palavra', () => {
  const cartao = (word: string, srcLang: string) =>
    avaliarCartao({ word, translation: 'x', srcLang } as never, { lang: srcLang, origem: 'curado' });

  it('devanágari e árabe com marca não são ruído', () => {
    expect(cartao('तुम्हें', 'hi').motivo).not.toBe('palavra-ruido');
    expect(cartao('أَرَادَ', 'ar').motivo).not.toBe('palavra-ruido');
    expect(cartao('שָׁלוֹם', 'he').motivo).not.toBe('palavra-ruido');
  });

  it('continua barrando ruído de verdade', () => {
    expect(cartao('>>>', 'en').motivo).toBe('palavra-ruido');
    expect(cartao('ab3', 'en').motivo).toBe('palavra-ruido');
    expect(cartao('aaah', 'en').motivo).toBe('palavra-ruido');
  });
});
