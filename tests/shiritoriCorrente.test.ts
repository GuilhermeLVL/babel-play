/**
 * A CORRENTE do shiritori é combinatória, e por isso é testada fora do React.
 *
 * O que estes testes travam: a corrente sai do MATERIAL (nunca de dicionário embutido), a busca
 * volta atrás quando o primeiro elo que cabe fecha a saída, e material que não encadeia devolve
 * `null` — que é o sinal do componente para chamar `onExit` em vez de inventar palavra.
 */
import { describe, expect,it } from 'vitest';

import { letraFinal, letraInicial, maiorCorrente, montarCorrente, PASSOS_MINIMOS } from '../src/core/minigames/shiritori';
import type { MinigameItem } from '../src/core/minigames/types';

const item = (cardId: string, answer: string): MinigameItem => ({ cardId, prompt: `pista de ${answer}`, answer, lang: 'en' });
/** Sem sorteio: a ordem das opções não é o que estes testes medem. */
const semSorte = <T,>(xs: T[]): T[] => [...xs];

describe('letras da ponta', () => {
  it('ignora acento e caixa — "Água" termina onde "agua" termina', () => {
    expect(letraInicial('Água')).toBe('a');
    expect(letraFinal('Água')).toBe('a');
  });

  it('palavra sem letra nenhuma não tem ponta', () => {
    expect(letraInicial('123')).toBe('');
    expect(letraFinal('—')).toBe('');
  });
});

describe('maiorCorrente', () => {
  it('encadeia o baralho inteiro quando ele fecha', () => {
    const items = [item('c1', 'house'), item('c2', 'egg'), item('c3', 'goat'), item('c4', 'tree')];
    expect(maiorCorrente(items).map((i) => i.answer)).toEqual(['house', 'egg', 'goat', 'tree']);
  });

  /* O guloso escolhe 'elk' (o primeiro que cabe depois de 'ape') e morre com 2 elos: nada começa
     com K. A corrente de 3 só aparece para quem volta atrás. */
  it('volta atrás quando o primeiro elo que cabe fecha a saída', () => {
    const items = [item('c1', 'ape'), item('c2', 'elk'), item('c3', 'end'), item('c4', 'dog')];
    expect(maiorCorrente(items).map((i) => i.answer)).toEqual(['ape', 'end', 'dog']);
  });

  it('nunca repete a mesma palavra — é falta no shiritori', () => {
    const items = [item('c1', 'ape'), item('c2', 'end'), item('c3', 'end'), item('c4', 'dog')];
    const corrente = maiorCorrente(items).map((i) => i.answer);
    expect(new Set(corrente).size).toBe(corrente.length);
  });
});

describe('montarCorrente', () => {
  it('devolve os passos com as escolhas, a certa entre distratores que NÃO servem para a letra', () => {
    const items = [item('c1', 'ape'), item('c2', 'elk'), item('c3', 'end'), item('c4', 'dog')];
    const corrente = montarCorrente(items, semSorte)!;

    expect(corrente.inicio.answer).toBe('ape');
    expect(corrente.passos.map((p) => p.item.answer)).toEqual(['end', 'dog']);
    expect(corrente.passos.map((p) => p.letra)).toEqual(['E', 'D']);
    for (const p of corrente.passos) {
      expect(p.opcoes).toContain(p.item.answer);
      const erradas = p.opcoes.filter((o) => o !== p.item.answer);
      expect(erradas.length).toBeGreaterThan(0);
      /* Distrator que começasse com a letra exigida daria DUAS respostas certas na tela. */
      for (const e of erradas) expect(letraInicial(e).toUpperCase()).not.toBe(p.letra);
    }
  });

  it('as escolhas saem do baralho — nenhuma palavra inventada entra na tela', () => {
    const items = [item('c1', 'ape'), item('c2', 'elk'), item('c3', 'end'), item('c4', 'dog')];
    const doBaralho = new Set(items.map((i) => i.answer));
    for (const p of montarCorrente(items, semSorte)!.passos) {
      for (const o of p.opcoes) expect(doBaralho.has(o)).toBe(true);
    }
  });

  it('material que não encadeia não vira rodada', () => {
    const items = [item('c1', 'casa'), item('c2', 'bola'), item('c3', 'dedo'), item('c4', 'fogo')];
    expect(montarCorrente(items, semSorte)).toBeNull();
  });

  it('corrente de uma volta só é curta demais: dois elos não sustentam a rodada', () => {
    const items = [item('c1', 'end'), item('c2', 'dog'), item('c3', 'casa'), item('c4', 'bola')];
    expect(maiorCorrente(items).map((i) => i.answer)).toEqual(['end', 'dog']);
    /* Uma volta só = um passo perguntado, abaixo do mínimo: a rodada não nasce. */
    expect(PASSOS_MINIMOS).toBe(2);
    expect(montarCorrente(items, semSorte)).toBeNull();
  });
});
