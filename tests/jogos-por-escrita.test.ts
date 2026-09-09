import { describe, expect,it } from 'vitest';

import { canPlay } from '../src/core/minigames/itemSource';
import { type MinigameId,MINIGAMES } from '../src/core/minigames/types';
import type { VocabCard } from '../src/types';

/**
 * QUE JOGOS UM BARALHO DE CADA ESCRITA ALCANCA.
 *
 * O usuario pode importar um baralho Anki em qualquer lingua. Os jogos que exigem alfabeto latino
 * recusam — e devem recusar, com motivo na tela. O que este teste prende e a fronteira: quem exige
 * latino esta declarado, e quem nao exige funciona em qualquer escrita.
 *
 * O `tenis` entrou nesta lista em 08/09, depois de medido: ele DIGITA a palavra inteira, e
 * `chaveDoTermo` remove o dakuten (nao e `\p{L}`), entao em japones `食べる` e `食へる` viravam a
 * mesma chave — o jogo dava acerto a quem escreveu outra silaba.
 */
const AGORA = Date.parse('2026-09-08T12:00:00.000Z');

const carta = (word: string, translation: string, lang: string, i: number): VocabCard => ({
  id: `k${i}`, word, translation, sentence: `${word} exemplo aqui.`, phonetics: '', explanation: '',
  leitnerBox: 1, leitnerDueAt: new Date(AGORA + 86_400_000).toISOString(),
  fsrsDueAt: new Date(AGORA + 86_400_000).toISOString(), fsrsState: 'Review',
  fsrsStability: 5, fsrsDifficulty: 5, fsrsPredictedRetention: 0, inDeck: true, srcLang: lang,
} as VocabCard);

const BARALHOS: Record<string, string[][]> = {
  ja: [['食べる', 'comer'], ['水', 'água'], ['本', 'livro'], ['山', 'montanha'], ['犬', 'cachorro'], ['猫', 'gato'], ['車', 'carro'], ['花', 'flor']],
  ru: [['дом', 'casa'], ['вода', 'água'], ['книга', 'livro'], ['гора', 'montanha'], ['собака', 'cachorro'], ['кошка', 'gato'], ['машина', 'carro'], ['цветок', 'flor']],
  ar: [['بيت', 'casa'], ['ماء', 'água'], ['كتاب', 'livro'], ['جبل', 'montanha'], ['كلب', 'cachorro'], ['قطة', 'gato'], ['سيارة', 'carro'], ['زهرة', 'flor']],
  de: [['Haus', 'casa'], ['Wasser', 'água'], ['Buch', 'livro'], ['Berg', 'montanha'], ['Hund', 'cachorro'], ['Katze', 'gato'], ['Auto', 'carro'], ['Blume', 'flor']],
};

const baralhoDe = (lang: string) => BARALHOS[lang].map(([w, t], i) => carta(w, t, lang, i));
const DE_PALAVRA = (Object.keys(MINIGAMES) as MinigameId[]).filter((id) => MINIGAMES[id].modalidade === 'palavra');
const EXIGEM_LATINO = DE_PALAVRA.filter((id) => MINIGAMES[id].requisitos?.alfabeto === 'latino');

describe('um baralho importado alcanca os jogos da sua escrita', () => {
  it('todo jogo que exige alfabeto tambem declara a escrita que usa', () => {
    for (const id of EXIGEM_LATINO) {
      expect(MINIGAMES[id].requisitos?.escrita, `${id} exige alfabeto e nao diz qual escrita`).toBeTruthy();
    }
  });

  it.each(['ja', 'ru', 'ar'])('baralho em %s: os que exigem latino recusam, os outros aceitam', (lang) => {
    const cartas = baralhoDe(lang);
    for (const id of DE_PALAVRA) {
      const { ok } = canPlay(id, cartas, { now: AGORA });
      if (EXIGEM_LATINO.includes(id)) {
        expect(ok, `${id} exige latino e aceitou um baralho ${lang}`).toBe(false);
      }
    }
  });

  it('baralho latino alcanca tambem os que exigem alfabeto', () => {
    const cartas = baralhoDe('de');
    for (const id of EXIGEM_LATINO) {
      /* `shiritori` depende de as palavras ENCADEAREM, o que oito palavras podem nao fazer —
         a exigencia dele e de conjunto, nao de escrita. */
      if (id === 'shiritori') continue;
      expect(canPlay(id, cartas, { now: AGORA }).ok, `${id} recusou um baralho alemao`).toBe(true);
    }
  });

  /* O tenis digita a palavra: sem o requisito, `chaveDoTermo` normalizava o dakuten e o jogo
     aceitava a silaba errada como acerto. */
  it('o tenis exige alfabeto latino, porque digita a palavra', () => {
    expect(MINIGAMES.tenis.requisitos?.alfabeto).toBe('latino');
    expect(MINIGAMES.tenis.requisitos?.escrita).toBe('teclado');
  });
});
