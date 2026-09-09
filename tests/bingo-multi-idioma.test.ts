/** O bingo da escuta usava normalização A-Z: em não-latino a cartela nascia vazia, sem gate. */
import { describe, expect,it } from 'vitest';

import { buildCartela, marcarFala } from '../src/core/minigames/bingo';
import type { VocabCard } from '../src/types';

const cartas = (palavras: string[]): VocabCard[] =>
  palavras.map((word, i) => ({ id: `c${i}`, word, translation: 'x', inDeck: 1 } as never));

describe('cartela em escrita não-latina', () => {
  it.each([
    ['japonês', ['仕事', '時間', '食べる', '先生', '学校', '電車']],
    ['russo', ['работа', 'время', 'книга', 'город', 'вода', 'ночь']],
    ['árabe', ['عمل', 'وقت', 'كتاب', 'مدينة', 'ماء', 'ليل']],
  ])('%s monta cartela em vez de ficar vazia', (_nome, palavras) => {
    const cartela = buildCartela(cartas(palavras), { casas: 6 });
    expect(cartela.length).toBeGreaterThan(0);
  });

  it('a palavra ouvida acende a casa correspondente', () => {
    const cartela = buildCartela(cartas(['работа', 'время', 'книга', 'город']), { casas: 4 });
    const alvo = cartela[0];
    const { novas } = marcarFala(cartela, `сегодня ${alvo.palavra} была трудной`);
    expect(novas.map(c => c.palavra)).toContain(alvo.palavra);
  });

  it('latino continua funcionando igual', () => {
    const cartela = buildCartela(cartas(['casa', 'porta', 'janela', 'cidade']), { casas: 4 });
    expect(cartela.length).toBe(4);
    const { novas } = marcarFala(cartela, 'a casa era grande');
    expect(novas.map(c => c.palavra)).toContain('casa');
  });

  it('palavra parecida não acende — segue comparando palavra inteira', () => {
    const cartela = buildCartela(cartas(['arte', 'porta', 'janela', 'cidade']), { casas: 4 });
    const { novas } = marcarFala(cartela, 'partes do sistema');
    expect(novas).toHaveLength(0);
  });
});
