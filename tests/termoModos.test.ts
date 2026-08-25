import { describe, it, expect } from 'vitest';
import {
  avaliarPalpite, estadoDoTecladoMulti, dicaDeLetra, buildTermoRounds, contarJogaveisMulti,
  TABULEIROS_POR_MODO, TENTATIVAS_POR_MODO,
} from '../src/core/minigames/termo';
import type { VocabCard } from '../src/types';

/**
 * DUETO E QUARTETO — o que estes testes protegem.
 *
 * A regra que quebra o jogo se sair errada é a do TAMANHO: o palpite é um só e vale para todos os
 * tabuleiros, então palavras de comprimentos diferentes no mesmo grupo tornam o jogo insolúvel.
 * No Termo original isso é de graça (toda palavra tem 5 letras); aqui as palavras vêm do baralho
 * da pessoa, então é código nosso — e código nosso precisa de teste.
 */

/**
 * A TRADUÇÃO PADRÃO É DERIVADA DO ID, e não uma constante.
 *
 * Antes era `'trad'` para todos, e isso passou a quebrar quando `buildTermoRounds` ganhou a regra
 * de PISTA ÚNICA: com cinco cartões traduzidos igual, só um pode entrar no degrau — dois tabuleiros
 * com a mesma pista não têm palpite certo. A fixture antiga era irreal (nenhum baralho tem cinco
 * palavras com a mesma tradução) e mascarava a invariante nova; derivar do id mantém o que estes
 * testes realmente medem, que é o agrupamento por COMPRIMENTO.
 */
function card(over: Partial<VocabCard> & { id: string; word: string }): VocabCard {
  return {
    id: over.id,
    word: over.word,
    /* Sufixo em LETRA, nunca em dígito: `pistaUtil` reprova pista com número (é ruído de
       captura), e `trad-1` faria a régua descartar o cartão antes de a rodada ser montada. */
    translation: over.translation ?? `trad${'abcdefghij'[Number(over.id) % 10] ?? 'z'}`,
    srcLang: 'en',
    tgtLang: 'pt-BR',
    inDeck: true,
    ...over,
  } as VocabCard;
}

describe('modos do Termo', () => {
  it('a folga de tentativas cresce com o número de tabuleiros', () => {
    // Se essa ordem se inverter, o Quarteto vira matematicamente injogável.
    expect(TENTATIVAS_POR_MODO.termo).toBeLessThan(TENTATIVAS_POR_MODO.dueto);
    expect(TENTATIVAS_POR_MODO.dueto).toBeLessThan(TENTATIVAS_POR_MODO.quarteto);
    expect(TENTATIVAS_POR_MODO.quarteto).toBeGreaterThanOrEqual(TABULEIROS_POR_MODO.quarteto + 4);
  });

  it('sorteia apenas palavras de MESMO tamanho quando o modo é múltiplo', () => {
    const cards = [
      card({ id: '1', word: 'casa' }), card({ id: '2', word: 'bola' }),
      card({ id: '3', word: 'gato' }), card({ id: '4', word: 'pedra' }),
      card({ id: '5', word: 'janela' }),
    ];
    const r = buildTermoRounds(cards, { quantidade: 2, mesmoTamanho: true });
    expect(r).toHaveLength(2);
    expect(new Set(r.map(x => x.resposta.length)).size).toBe(1);
  });

  it('devolve vazio quando não há palavras suficientes de um mesmo tamanho', () => {
    // Cinco palavras, todos os comprimentos diferentes: dá para jogar Termo, não dá para o Dueto.
    const cards = [
      card({ id: '1', word: 'casa' }), card({ id: '2', word: 'pedra' }),
      card({ id: '3', word: 'janela' }), card({ id: '4', word: 'abacate' }),
      card({ id: '5', word: 'telefone' }),
    ];
    expect(buildTermoRounds(cards, { quantidade: 2, mesmoTamanho: true })).toHaveLength(0);
    expect(contarJogaveisMulti(cards)).toBe(1);
  });

  it('contarJogaveisMulti devolve o maior grupo de mesmo tamanho, não o total', () => {
    const cards = [
      card({ id: '1', word: 'casa' }), card({ id: '2', word: 'bola' }), card({ id: '3', word: 'gato' }),
      card({ id: '4', word: 'pedra' }), card({ id: '5', word: 'janela' }),
    ];
    expect(contarJogaveisMulti(cards)).toBe(3); // casa/bola/gato
  });
});

describe('teclado com vários tabuleiros', () => {
  it('ignora os tabuleiros já resolvidos', () => {
    // Tabuleiro 0 (resolvido) diria que A é 'certa'; o aberto diz 'ausente'. Pintar de verde uma
    // letra que não ajuda mais em nada é pior do que não pintar.
    const resolvido = [avaliarPalpite('ABC', 'ABC')];
    const aberto = [avaliarPalpite('ABC', 'XYZ')];
    const mapa = estadoDoTecladoMulti([resolvido, aberto], [true, false]);
    expect(mapa['A']).toBe('ausente');
  });

  it('consolida o MELHOR estado entre os tabuleiros abertos', () => {
    const um = [avaliarPalpite('ABC', 'XYZ')];   // A ausente
    const dois = [avaliarPalpite('ABC', 'AZZ')]; // A certa
    const mapa = estadoDoTecladoMulti([um, dois], [false, false]);
    expect(mapa['A']).toBe('certa');
  });
});

describe('dica de letra', () => {
  it('nunca revela uma posição que a pessoa já descobriu', () => {
    const palpites = [avaliarPalpite('CXXX', 'CASA')]; // posição 0 já é 'certa'
    for (let i = 0; i < 40; i++) {
      const d = dicaDeLetra('CASA', palpites);
      expect(d).not.toBeNull();
      expect(d!.posicao).not.toBe(0);
      expect(d!.letra).toBe('CASA'[d!.posicao]);
    }
  });

  it('devolve null quando não há mais o que revelar', () => {
    expect(dicaDeLetra('CASA', [avaliarPalpite('CASA', 'CASA')])).toBeNull();
  });

  it('não repete uma posição que outra dica já revelou', () => {
    // Sem esta regra, pedir ajuda podia devolver a MESMA letra de novo: a pessoa gastava a dica
    // para receber o que já estava na tela. Medido em jogo — sete dicas cobriam só seis letras.
    const reveladas = new Set<number>();
    for (let i = 0; i < 4; i++) {
      const d = dicaDeLetra('CASA', [], reveladas);
      expect(d, `dica ${i + 1}`).not.toBeNull();
      expect(reveladas.has(d!.posicao)).toBe(false);
      reveladas.add(d!.posicao);
    }
    // Quatro dicas cobriram as quatro posições, e a quinta não tem o que revelar.
    expect(reveladas.size).toBe(4);
    expect(dicaDeLetra('CASA', [], reveladas)).toBeNull();
  });
});
