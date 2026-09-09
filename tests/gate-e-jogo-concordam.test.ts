import { describe, expect,it } from 'vitest';

import { buildItems, canPlay } from '../src/core/minigames/itemSource';
import { montarCorrente } from '../src/core/minigames/shiritori';
import { type MinigameId,MINIGAMES } from '../src/core/minigames/types';
import type { VocabCard } from '../src/types';

/**
 * O QUE O GATE CONTA E O QUE O JOGO CONSEGUE USAR TEM DE SER A MESMA COISA.
 *
 * Defeito real, achado abrindo os nove no navegador: a Charada e a Corrente mostravam
 * "8 nesta rodada" na grade e, ao serem clicadas, voltavam para a grade. O gate contava todo item
 * elegivel; o jogo depois descartava os que nao serviam (Charada precisa de FRASE, Corrente
 * precisa que as palavras ENCADEIEM) e ficava sem rodada.
 *
 * O conserto foi por o recorte dentro de `buildItems`, que e o que o gate le. Este teste prende os
 * dois juntos: se um jogo voltar a filtrar por conta propria, a contagem e a rodada divergem aqui.
 */
const AGORA = Date.parse('2026-09-08T12:00:00.000Z');
const PALAVRAS: Array<[string, string, string]> = [
  ['route', 'rota', 'Take the scenic route home.'],
  ['end', 'fim', 'This is the end of the line.'],
  ['defer', 'adiar', 'They defer the payment.'],
  ['run', 'correr', 'I run every morning.'],
  ['note', 'nota', 'She left a note.'],
  ['early', 'cedo', 'We arrived early.'],
  ['yes', 'sim', 'He said yes.'],
  ['sun', 'sol', 'The sun is bright.'],
  ['need', 'precisar', 'They need water.'],
  ['deep', 'fundo', 'The lake is deep.'],
  ['past', 'passado', 'That is in the past.'],
  ['tea', 'chá', 'I drink tea daily.'],
];

const baralho: VocabCard[] = PALAVRAS.map(([word, translation, sentence], i) => ({
  id: `c${i}`, word, phonetics: '', translation, explanation: '', sentence,
  leitnerBox: 1, leitnerDueAt: new Date(AGORA + 86_400_000).toISOString(),
  fsrsState: 'Review', fsrsStability: 5, fsrsDifficulty: 5, fsrsPredictedRetention: 0,
  fsrsDueAt: new Date(AGORA + 86_400_000).toISOString(), inDeck: true, srcLang: 'en',
} as VocabCard));

const DE_PALAVRA = (Object.keys(MINIGAMES) as MinigameId[])
  .filter((id) => MINIGAMES[id].modalidade === 'palavra');

describe('gate e jogo contam a mesma rodada', () => {
  it.each(DE_PALAVRA)('%s: se o gate libera, o builder entrega o minimo', (id) => {
    const { ok, disponiveis } = canPlay(id, baralho, { now: AGORA });
    if (!ok) return;
    const itens = buildItems(id, baralho, { now: AGORA });
    expect(itens.length, `${id}: gate diz ${disponiveis}, builder entrega ${itens.length}`)
      .toBeGreaterThanOrEqual(MINIGAMES[id].minItems);
  });

  /* As duas restricoes que o gate nao via, cada uma no formato em que ela quebrou. */
  it('charada so recebe item que produz frase com lacuna', () => {
    const semFrase = baralho.map((c) => ({ ...c, sentence: undefined })) as VocabCard[];
    for (const item of buildItems('vitendawili', baralho, { now: AGORA })) {
      expect(item.clozed || (item.sentence ?? '').trim(), `${item.answer} sem frase`).toBeTruthy();
    }
    // Sem frase E com tradução, a pista vira a tradução e o jogo nao tem enigma.
    const itens = buildItems('vitendawili', semFrase, { now: AGORA });
    expect(itens.every((i) => i.clozed || (i.sentence ?? '').trim())).toBe(true);
  });

  it('corrente so recebe itens que encadeiam de verdade', () => {
    const itens = buildItems('shiritori', baralho, { now: AGORA });
    if (!itens.length) return;
    expect(montarCorrente(itens), 'buildItems entregou itens que nao formam corrente').not.toBeNull();
  });

  it('material que nao encadeia devolve rodada vazia, e nao uma rodada impossivel', () => {
    const soComA = baralho.filter((c) => c.word.startsWith('a') || c.word.startsWith('t'));
    const itens = buildItems('shiritori', soComA, { now: AGORA });
    expect(itens.length === 0 || montarCorrente(itens) !== null).toBe(true);
  });
});
