import { describe, expect, it } from 'vitest';

import { escolherPorCognato,lematizar } from '../scripts/trilha/lexemes.mjs';

const conta = (palavra: string, contagem: number) => ({ palavra, contagem });

describe('lematizar', () => {
  it('soma as contagens das formas no lema', () => {
    const mapa = new Map([['estoy', 'estar'], ['estás', 'estar']]);
    const fora = lematizar([conta('estoy', 30), conta('estás', 20)], mapa, 'es');
    expect(fora).toEqual([conta('estar', 50)]);
  });

  const dicionario = new Map([['dar', 'dar'], ['llamar', 'llamar'], ['par', 'par']]);

  it('descola o pronome enclítico e junta com o verbo', () => {
    const fora = lematizar([conta('darme', 10), conta('dar', 4), conta('llamarla', 5)], dicionario, 'es');
    expect(fora).toEqual([conta('dar', 14), conta('llamar', 5)]);
  });

  it('não descola de palavra que apenas termina em pronome', () => {
    // `parte` tem raiz no dicionário mas não é verbo; `suerte` parece verbo mas a raiz não é palavra.
    const fora = lematizar([conta('parte', 9), conta('suerte', 8), conta('hombre', 7)], dicionario, 'es');
    expect(fora.map((p: { palavra: string }) => p.palavra)).toEqual(['parte', 'suerte', 'hombre']);
  });

  it('não descola em idioma sem enclítico', () => {
    expect(lematizar([conta('darme', 3)], dicionario, 'en')[0].palavra).toBe('darme');
  });
});

describe('escolherPorCognato', () => {
  it('a forma parecida vence a acepção lateral', () => {
    expect(escolherPorCognato('negocio', ['loja', 'negócio'])).toBe('negócio');
    expect(escolherPorCognato('institución', ['órgão', 'instituição'])).toBe('instituição');
  });

  it('palavra transparente não gera glosa, e leva as laterais junto', () => {
    expect(escolherPorCognato('temor', ['insegurança', 'temor'])).toBeNull();
    expect(escolherPorCognato('infiel', ['mouro', 'infiel'])).toBeNull();
  });

  it('sem cognato entre as candidatas, respeita a ordem do dicionário', () => {
    expect(escolherPorCognato('cuchillo', ['faca', 'punhal'])).toBe('faca');
  });

  it('candidata única passa direto', () => {
    expect(escolherPorCognato('gota', ['pingo'])).toBe('pingo');
  });
});
