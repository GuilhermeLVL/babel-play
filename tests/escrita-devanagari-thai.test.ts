/** Hindi e tailandês caíam em 'desconhecido': sem faixa própria, o import não sabia o que era. */
import { describe, expect,it } from 'vitest';

import { escritaDominante } from '../server/import/anki';

describe('escritas que faltavam no detector', () => {
  it.each([
    ['devanagari', ['नमस्ते', 'किताब', 'पानी']],
    ['thai', ['หน้าต่าง', 'บ้าน', 'น้ำ']],
  ])('reconhece %s', (esperada, palavras) => {
    expect(escritaDominante(palavras)).toBe(esperada);
  });

  it('as que já funcionavam continuam iguais', () => {
    expect(escritaDominante(['窓', '家', '本'])).toBe('cjk');
    expect(escritaDominante(['たべる', 'ひらがな'])).toBe('kana');
    expect(escritaDominante(['работа', 'книга'])).toBe('cirilico');
    expect(escritaDominante(['casa', 'porta'])).toBe('latino');
  });
});
