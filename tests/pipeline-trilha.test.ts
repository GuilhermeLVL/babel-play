import { describe, expect,it } from 'vitest';

import { coberturaDasFaixas, faixas, NIVEIS } from '../scripts/trilha/faixas.mjs';
import { filtrar, motivoDoDescarte } from '../scripts/trilha/filtrar.mjs';

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

describe('faixas — contagem igual, não cobertura cumulativa', () => {
  /* Cortar por massa de corpus parece justo e é inviável numa trilha: Zipf concentra a massa em
     pouquíssimas palavras, e no espanhol real isso deu A1 com 32 palavras contra C2 com 968.179.
     Faixa é etapa de estudo, e etapa precisa ter tamanho estudável. */
  it('a cabeça pesada da lista não encolhe a primeira faixa', () => {
    const lista = [e('cabeca', 600), ...Array.from({ length: 599 }, (_, i) => e(`p${i}`, 1))];
    const porNivel = faixas(lista);
    expect(porNivel.A1.length).toBe(100);
    expect(porNivel.C2.length).toBe(100);
  });

  it('a fatia do corpus é desigual, e o cumulativo fecha em 1', () => {
    const lista = Array.from({ length: 600 }, (_, i) => e(`p${i}`, 600 - i));
    const cobertura = coberturaDasFaixas(faixas(lista));
    expect(cobertura[0].fatia).toBeGreaterThan(cobertura.at(-1)!.fatia);
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
