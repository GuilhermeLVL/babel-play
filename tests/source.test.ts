import { describe, it, expect } from 'vitest';
import { priorizar, cartoesDaFonte } from '../src/core/minigames/source';

/**
 * "PRATICAR ISTO" — a regra que faz o trecho escolhido em outra tela começar a rodada.
 *
 * Ela sustenta CINCO portas de entrada (Análise, Captura, Métricas, Leitura e o menu de contexto)
 * e é o tipo de lógica em que um engano não aparece: a rodada abre igual, só começando pelo item
 * errado. Por isso mora no core e não dentro da tela.
 */
describe('priorizar', () => {
  const falas = [
    { text: 'primeira fala qualquer' },
    { text: 'os caras são versados em Brasil' },
    { text: 'terceira fala' },
  ];

  it('traz o item escolhido para a frente e MANTÉM o resto', () => {
    const r = priorizar(falas, 'versados', f => f.text);
    expect(r[0].text).toContain('versados');
    expect(r).toHaveLength(3);
    expect(r.map(f => f.text).sort()).toEqual(falas.map(f => f.text).sort());
  });

  it('acha por trecho e sem depender de caixa', () => {
    expect(priorizar(falas, 'SÃO VERSADOS', f => f.text)[0].text).toContain('versados');
  });

  it('não achando o alvo, devolve a lista intacta — a rodada acontece do mesmo jeito', () => {
    expect(priorizar(falas, 'inexistente', f => f.text)).toEqual(falas);
  });

  it('sem alvo, não mexe em nada', () => {
    expect(priorizar(falas, undefined, f => f.text)).toEqual(falas);
    expect(priorizar(falas, '   ', f => f.text)).toEqual(falas);
  });

  it('item já na frente não é reordenado (evita cópia à toa)', () => {
    expect(priorizar(falas, 'primeira', f => f.text)).toBe(falas);
  });

  it('lista vazia não quebra', () => {
    expect(priorizar([] as Array<{ text: string }>, 'qualquer', f => f.text)).toEqual([]);
  });
});

/**
 * O NÍVEL DA TRILHA precisa filtrar a rodada, e não filtrava: `cartoesDaFonte` recortava só pela
 * origem, então escolher A2 mudava apenas qual lote seria baixado. Uma trilha graduada que não
 * gradua promete um degrau e entrega o monte.
 */
describe('cartoesDaFonte — trilha por nível', () => {
  const carta = (word: string, cefrLevel?: string) => ({
    id: word, word, translation: `t-${word}`, sentence: '', srcLang: 'en',
    /* `daTrilha`, e não `sourceSessionId: 'trilha:en'`: aquele id não sobrevive no banco (o
       servidor o sanea para NULL), então filtrar por ele nunca casava uma linha. */
    daTrilha: true, cefrLevel, inDeck: true,
  } as never);

  const baralho = [
    carta('house', 'A1'), carta('table', 'A1'),
    carta('journey', 'B1'), carta('although', 'B1'),
    carta('capturada', undefined),
  ] as never[];
  // Uma capturada, de fora da trilha, para provar que a origem continua valendo.
  const comCapturada = [...baralho, { id: 'x', word: 'random', translation: 'aleatório', srcLang: 'en', sourceSessionId: 'sessao-1', inDeck: true } as never];

  it('A1 e B1 devolvem conjuntos DISJUNTOS nas palavras que têm nível', () => {
    const a1 = cartoesDaFonte(comCapturada, { id: 'trilha', lang: 'en', nivel: 'A1' } as never)
      .usaveis.map(c => c.word).filter(w => w !== 'capturada');
    const b1 = cartoesDaFonte(comCapturada, { id: 'trilha', lang: 'en', nivel: 'B1' } as never)
      .usaveis.map(c => c.word).filter(w => w !== 'capturada');
    expect(a1.sort()).toEqual(['house', 'table']);
    expect(b1.sort()).toEqual(['although', 'journey']);
    expect(a1.filter(w => b1.includes(w))).toEqual([]);
  });

  it('sem nível escolhido, a trilha inteira joga', () => {
    const todos = cartoesDaFonte(comCapturada, { id: 'trilha', lang: 'en' } as never).usaveis.map(c => c.word);
    expect(todos).toHaveLength(5);
    expect(todos).not.toContain('random');   // a origem continua filtrando
  });

  it('cartão SEM nível declarado entra em qualquer nível — não castiga quem já usava a trilha', () => {
    const a1 = cartoesDaFonte(baralho, { id: 'trilha', lang: 'en', nivel: 'A1' } as never).usaveis.map(c => c.word);
    expect(a1).toContain('capturada');
  });

  it('a origem continua valendo: palavra de sessão nunca entra na trilha', () => {
    const r = cartoesDaFonte(comCapturada, { id: 'trilha', lang: 'en', nivel: 'A1' } as never).usaveis.map(c => c.word);
    expect(r).not.toContain('random');
  });
});
