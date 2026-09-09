import { describe, expect,it } from 'vitest';

import type { MinigameItem } from '../src/core/minigames/types';
import { buildGrid, entraNaGrade,letrasNaGrade, normalizarPalavra } from '../src/core/minigames/wordsearch';

/**
 * A GRADE ESCREVE A PALAVRA COMO ELA E.
 *
 * `buildGrid` usava `normalizarPalavra`, que tira acento: medido no baralho real, 55 palavras
 * entravam com forma diferente da real (`cabeça` desenhada `CABECA`). Nenhuma era perdida — o dano
 * era ENSINAR a grafia errada num jogo de vocabulario, que e pior do que nao jogar.
 */
const item = (answer: string): MinigameItem => ({ cardId: answer, prompt: 'p-' + answer, answer, lang: 'pt-BR' });

describe('as duas reguas sao diferentes de proposito', () => {
  it('a comparacao tira acento — quem digita "cabeca" no Ditado nao errou', () => {
    expect(normalizarPalavra('cabeça')).toBe('CABECA');
    expect(normalizarPalavra('produção')).toBe('PRODUCAO');
  });

  it('a grade preserva — e o que a pessoa vai ler', () => {
    expect(letrasNaGrade('cabeça')).toBe('CABEÇA');
    expect(letrasNaGrade('produção')).toBe('PRODUÇÃO');
  });

  it('as duas descartam alfabeto nao-latino, como antes', () => {
    expect(letrasNaGrade('食べる')).toBe('');
    expect(entraNaGrade('食べる')).toBe(false);
  });

  it('hifen e apostrofo continuam fora da grade', () => {
    expect(letrasNaGrade("don't")).toBe('DONT');
    expect(letrasNaGrade('bem-vindo')).toBe('BEMVINDO');
  });
});

describe('buildGrid desenha a palavra acentuada', () => {
  const grade = buildGrid([item('cabeça'), item('produção'), item('agua'), item('casa')], { seed: 7 });

  it('a palavra colocada tem o acento', () => {
    const textos = grade.colocadas.map((p) => p.palavra);
    expect(textos).toContain('CABEÇA');
  });

  /* O PREENCHIMENTO ENTREGAVA A PALAVRA. Com alfabeto so A-Z, o Ç de CABEÇA seria a unica
     ocorrencia na grade inteira: bastava procurar o caractere estranho. */
  it('o preenchimento usa as letras acentuadas que entraram', () => {
    const todas = grade.letras.flat();
    const cedilhas = todas.filter((l) => l === 'Ç').length;
    const naPalavra = grade.colocadas.filter((p) => p.palavra.includes('Ç')).length;
    expect(naPalavra).toBeGreaterThan(0);
    expect(cedilhas, 'o Ç aparece so dentro da palavra: entrega qual e').toBeGreaterThan(naPalavra);
  });

  it('nenhuma palavra foi perdida por causa do acento', () => {
    expect(grade.naoCouberam).toEqual([]);
  });
});
