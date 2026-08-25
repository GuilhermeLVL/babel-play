import { describe, it, expect } from 'vitest';
import {
  planoDaEscada, montarEscada, modoDeTabuleiros, letrasCertas, pistaUtil,
  avaliarPalpite, buildTermoRounds, ESCADA_PADRAO, TENTATIVAS_POR_MODO,
} from '../src/core/minigames/termo';
import type { VocabCard } from '../src/types';

/**
 * A ESCADA E AS PISTAS.
 *
 * Duas regras que, se saírem erradas, quebram o jogo de formas opostas: uma escada mal fatiada
 * oferece um degrau que não tem palavras para preencher (falha ao pisar), e uma pista ruim faz a
 * pessoa adivinhar às cegas achando que o jogo está quebrado — quando ele está funcionando.
 */

function card(over: Partial<VocabCard> & { id: string; word: string }): VocabCard {
  return {
    id: over.id,
    word: over.word,
    translation: over.translation ?? 'casa',
    srcLang: 'en',
    tgtLang: 'pt-BR',
    inDeck: true,
    ...over,
  } as VocabCard;
}

describe('plano da escada', () => {
  it('a escada cheia gasta exatamente 1 + 2 + 4 palavras', () => {
    expect(planoDaEscada(7)).toEqual([1, 2, 4]);
    expect(ESCADA_PADRAO.reduce((a, b) => a + b, 0)).toBe(7);
  });

  it('encurta em vez de oferecer um degrau que não tem palavras', () => {
    expect(planoDaEscada(0)).toEqual([]);
    expect(planoDaEscada(1)).toEqual([1]);
    expect(planoDaEscada(2)).toEqual([1]);   // sobra 1, e o dueto precisa de 2
    expect(planoDaEscada(3)).toEqual([1, 2]);
    expect(planoDaEscada(6)).toEqual([1, 2]); // sobram 3, e o quarteto precisa de 4
  });

  it('nunca pede mais palavras do que existem', () => {
    for (let n = 0; n <= 20; n++) {
      const gasto = planoDaEscada(n).reduce((a, b) => a + b, 0);
      expect(gasto).toBeLessThanOrEqual(n);
    }
  });
});

describe('montagem dos degraus', () => {
  const palavras = Array.from({ length: 7 }, (_, i) => ({ resposta: `P${i}`, palavra: `p${i}`, pista: 'x', lang: 'en' }));

  it('fatia na ordem 1, 2, 4 sem repetir palavra', () => {
    const grupos = montarEscada(palavras, planoDaEscada(7));
    expect(grupos.map(g => g.length)).toEqual([1, 2, 4]);
    const usadas = grupos.flat().map(r => r.resposta);
    expect(new Set(usadas).size).toBe(7);
  });

  it('descarta o degrau que não completa (nunca um Dueto com um tabuleiro só)', () => {
    const grupos = montarEscada(palavras.slice(0, 2), [1, 2]);
    expect(grupos.map(g => g.length)).toEqual([1]);
  });

  it('cada degrau ganha a folga de tentativas do seu tamanho', () => {
    const folgas = montarEscada(palavras, planoDaEscada(7))
      .map(g => TENTATIVAS_POR_MODO[modoDeTabuleiros(g.length)]);
    expect(folgas).toEqual([6, 7, 9]);
  });
});

describe('letras já descobertas', () => {
  it('reúne as verdes de tentativas diferentes, cada uma na sua posição', () => {
    const palpites = [avaliarPalpite('CXXX', 'CASA'), avaliarPalpite('XXSX', 'CASA')];
    expect(letrasCertas(palpites, 4)).toEqual(['C', null, 'S', null]);
  });

  it('não confunde amarelo com verde: existir não é estar no lugar', () => {
    // "ACXX" contra "CASA": A e C existem, mas nenhum está na posição certa.
    expect(letrasCertas([avaliarPalpite('ACXX', 'CASA')], 4)).toEqual([null, null, null, null]);
  });
});

describe('qualidade da pista', () => {
  it('aceita definições curtas e limpas', () => {
    for (const boa of ['casa', 'calças jeans', 'pronto', 'pegar no sono']) {
      expect(pistaUtil(boa), boa).toBe(true);
    }
  });

  it('recusa o que a captura deixa passar e não define nada', () => {
    // Todos estes apareceram de verdade como pista no jogo, e nenhum ensina qual é a palavra.
    for (const ruim of ['Isso é', 'rápida!!', 'Tu', '...ambém o idioma que está sendo', '']) {
      expect(pistaUtil(ruim), ruim).toBe(false);
    }
  });

  it('a filtragem chega ao sorteio: cartão de pista ruim não vira rodada', () => {
    const cards = [
      card({ id: '1', word: 'house', translation: 'Isso é' }),
      card({ id: '2', word: 'mouse', translation: 'rápida!!' }),
      card({ id: '3', word: 'bread', translation: 'pão' }),
    ];
    const r = buildTermoRounds(cards, { quantidade: 3 });
    expect(r.map(x => x.resposta)).toEqual(['BREAD']);
  });
});
