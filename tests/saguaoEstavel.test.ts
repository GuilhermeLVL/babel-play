/**
 * AS MEMÓRIAS DO SAGUÃO DO JOGAR (auditoria de desempenho de 10/10/2026, gargalos 2 e 8).
 *
 * Duas peças: a guarda de referência (`lib/jogos/saguaoEstavel`), que devolve a resposta anterior
 * enquanto a nova for igual, e a memória por texto (`core/texto/memoDeTexto`), que guarda a resposta
 * de uma função pura. O que se prova aqui é o que dá o direito de guardar: dado igual reaproveita,
 * dado diferente NUNCA devolve a resposta velha.
 */
import { describe, expect, it, vi } from 'vitest';

import type { Triagem } from '../src/core';
import { buildItems, canPlay, promptFor } from '../src/core/minigames/itemSource';
import { memoDeTexto } from '../src/core/texto/memoDeTexto';
import { chaveDaPalavra } from '../src/core/texto/palavra';
import { guardaDeReferencia, mesmaLista, mesmaTriagem } from '../src/lib/jogos/saguaoEstavel';
import type { VocabCard } from '../src/types';

const carta = (word: string, extra: Partial<VocabCard> = {}): VocabCard =>
  ({
    id: `c-${word}`,
    word,
    translation: `tradução de ${word}`,
    srcLang: 'en',
    inDeck: true,
    fsrsDueAt: '',
    leitnerDueAt: '',
    ...extra,
  }) as VocabCard;

describe('memoDeTexto', () => {
  it('faz a conta uma vez por texto e devolve o mesmo valor', () => {
    const conta = vi.fn((s: string) => s.toUpperCase());
    const guardada = memoDeTexto(conta);
    expect(guardada('sol')).toBe('SOL');
    expect(guardada('sol')).toBe('SOL');
    expect(guardada('lua')).toBe('LUA');
    expect(conta).toHaveBeenCalledTimes(2);
  });

  it('guarda também resposta vazia, falsa e nula (não refaz por achar que não tem)', () => {
    const conta = vi.fn((s: string) => (s === 'a' ? '' : s === 'b' ? false : null));
    const guardada = memoDeTexto<string | boolean | null>(conta);
    for (const s of ['a', 'b', 'c', 'a', 'b', 'c']) guardada(s);
    expect(conta).toHaveBeenCalledTimes(3);
    expect(guardada('a')).toBe('');
    expect(guardada('b')).toBe(false);
    expect(guardada('c')).toBeNull();
  });

  it('respeita o teto: cheio, esvazia e recomeça, sem devolver valor de outro texto', () => {
    const conta = vi.fn((s: string) => `<${s}>`);
    const guardada = memoDeTexto(conta, 3);
    for (const s of ['a', 'b', 'c', 'd']) expect(guardada(s)).toBe(`<${s}>`);
    // 'd' encheu e esvaziou: 'a' é refeito, e sai certo.
    expect(guardada('a')).toBe('<a>');
    expect(conta).toHaveBeenCalledTimes(5);
  });
});

describe('chaveDaPalavra com memória', () => {
  it('dá o mesmo que a conta de sempre, na primeira e na segunda vez', () => {
    const casos: Array<[string | null | undefined, string]> = [
      ['Água', 'agua'],
      ['  São Paulo! ', 'saopaulo'],
      ['don’t', 'dont'],
      ['машину', 'машину'],
      ['食堂', '食堂'],
      ['', ''],
      [null, ''],
      [undefined, ''],
      ['R2-D2', 'r2d2'],
    ];
    for (let vez = 0; vez < 2; vez++) for (const [entrada, saida] of casos) expect(chaveDaPalavra(entrada)).toBe(saida);
  });
});

