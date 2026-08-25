import { describe, it, expect } from 'vitest';
import { buildItems } from '../src/core/minigames/itemSource';
import { buildTermoRounds } from '../src/core/minigames/termo';
import type { VocabCard } from '../src/types';

/**
 * A VARIEDADE ENTRE RODADAS — o defeito que fazia o usuário "ficar preso nas mesmas questões".
 *
 * Dois defeitos encadeados, ambos medidos antes de consertar:
 *
 *  1. `buildItems` prometia priorizar vencidos e não priorizava: o `shuffle` envolvia a
 *     concatenação inteira e dissolvia o `byUrgency`.
 *  2. `buildTermoRounds` não sorteava NADA — as mesmas 7 palavras em 5 rodadas, num baralho de
 *     200 (medido: 7 distintas em 35 jogadas).
 *
 * E a lição que só a medição deu: consertar (1) sozinho PIORA a repetição, porque com os vencidos
 * sempre na frente a Memória passa a tirar os mesmos 8 de um punhado deles — caiu de 37 para 8
 * distintas. Prioridade de urgência e memória curta (`evitar`) são UMA feature, não duas. Estes
 * testes existem para que ninguém desfaça metade dela.
 */

const PALAVRAS = [
  'house', 'water', 'table', 'green', 'plant', 'music', 'river', 'bread', 'chair', 'light',
  'stone', 'field', 'cloud', 'happy', 'night', 'sugar', 'paper', 'money', 'dream', 'voice',
];

function carta(word: string, i: number, vencida: boolean): VocabCard {
  const agora = Date.now();
  const quando = vencida ? agora - 86_400_000 : agora + 86_400_000;
  return {
    id: `c${i}`, word, translation: `t-${word}`, phonetics: '', explanation: '', inDeck: true,
    frequency: 'medium', leitnerBox: 1, leitnerDueAt: '', srcLang: 'en',
    fsrsState: vencida ? 'Review' : 'New', fsrsStability: vencida ? 2 : 0, fsrsDifficulty: 5,
    fsrsPredictedRetention: 0.9, fsrsDueAt: new Date(quando).toISOString(),
    stability: vencida ? 2 : undefined, dueAt: quando,
  } as never;
}
const baralho = (n: number, vencidas: number) => PALAVRAS.slice(0, n).map((w, i) => carta(w, i, i < vencidas));

describe('prioridade de vencidos', () => {
  it('vencido vem na frente — em 20 execuções, sem exceção', () => {
    const deck = baralho(20, 3);
    const vencidas = new Set(['house', 'water', 'table']);
    for (let i = 0; i < 20; i++) {
      const primeiros = buildItems('memory', deck).slice(0, 3).map(x => x.answer);
      expect(primeiros.filter(p => vencidas.has(p))).toHaveLength(3);
    }
  });

  it('mas em ordem VARIADA entre rodadas — senão a prioridade vira repetição', () => {
    const deck = baralho(20, 6);
    const ordens = new Set<string>();
    for (let i = 0; i < 30; i++) ordens.add(buildItems('memory', deck).slice(0, 6).map(x => x.answer).join('|'));
    expect(ordens.size).toBeGreaterThan(1);
  });

  it('o duelo NÃO embaralha os vencidos — ali a ordem de urgência é a mecânica', () => {
    const deck = baralho(20, 4);
    const a = buildItems('blitz', deck).slice(0, 4).map(x => x.answer);
    for (let i = 0; i < 10; i++) {
      expect(buildItems('blitz', deck).slice(0, 4).map(x => x.answer)).toEqual(a);
    }
  });
});

describe('evitar — a memória curta', () => {
  it('empurra para o fim o que acabou de cair, sem tirar da rodada', () => {
    const deck = baralho(12, 0);
    const caiu = new Set(['house', 'water', 'table', 'green']);
    const r = buildItems('memory', deck, { evitar: caiu });
    // Continuam disponíveis (o jogo não pode ficar sem itens)...
    expect(r).toHaveLength(8);
    // ...mas não competem pelas primeiras posições.
    expect(r.slice(0, 4).map(x => x.answer).filter(w => caiu.has(w))).toHaveLength(0);
  });

  it('com o baralho INTEIRO evitado, a rodada ainda acontece', () => {
    // É o motivo de ser penalidade e não exclusão: um jogo que some ao clicar é pior que repetir.
    const deck = baralho(8, 0);
    const tudo = new Set(deck.map(c => c.word));
    expect(buildItems('memory', deck, { evitar: tudo })).toHaveLength(8);
  });

  it('acumulando entre rodadas, a Memória cobre o baralho em vez de girar nos vencidos', () => {
    // Medido: sem `evitar` este número caía para 8 de 40 depois do conserto da urgência.
    const deck = baralho(20, 6);
    const vistas = new Set<string>();
    const acumulado = new Set<string>();
    for (let r = 0; r < 5; r++) {
      for (const it of buildItems('memory', deck, { evitar: acumulado })) {
        vistas.add(it.answer);
        acumulado.add(it.answer);
      }
    }
    expect(vistas.size).toBeGreaterThanOrEqual(18);
  });
});

describe('o Termo passou a sortear', () => {
  it('duas rodadas seguidas não são idênticas', () => {
    const deck = baralho(20, 0);
    const combinacoes = new Set<string>();
    for (let i = 0; i < 30; i++) {
      combinacoes.add(buildTermoRounds(deck, { quantidade: 5 }).map(r => r.resposta).join('|'));
    }
    expect(combinacoes.size).toBeGreaterThan(1);
  });

  it('a palavra CRUA vai junto — o histórico não pode partir entre "house" e "HOUSE"', () => {
    const r = buildTermoRounds(baralho(20, 0), { quantidade: 5 });
    for (const x of r) {
      expect(x.resposta).toBe(x.resposta.toUpperCase());
      expect(x.palavra).toBe(x.palavra.toLowerCase());
      expect(x.resposta.toLowerCase()).toBe(x.palavra);
    }
  });

  it('vencida continua vindo primeiro', () => {
    const deck = baralho(20, 2);
    for (let i = 0; i < 15; i++) {
      const r = buildTermoRounds(deck, { quantidade: 5 });
      expect(['house', 'water']).toContain(r[0].palavra);
    }
  });
});
