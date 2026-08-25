import { describe, it, expect } from 'vitest';
import { buildItems, promptFor } from '../src/core/minigames/itemSource';
import { buildTermoRounds } from '../src/core/minigames/termo';
import { chaveComparavel } from '../src/core/learning/quality';
import type { VocabCard } from '../src/types';

/**
 * A PISTA TEM DE IDENTIFICAR A RESPOSTA.
 *
 * A régua de qualidade (`avaliarCartao`) valida a FORMA de um cartão, um por um — e por isso nunca
 * poderia perceber que dois cartões DIFERENTES têm a MESMA pista. `body → morto` e `dead → morto`
 * são ambos bem-formados; juntos na mesma rodada produzem um enigma sem resposta: a pessoa lê
 * "morto", responde "dead", e o jogo diz que errou.
 *
 * Foi exatamente o que o usuário relatou ("apareceu a palavra morto e a tradução era body, não
 * consigo entender por que isso acontece"). E não é caso raro: medido no léxico embutido, 490
 * traduções servem a mais de uma palavra inglesa, afetando 1.116 de 3.997 pares (28%). "conta" é
 * pista de sete palavras.
 */

function carta(id: string, word: string, translation: string, sentence = ''): VocabCard {
  const agora = Date.now();
  return {
    id, word, translation, sentence, phonetics: '', explanation: '', inDeck: true,
    frequency: 'medium', leitnerBox: 1, leitnerDueAt: '', srcLang: 'en',
    fsrsState: 'New', fsrsStability: 0, fsrsDifficulty: 5, fsrsPredictedRetention: 0.9,
    fsrsDueAt: new Date(agora + 86_400_000).toISOString(), dueAt: agora + 86_400_000,
  } as never;
}

/** O caso exato do relato, mais material limpo para a rodada ter como se completar. */
const COM_COLISAO = [
  carta('1', 'body', 'morto'),
  carta('2', 'dead', 'morto'),
  carta('3', 'house', 'casa'),
  carta('4', 'water', 'água'),
  carta('5', 'table', 'mesa'),
  carta('6', 'green', 'verde'),
  carta('7', 'plant', 'planta'),
  carta('8', 'music', 'música'),
  carta('9', 'river', 'rio'),
  carta('10', 'bread', 'pão'),
];

describe('buildItems — pista única', () => {
  it('não põe duas respostas para a mesma pista', () => {
    for (let i = 0; i < 30; i++) {
      const itens = buildItems('memory', COM_COLISAO);
      const pistas = itens.map(x => chaveComparavel(x.prompt));
      expect(new Set(pistas).size).toBe(pistas.length);
    }
  });

  it('uma das duas colididas entra — recusar não é descartar as duas', () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 40; i++) {
      for (const x of buildItems('memory', COM_COLISAO)) vistas.add(x.answer);
    }
    // Ao longo de muitas rodadas, tanto `body` quanto `dead` aparecem — só nunca juntos.
    expect(vistas.has('body') || vistas.has('dead')).toBe(true);
  });

  it('a rodada continua se completando depois de recusar', () => {
    // 10 cartões, 9 pistas distintas → a rodada de 8 deve sair cheia.
    const itens = buildItems('memory', COM_COLISAO);
    expect(itens).toHaveLength(8);
  });

  it('acento e caixa não escapam da regra', () => {
    // "Água" e "agua" são a MESMA pista; sem normalização comum as duas entrariam.
    const deck = [
      carta('1', 'water', 'Água'),
      carta('2', 'aqua', 'agua'),
      carta('3', 'house', 'casa'),
      carta('4', 'table', 'mesa'),
      carta('5', 'green', 'verde'),
      carta('6', 'plant', 'planta'),
    ];
    const itens = buildItems('memory', deck);
    const pistas = itens.map(x => chaveComparavel(x.prompt));
    expect(new Set(pistas).size).toBe(pistas.length);
  });

  it('baralho onde TODAS as pistas colidem ainda produz rodada (não esvazia)', () => {
    // O jogo vai abaixo do mínimo e a carta dirá o que falta — mas o construtor não pode devolver
    // lista vazia por causa da regra nova, senão trocamos um enigma ruim por uma tela quebrada.
    const todosIguais = ['a', 'b', 'c', 'd', 'e', 'f'].map((w, i) => carta(String(i), `word${'x'.repeat(i + 1)}`, 'mesma'));
    const itens = buildItems('memory', todosIguais);
    expect(itens).toHaveLength(1);
  });

  it('pista de FRASE COM LACUNA também conta — duas lacunas idênticas são a mesma pista', () => {
    // Cartão sem tradução usa a frase com lacuna como pista (`promptFor`). Se dois cartões saem da
    // mesma frase, a lacuna pode coincidir.
    const mesmaFrase = 'the cat sat on the mat';
    const deck = [
      carta('1', 'cat', '', mesmaFrase),
      carta('2', 'cat', '', mesmaFrase),
      carta('3', 'house', 'casa'),
      carta('4', 'table', 'mesa'),
      carta('5', 'green', 'verde'),
      carta('6', 'plant', 'planta'),
    ];
    const itens = buildItems('wordsearch', deck);
    const pistas = itens.map(x => chaveComparavel(x.prompt));
    expect(new Set(pistas).size).toBe(pistas.length);
  });
});

describe('buildTermoRounds — pista única', () => {
  it('não põe duas palavras com a mesma pista no mesmo degrau', () => {
    for (let i = 0; i < 30; i++) {
      const r = buildTermoRounds(COM_COLISAO, { quantidade: 7 });
      const pistas = r.map(x => chaveComparavel(x.pista));
      expect(new Set(pistas).size).toBe(pistas.length);
    }
  });

  it('no modo DIFÍCIL a regra não se aplica — sem pista não há pista repetida', () => {
    const r = buildTermoRounds(COM_COLISAO, { quantidade: 7, dificil: true });
    expect(r.every(x => x.pista === '')).toBe(true);
    // As duas colididas podem coexistir aqui, porque a pista não é o que distingue.
    expect(r.length).toBeGreaterThan(1);
  });

  it('continua respeitando a quantidade pedida quando há material', () => {
    const r = buildTermoRounds(COM_COLISAO, { quantidade: 5 });
    expect(r).toHaveLength(5);
  });
});

describe('promptFor continua o único lugar que decide a pista', () => {
  it('a pista de um cartão com tradução é a tradução', () => {
    expect(promptFor(carta('1', 'body', 'corpo'))?.prompt).toBe('corpo');
  });
});
