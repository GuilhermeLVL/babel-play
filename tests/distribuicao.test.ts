/**
 * A DISTRIBUIÇÃO MULTI-FONTE (Q1 → ADR): proporcional ao pool, piso 1, maior-resto,
 * determinística, ordem global preservada. Os invariantes aqui são o CONTRATO — a UI multi-fonte
 * só pode existir porque estes testes travam que a união não vira "quem chegou primeiro engole".
 */
import { describe, it, expect } from 'vitest';
import { cotasPorMaiorResto, distribuirPorFonte } from '../src/core/minigames/distribuicao';
import type { CartaoFiltravel } from '../src/core/minigames/filtro';

type CartaoDeTeste = CartaoFiltravel & { word: string };
const cartao = (n: number, fonte: 'baralho' | 'sessao' | 'trilha'): CartaoDeTeste => ({
  word: `w${n}`,
  daTrilha: fonte === 'trilha',
  sourceSessionId: fonte === 'sessao' ? 's1' : undefined,
  baralhosAnki: fonte === 'baralho' ? ['d1'] : [],
} as unknown as CartaoDeTeste);

describe('cotasPorMaiorResto', () => {
  it('soma exatamente o alvo e é proporcional', () => {
    expect(cotasPorMaiorResto([600, 300, 100], 10)).toEqual([6, 3, 1]);
    expect(cotasPorMaiorResto([600, 300, 100], 100)).toEqual([60, 30, 10]);
  });

  it('piso 1: fonte pequena com material nunca zera', () => {
    const cotas = cotasPorMaiorResto([990, 9, 1], 10);
    expect(cotas[2]).toBeGreaterThanOrEqual(1);
    expect(cotas.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('nunca pede mais do que o pool tem', () => {
    const cotas = cotasPorMaiorResto([2, 500], 200);
    expect(cotas[0]).toBeLessThanOrEqual(2);
    expect(cotas.reduce((a, b) => a + b, 0)).toBe(200);
  });

  it('população menor que o alvo devolve tudo', () => {
    expect(cotasPorMaiorResto([3, 2], 200)).toEqual([3, 2]);
  });

  it('determinística: mesma entrada, mesma saída', () => {
    const a = cotasPorMaiorResto([7, 7, 7], 10);
    const b = cotasPorMaiorResto([7, 7, 7], 10);
    expect(a).toEqual(b);
    expect(a.reduce((x, y) => x + y, 0)).toBe(10);
  });

  it('pool vazio recebe zero, sem roubar o piso dos outros', () => {
    expect(cotasPorMaiorResto([0, 10], 5)).toEqual([0, 5]);
  });
});

describe('distribuirPorFonte', () => {
  it('com uma fonte só, é o prefixo simples — comportamento antigo intocado', () => {
    const pool = [cartao(1, 'baralho'), cartao(2, 'baralho'), cartao(3, 'baralho')];
    expect(distribuirPorFonte(pool, { fontes: ['baralho'] }, 2)).toHaveLength(2);
    expect(distribuirPorFonte(pool, { fontes: ['baralho'] }, 2)[0].word).toBe('w1');
  });

  it('a fonte pequena entra na rodada — o baralho grande não a engole', () => {
    // 95 do baralho na frente (tudo dueAt=now de um import), 5 da sessão atrás.
    const pool = [
      ...Array.from({ length: 95 }, (_, i) => cartao(i, 'baralho')),
      ...Array.from({ length: 5 }, (_, i) => cartao(100 + i, 'sessao')),
    ];
    const rodada = distribuirPorFonte(pool, { fontes: ['baralho', 'sessao'] }, 20);
    const daSessao = rodada.filter((c) => c.sourceSessionId).length;
    expect(rodada).toHaveLength(20);
    expect(daSessao).toBe(1); // proporcional (5% de 20) com piso — presente, não dominante
  });

  it('a ordem GLOBAL é preservada — a cota decide quem entra, não a ordem', () => {
    const pool = [cartao(1, 'sessao'), cartao(2, 'baralho'), cartao(3, 'sessao'), cartao(4, 'baralho')];
    const rodada = distribuirPorFonte(pool, { fontes: ['baralho', 'sessao'] }, 4);
    expect(rodada.map((c) => c.word)).toEqual(['w1', 'w2', 'w3', 'w4']);
  });

  it('cartão que casa com duas fontes conta UMA vez, na mais específica', () => {
    const misto = { ...cartao(1, 'sessao'), baralhosAnki: ['d1'] } as CartaoFiltravel;
    const rodada = distribuirPorFonte([misto], { fontes: ['baralho', 'sessao'] }, 5);
    expect(rodada).toHaveLength(1);
  });

  it('três fontes, proporções respeitadas dentro de ±1 do exato', () => {
    const pool = [
      ...Array.from({ length: 60 }, (_, i) => cartao(i, 'baralho')),
      ...Array.from({ length: 30 }, (_, i) => cartao(100 + i, 'sessao')),
      ...Array.from({ length: 10 }, (_, i) => cartao(200 + i, 'trilha')),
    ];
    const rodada = distribuirPorFonte(pool, { fontes: ['baralho', 'sessao', 'trilha'] }, 10);
    const conta = (f: (c: CartaoFiltravel) => boolean) => rodada.filter(f).length;
    expect(rodada).toHaveLength(10);
    expect(conta((c) => c.daTrilha === true)).toBe(1);
    expect(conta((c) => !!c.sourceSessionId)).toBe(3);
    expect(conta((c) => !c.daTrilha && !c.sourceSessionId)).toBe(6);
  });
});
