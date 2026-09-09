import { describe, expect, it } from 'vitest';

import { avaliarFrase,contarPalavras } from '../src/core/learning/quality';

/**
 * `split(/\s+/)` responde 1 para qualquer frase japonesa, e a régua reprovava o idioma inteiro:
 * 5 frases de 5.947 passavam no dump do Tatoeba. Isso valia para a trilha E para o que o próprio
 * usuário captura.
 */
describe('contarPalavras', () => {
  it('conta por espaço onde existe espaço', () => {
    expect(contarPalavras('Este ano esperamos uma boa colheita')).toBe(6);
    expect(contarPalavras('Как дела у тебя сегодня')).toBe(5);
  });

  it('conta por caractere em japonês, chinês e tailandês', () => {
    // 17 caracteres sem pontuação -> ~8 palavras (mediana real do dump japonês)
    expect(contarPalavras('お誕生日おめでとうムーリエル！')).toBeGreaterThanOrEqual(5);
    expect(contarPalavras('我们需要更多的时间来完成这个项目')).toBeGreaterThanOrEqual(5);
  });

  it('coreano usa espaço e não entra na regra de caractere', () => {
    expect(contarPalavras('저는 한국어를 공부하고 있습니다')).toBe(4);
  });

  it('texto vazio não conta nada', () => {
    expect(contarPalavras('')).toBe(0);
    expect(contarPalavras('   ')).toBe(0);
  });
});

describe('avaliarFrase em escrita sem espaço', () => {
  it('aprova a frase japonesa de tamanho normal', () => {
    expect(avaliarFrase('お誕生日おめでとうムーリエル！').serve).toBe(true);
  });

  it('reprova a frase japonesa curta demais', () => {
    const v = avaliarFrase('はい。');
    expect(v.serve).toBe(false);
    expect(v.motivo).toBe('palavra-curta');
  });

  it('não afeta o veredito das frases com espaço', () => {
    expect(avaliarFrase('Este ano esperamos uma boa colheita.').serve).toBe(true);
    expect(avaliarFrase('Oi.').serve).toBe(false);
  });
});
