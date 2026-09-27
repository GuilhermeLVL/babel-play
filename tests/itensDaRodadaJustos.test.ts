import { describe, expect, it } from 'vitest';

import { buildItems, distractorsFor } from '../src/core/minigames/itemSource';
import type { MinigameItem } from '../src/core/minigames/types';
import type { VocabCard } from '../src/types';

/**
 * A RODADA NÃO PODE TER DUAS RESPOSTAS "CERTAS" NEM OPÇÕES REPETIDAS (QA dos jogos, 2026-09-26).
 *
 *  - Um baralho com "Bank" (importado) e "bank" (capturado) punha as duas grafias como alternativas
 *    do Duelo e da Karuta: duas cartas iguais, uma "errada".
 *  - A Memória com dois cartões da MESMA palavra (duas traduções) aceitava só um dos pares, embora
 *    as duas cartas "bank" fossem idênticas na mesa.
 *  - Quem digita precisa ser aceito com qualquer palavra do acervo que tenha a MESMA pista: o item
 *    passa a carregar essas `alternativas`.
 */
const semSorte = <T,>(xs: T[]) => [...xs];
const it_ = (answer: string, lang = 'en'): MinigameItem => ({ cardId: answer, prompt: 'p-' + answer, answer, lang });

describe('distractorsFor sem opção repetida', () => {
  it('duas grafias da mesma palavra (caixa) viram UMA alternativa', () => {
    const pool = [it_('house'), it_('Bank'), it_('bank'), it_('water'), it_('green')];
    const d = distractorsFor(pool[0], pool, 3, semSorte);
    expect(d.map((x) => x.toLowerCase()).filter((x) => x === 'bank')).toHaveLength(1);
    expect(new Set(d.map((x) => x.toLowerCase())).size).toBe(d.length);
  });

  it('a própria resposta em outra caixa nunca vira distrator', () => {
    const pool = [it_('bank'), it_('Bank'), it_('water'), it_('green')];
    expect(distractorsFor(pool[0], pool, 3, semSorte).map((x) => x.toLowerCase())).not.toContain('bank');
  });
});

const carta = (id: string, word: string, translation: string): VocabCard =>
  ({ id, word, translation, srcLang: 'en', inDeck: true, box: 1, dueAt: 0, sentence: `I saw the ${word} today.` }) as unknown as VocabCard;

describe('buildItems: uma palavra por rodada e as alternativas da mesma pista', () => {
  it('a mesma palavra em dois cartões entra UMA vez', () => {
    const cards = [
      carta('1', 'bank', 'banco'),
      carta('2', 'Bank', 'margem'),
      carta('3', 'water', 'água'),
      carta('4', 'green', 'verde'),
      carta('5', 'table', 'mesa'),
    ];
    const itens = buildItems('memory', cards, { shuffle: semSorte, now: 0 });
    const palavras = itens.map((i) => i.answer.toLowerCase());
    expect(palavras.filter((p) => p === 'bank')).toHaveLength(1);
  });

  it('o item carrega as outras palavras do acervo com a mesma tradução', () => {
    const cards = [
      carta('1', 'room', 'quarto'),
      carta('2', 'bedroom', 'quarto'),
      carta('3', 'water', 'água'),
      carta('4', 'green', 'verde'),
      carta('5', 'table', 'mesa'),
    ];
    const itens = buildItems('tenis', cards, { shuffle: semSorte, now: 0 });
    const quarto = itens.find((i) => i.prompt === 'quarto');
    expect(quarto).toBeDefined();
    const outra = quarto!.answer === 'room' ? 'bedroom' : 'room';
    expect(quarto!.alternativas).toEqual([outra]);
    expect(itens.find((i) => i.answer === 'water')!.alternativas ?? []).toEqual([]);
  });
});