describe('a pista do cartão com memória', () => {
  it('cartão editado (tradução nova) não recebe a pista do texto antigo', () => {
    const antes = carta('house', { translation: 'casa' });
    expect(promptFor(antes)).toEqual({ prompt: 'casa', clozed: false });
    expect(promptFor({ ...antes, translation: 'moradia' })).toEqual({ prompt: 'moradia', clozed: false });
    expect(promptFor(antes)).toEqual({ prompt: 'casa', clozed: false });
  });

  it('a origem do cartão entra na chave: a régua do baralho importado é outra', () => {
    const longa = 'To leave a place, thing or person forever, with no intention of ever coming back again';
    const capturado = carta('abandon', { translation: longa });
    const importado = carta('abandon', { translation: longa, daAnki: true });
    expect(promptFor(capturado)).toBeNull();
    expect(promptFor(importado)?.clozed).toBe(false);
    expect(promptFor(capturado)).toBeNull();
  });

  it('sem tradução que sirva, cai na frase com lacuna, e a frase entra na chave', () => {
    const c = carta('water', { translation: '', sentence: 'I drink water every day' });
    expect(promptFor(c)).toEqual({ prompt: 'I drink _____ every day', clozed: true });
    expect(promptFor({ ...c, sentence: 'The water is cold today' })).toEqual({
      prompt: 'The _____ is cold today',
      clozed: true,
    });
  });
});

describe('contar sem montar as alternativas dá o mesmo número', () => {
  it('`canPlay` conta os mesmos itens que `buildItems` devolve, jogo a jogo', () => {
    const palavras = ['water', 'bread', 'house', 'green', 'light', 'money', 'night', 'river', 'stone', 'cloud'];
    const cartas = [
      ...palavras.map((w) => carta(w)),
      // pista repetida: `buildItems` recusa o segundo, e a contagem tem de recusar junto
      carta('home', { translation: 'tradução de house' }),
      carta('apple', { translation: '' }),
    ];
    const semSorteio = <T>(xs: T[]): T[] => [...xs];
    for (const jogo of ['memory', 'wordsearch', 'blitz', 'vitendawili'] as const) {
      const itens = buildItems(jogo, cartas, { shuffle: semSorteio, now: 0 });
      const conta = canPlay(jogo, cartas, { shuffle: semSorteio, now: 0 });
      expect(conta.disponiveis).toBe(itens.length);
    }
  });

  it('`buildItems` continua trazendo as outras respostas da mesma pista', () => {
    const cartas = [carta('room', { translation: 'quarto' }), carta('bedroom', { translation: 'quarto' }), carta('door', { translation: 'porta' }), carta('wall', { translation: 'parede' }), carta('roof', { translation: 'telhado' })];
    const itens = buildItems('memory', cartas, { shuffle: <T>(xs: T[]): T[] => [...xs], now: 0 });
    expect(itens.find((i) => i.answer === 'room')?.alternativas).toEqual(['bedroom']);
  });
});

describe('a guarda de referência', () => {
  it('devolve a resposta ANTERIOR enquanto a nova for igual, e troca quando muda', () => {
    const guarda = guardaDeReferencia<number[]>(mesmaLista);
    const a = [1, 2, 3];
    expect(guarda(a)).toBe(a);
    expect(guarda([1, 2, 3])).toBe(a);
    const b = [1, 2, 4];
    expect(guarda(b)).toBe(b);
    // só a última fica guardada: voltar ao conteúdo de antes devolve a lista nova, não a esquecida
    const c = [1, 2, 3];
    expect(guarda(c)).toBe(c);
  });

  it('`mesmaLista` compara item a item por referência e na ordem', () => {
    const x = { n: 1 };
    const y = { n: 1 };
    expect(mesmaLista([x, y], [x, y])).toBe(true);
    expect(mesmaLista([x, y], [y, x])).toBe(false);
    expect(mesmaLista([x], [{ n: 1 }])).toBe(false);
    expect(mesmaLista([x], [x, y])).toBe(false);
    expect(mesmaLista([], [])).toBe(true);
  });

  it('`mesmaTriagem`: mesmos cartões em cada pilha e mesmo motivo; cartão trocado (revisado) é outra', () => {
    const a = carta('sol');
    const b = carta('lua');
    const c = carta('mar');
    const t1: Triagem = { usaveis: [a], fora: [{ card: b, motivo: 'sem-pista' }], outroIdioma: [c] };
    const igual: Triagem = { usaveis: [a], fora: [{ card: b, motivo: 'sem-pista' }], outroIdioma: [c] };
    expect(mesmaTriagem(t1, igual)).toBe(true);
    expect(mesmaTriagem(t1, { ...igual, usaveis: [{ ...a }] })).toBe(false);
    expect(mesmaTriagem(t1, { ...igual, fora: [{ card: b, motivo: 'pista-ruim' }] })).toBe(false);
    expect(mesmaTriagem(t1, { ...igual, outroIdioma: [] })).toBe(false);
    expect(mesmaTriagem(t1, { ...igual, fora: [] })).toBe(false);
  });
});
