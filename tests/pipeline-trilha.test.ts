import { describe, it, expect } from 'vitest';
import { filtrar, motivoDoDescarte } from '../scripts/trilha/filtrar.mjs';
import { faixas, coberturaDasFaixas, NIVEIS } from '../scripts/trilha/faixas.mjs';

const e = (palavra: string, contagem = 1) => ({ palavra, contagem });

describe('filtrar — as regras do FONTES.md', () => {
  it('descarta abreviação com ponto, dígito e locução', () => {
    expect(motivoDoDescarte('a.m.', 'en')).toBe('abreviacao');
    expect(motivoDoDescarte('covid19', 'en')).toBe('digito');
    expect(motivoDoDescarte('de repente', 'pt')).toBe('locucao');
  });

  it('exige 3–14 letras no alfabeto, mas 1 caractere basta em Han/kana/hangul', () => {
    expect(motivoDoDescarte('be', 'en')).toBe('curta');
    expect(motivoDoDescarte('casa', 'pt')).toBeNull();
    expect(motivoDoDescarte('a'.repeat(15), 'en')).toBe('longa');
    expect(motivoDoDescarte('窓', 'ja')).toBeNull();
    expect(motivoDoDescarte('の', 'ja')).toBeNull();
    expect(motivoDoDescarte('한', 'ko')).toBeNull();
  });

  it('aceita hífen e apóstrofo internos, recusa símbolo solto', () => {
    expect(motivoDoDescarte('mother-in-law', 'en')).toBeNull();
    expect(motivoDoDescarte("l'eau", 'fr')).toBeNull();
    expect(motivoDoDescarte('>>>', 'en')).toBe('simbolo');
    expect(motivoDoDescarte('-casa', 'pt')).toBe('simbolo');
  });

  it('aplica a régua gramatical do app no idioma certo', () => {
    expect(motivoDoDescarte('the', 'en')).toBe('gramatical');
    // "não" é gramatical em pt e não é palavra do inglês: a lista é POR idioma.
    expect(motivoDoDescarte('não', 'pt')).toBe('gramatical');
    expect(motivoDoDescarte('não', 'en')).toBeNull();
  });

  it('colapsa variantes e a primeira ocorrência vence', () => {
    const { palavras, descartes } = filtrar([e('Casa', 9), e('casa', 4), e('CASA', 2), e('livro', 1)], 'pt');
    expect(palavras.map((p: { palavra: string }) => p.palavra)).toEqual(['Casa', 'livro']);
    expect(descartes.variante).toBe(2);
  });

  it('conta os descartes por motivo e preserva a ordem da fonte', () => {
    const { palavras, descartes } = filtrar(
      [e('the', 9), e('house', 8), e('a.m.', 7), e('big house', 6), e('water', 5)], 'en');
    expect(palavras.map((p: { palavra: string }) => p.palavra)).toEqual(['house', 'water']);
    expect(descartes).toEqual({ gramatical: 1, abreviacao: 1, locucao: 1 });
  });
});

describe('faixas — cobertura cumulativa, não contagem igual', () => {
  it('a faixa inicial fica pequena quando a cabeça da lista é pesada', () => {
    // 600 de massa na primeira palavra e 1 em cada uma das outras 600: ~1/6 da massa é 1 palavra.
    const lista = [e('cabeca', 600), ...Array.from({ length: 600 }, (_, i) => e(`p${i}`, 1))];
    const porNivel = faixas(lista);
    expect(porNivel.A1.length).toBe(1);
    expect(porNivel.C2.length).toBeGreaterThan(porNivel.A1.length);
  });

  it('cada faixa carrega perto de um sexto do corpus', () => {
    const lista = Array.from({ length: 600 }, (_, i) => e(`p${i}`, 600 - i));
    const cobertura = coberturaDasFaixas(faixas(lista));
    for (const c of cobertura) expect(c.fatia).toBeGreaterThan(0.1);
    expect(cobertura.at(-1)!.cumulativo).toBeCloseTo(1, 6);
  });

  it('não perde nem duplica palavra, e mantém a ordem', () => {
    const lista = Array.from({ length: 120 }, (_, i) => e(`p${i}`, 120 - i));
    const porNivel = faixas(lista);
    const todas = NIVEIS.flatMap((n: string) => porNivel[n].map((p: { palavra: string }) => p.palavra));
    expect(todas).toEqual(lista.map((p) => p.palavra));
  });

  it('com poucas palavras nenhuma faixa fica vazia', () => {
    const porNivel = faixas(Array.from({ length: 6 }, (_, i) => e(`p${i}`, 10)));
    for (const n of NIVEIS) expect(porNivel[n].length).toBe(1);
  });

  it('lista vazia devolve as seis faixas vazias', () => {
    const porNivel = faixas([]);
    expect(Object.keys(porNivel)).toEqual(NIVEIS);
    for (const n of NIVEIS) expect(porNivel[n]).toEqual([]);
  });
});
