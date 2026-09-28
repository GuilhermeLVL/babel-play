import { describe, expect, it } from 'vitest';

import { escolherPorCognato, escritaServe, lematizar, montarDicionario } from '../scripts/trilha/lexemes.mjs';

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

describe('escritaServe — o aljamiado do Wikidata não vira glosa portuguesa', () => {
  it('recusa letra não latina para nativo latino', () => {
    expect(escritaServe('كَاجَ', 'pt')).toBe(false);
    expect(escritaServe('casa', 'pt')).toBe(true);
    expect(escritaServe('hidrogénio/hidrogênio', 'pt')).toBe(true);
  });

  it('nativo de outra escrita não passa pelo filtro latino', () => {
    expect(escritaServe('дом', 'ru')).toBe(true);
  });
});

describe('montarDicionario — o dicionário do toque, maior que a trilha', () => {
  const bruta = [conta('casas', 50), conta('casa', 40), conta('hablo', 30), conta('perro', 10), conta('gato', 5)];
  const mapa = new Map([['casas', 'casa'], ['hablo', 'hablar']]);
  const glosas = new Map([['casa', 'casa'], ['hablar', 'falar'], ['perro', 'cachorro'], ['gato', 'كَاتُ']]);

  it('glosas dos N lemas mais frequentes, sem escrita errada', () => {
    const d = montarDicionario({ bruta, mapaDeLemas: mapa, glosas, limite: 10, lang: 'es', nativo: 'pt' });
    expect(d.glosas).toEqual({ casa: 'casa', hablar: 'falar', perro: 'cachorro' });
  });

  it('corta no limite de lemas', () => {
    const d = montarDicionario({ bruta, mapaDeLemas: mapa, glosas, limite: 2, lang: 'es', nativo: 'pt' });
    expect(Object.keys(d.glosas)).toEqual(['casa', 'hablar']);
  });

  it('formas → lema só para forma diferente do lema e lema com glosa', () => {
    const d = montarDicionario({ bruta, mapaDeLemas: mapa, glosas, limite: 10, lang: 'es', nativo: 'pt' });
    expect(d.formas).toEqual({ casas: 'casa', hablo: 'hablar' });
  });
});
