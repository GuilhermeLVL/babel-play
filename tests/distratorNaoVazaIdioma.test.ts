import { describe, expect,it } from 'vitest';

import { distractorsFor } from '../src/core/minigames/itemSource';
import type { MinigameItem } from '../src/core/minigames/types';

/**
 * O DISTRATOR NAO PODE ENTREGAR A RESPOSTA PELO IDIOMA.
 *
 * `distractorsFor` filtrava so por `answer`. Numa rodada mista — e o pool CHEGA misto, porque com
 * `fonte.lang` vazio o filtro de idioma do servidor e pulado (`quality.ts:338`, e `Play.tsx:1524`
 * nomeia a brecha) — as alternativas de outro alfabeto denunciam a certa por eliminacao. Os tres
 * jogos culturais que renderizam `dir`/`lang` por item tornam isso visivel: a certa podia sair em
 * RTL com as erradas em LTR.
 */
const item = (answer: string, lang: string): MinigameItem => ({ cardId: answer, prompt: 'p-' + answer, answer, lang });
const semSorte = <T,>(xs: T[]) => [...xs];

describe('distractorsFor respeita o idioma do alvo', () => {
  const misto = [
    item('house', 'en'), item('water', 'en'), item('table', 'en'), item('green', 'en'),
    item('casa', 'pt-BR'), item('agua', 'pt-BR'),
    item('مرحبا', 'ar'), item('дом', 'ru'),
  ];

  it('so devolve palavras do mesmo idioma', () => {
    const d = distractorsFor(misto[0], misto, 3, semSorte);
    expect(d).toEqual(['water', 'table', 'green']);
  });

  it('nunca devolve a propria resposta', () => {
    for (const alvo of misto) {
      expect(distractorsFor(alvo, misto, 3, semSorte)).not.toContain(alvo.answer);
    }
  });

  /* Pool minoritario: o baralho real tem 10 cartoes em ar/de/es/fr/ru/th e 6 em ja. Preferir
     MENOS alternativas a alternativas de outra lingua — rodada curta e honesta, rodada com pista
     nao e. Os quatro jogos que chamam isto espalham o array e aguentam menos de tres. */
  it('degrada para menos alternativas em vez de misturar idioma', () => {
    const d = distractorsFor(item('casa', 'pt-BR'), misto, 3, semSorte);
    expect(d).toEqual(['agua']);
  });

  it('idioma sem par nenhum devolve vazio, e nao o alfabeto errado', () => {
    expect(distractorsFor(item('дом', 'ru'), misto, 3, semSorte)).toEqual([]);
  });

  /* `pt-BR` e `pt-PT` sao o mesmo idioma para efeito de distrator: a regua e a base. */
  it('a base do idioma manda, nao a variante', () => {
    const comVariante = [item('casa', 'pt-BR'), item('agua', 'pt-PT'), item('house', 'en')];
    expect(distractorsFor(comVariante[0], comVariante, 3, semSorte)).toEqual(['agua']);
  });

  /* Item sem idioma declarado nao pode sumir da rodada: `lang` e '' quando o cartao veio de fala. */
  it('item sem idioma continua elegivel', () => {
    const semLang = [item('a', ''), item('b', ''), item('c', '')];
    expect(distractorsFor(semLang[0], semLang, 2, semSorte)).toEqual(['b', 'c']);
  });
});
