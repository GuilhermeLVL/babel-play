import { describe, expect, it } from 'vitest';

import { conferirDitado } from '../src/core/minigames/escuta';
import { conferirResposta } from '../src/core/minigames/resposta';

/**
 * RESPOSTA ESCRITA: O QUE CONTA E O QUE NÃO CONTA (QA dos jogos, 2026-09-26).
 *
 * Medido jogando: o Rali aceitava "avó" como resposta de "grandfather" (`chaveDoTermo` apaga o
 * acento dos dois lados, e avó/avô viram a mesma chave) e recusava "bedroom" para "quarto", que o
 * próprio acervo tem como outra palavra com a mesma tradução. As duas decisões ensinam errado.
 *
 * A régua: caixa, espaço e pontuação nunca contam. Acento AUSENTE é tolerado (nem todo teclado
 * escreve "ç"), mas a tela mostra a grafia certa. Acento TROCADO é erro: avó e avô são palavras
 * diferentes. Outra palavra do acervo com a MESMA pista vale, e a tela diz qual era a esperada.
 */
describe('conferirResposta', () => {
  it('caixa, espaços e pontuação de borda não contam', () => {
    expect(conferirResposta('  HOUSE. ', 'house')).toMatchObject({ veredito: 'exata', aceita: true });
    expect(conferirResposta('ice-cream', 'ice cream')).toMatchObject({ aceita: true });
    expect(conferirResposta('Dont', "don't")).toMatchObject({ aceita: true });
  });

  it('acento ausente é tolerado e devolve a grafia certa para mostrar', () => {
    const r = conferirResposta('coracao', 'coração');
    expect(r).toMatchObject({ veredito: 'sem-acento', aceita: true, forma: 'coração' });
    expect(conferirResposta('strasse', 'Straße')).toMatchObject({ veredito: 'sem-acento', aceita: true });
  });

  it('acento trocado é erro: avó não é avô', () => {
    expect(conferirResposta('avó', 'avô')).toMatchObject({ veredito: 'errada', aceita: false });
    expect(conferirResposta('avô', 'avô')).toMatchObject({ veredito: 'exata', aceita: true });
  });

  it('outra palavra com a mesma pista vale, e a esperada é informada', () => {
    const r = conferirResposta('bedroom', 'room', ['bedroom', 'chamber']);
    expect(r).toMatchObject({ veredito: 'alternativa', aceita: true, forma: 'bedroom' });
  });

  it('palavra diferente é erro, e vazio nunca é acerto', () => {
    expect(conferirResposta('dog', 'cat')).toMatchObject({ veredito: 'errada', aceita: false });
    expect(conferirResposta('', 'cat').aceita).toBe(false);
    expect(conferirResposta('...', '...').aceita).toBe(false);
  });

  it('marca de alfabeto não latino NÃO é acento: o dakuten muda a palavra', () => {
    expect(conferirResposta('たへる', 'たべる').aceita).toBe(false);
    expect(conferirResposta('たべる', 'たべる').aceita).toBe(true);
  });

  it('cirílico: pontuação não conta e ё/е é o "acento" tolerado', () => {
    expect(conferirResposta('привет!', 'Привет').aceita).toBe(true);
    expect(conferirResposta('еж', 'ёж')).toMatchObject({ veredito: 'sem-acento', aceita: true });
  });
});

describe('conferirDitado — pontuação não conta em nenhum alfabeto', () => {
  it('russo com vírgula e ponto: todas as palavras certas', () => {
    const r = conferirDitado('Привет, как дела?', 'привет как дела');
    expect(r.acertos).toBe(3);
    expect(r.precisao).toBe(100);
  });

  it('grego com ponto de interrogação próprio', () => {
    expect(conferirDitado('Τι κάνεις;', 'τι κανεις').precisao).toBe(100);
  });

  it('continua recusando número trocado', () => {
    expect(conferirDitado('2', '5').acertos).toBe(0);
  });
});
