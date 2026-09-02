/**
 * A PISTA NÃO PODE CONTER A RESPOSTA.
 *
 * Defeito relatado pelo dono ("aparece uma frase gigante, mas o usuário só tem que escrever uma
 * palavra") e medido no acervo real: no baralho "4000 Essential English Words", **2.224 de 2.225
 * cartões (100%) têm a palavra-alvo escrita dentro do próprio verso**, porque o verso é uma
 * DEFINIÇÃO no mesmo idioma, não uma tradução. `pistaUtil` mede comprimento e ruído e nunca
 * perguntou isso — por construção não tinha como pegar.
 *
 * Os casos abaixo são AMOSTRAS LITERAIS do banco do dono (`vocab_cards` do deck importado), não
 * exemplos inventados: se a regra passar aqui, passa no material que ele de fato joga.
 */
import { describe, it, expect } from 'vitest';
import { vazaResposta, mascararResposta, pistaDeJogo, LACUNA } from '../src/core/learning/pistaDeJogo';

/** Amostras reais do acervo (SELECT word, back FROM vocab_cards … origin_kind='anki'). */
const REAIS: Array<[string, string]> = [
  ['abandon', 'To abandon something is to leave it forever or for a long time.'],
  ['abbey', 'An abbey is a house, or group of houses, where monks or nuns live.'],
  ['ability', 'Ability is the quality of a person being able to do something well.'],
  ['epilepsy', 'Epilepsy is a medical condition that affects the brain and can make someone become unconscious.'],
  ['keyboard', 'A keyboard has buttons marked with letters and numbers that are pressed to put information into a computer.'],
  ['jungle', 'A jungle is a type of forest in a warm, rainy tropical area.'],
];

describe('o defeito, reproduzido com o material real', () => {
  it.each(REAIS)('a definição de "%s" entrega a resposta', (palavra, definicao) => {
    expect(vazaResposta(definicao, palavra)).toBe(true);
  });

  it('depois da máscara, nenhuma amostra real entrega mais a resposta', () => {
    for (const [palavra, definicao] of REAIS) {
      const mascarada = mascararResposta(definicao, palavra);
      expect(vazaResposta(mascarada, palavra), `"${palavra}" ainda vaza: ${mascarada}`).toBe(false);
      expect(mascarada).toContain(LACUNA);
    }
  });

  it('o resto do texto sobrevive intacto — a pista continua ensinando', () => {
    expect(mascararResposta('To abandon something is to leave it forever.', 'abandon'))
      .toBe(`To ${LACUNA} something is to leave it forever.`);
  });
});

describe('flexões (um verso que diz "abandoning" entrega a resposta do mesmo jeito)', () => {
  it.each([
    ['abandon', 'He kept abandoning his friends.'],
    ['abandon', 'The house was abandoned years ago.'],
    ['patrol', 'The guards patrols the area twice.'],
    ['ability', 'Her abilities are remarkable.'],
    ['distinctive', 'It looks distinctively different.'],
  ])('mascara a flexão de "%s"', (palavra, texto) => {
    expect(vazaResposta(texto, palavra)).toBe(true);
    expect(vazaResposta(mascararResposta(texto, palavra), palavra)).toBe(false);
  });
});

describe('o que NÃO pode ser mascarado — senão a pista vira sopa de lacunas', () => {
  it('palavra apenas parecida fica intacta', () => {
    expect(mascararResposta('An article about art history.', 'art')).toBe('An article about ——— history.');
    expect(mascararResposta('The cat sat in the catalog aisle.', 'cat')).toBe('The ——— sat in the catalog aisle.');
  });

  it('palavra-alvo curta demais para flexionar com segurança não vira coringa', () => {
    expect(mascararResposta('To be or not to be, that is the bear.', 'be')).toBe('To ——— or not to ———, that is the bear.');
  });

  it('tradução de verdade (bilíngue) passa sem tocar em nada', () => {
    const pt = 'abandonar, deixar para trás';
    expect(vazaResposta(pt, 'abandon')).toBe(false);
    expect(pistaDeJogo('abandon', pt).texto).toBe(pt);
    expect(pistaDeJogo('abandon', pt).mascarada).toBe(false);
  });
});

describe('pistaDeJogo — o que os jogos consomem', () => {
  it('sinaliza que mascarou, para a UI poder explicar a lacuna', () => {
    const p = pistaDeJogo('abandon', 'To abandon something is to leave it forever.');
    expect(p.mascarada).toBe(true);
    expect(p.texto).not.toMatch(/abandon/i);
  });

  it('a versão curta corta por PALAVRA e nunca no meio de uma', () => {
    const p = pistaDeJogo('keyboard', REAIS[4][1], 60);
    expect(p.curta.length).toBeLessThanOrEqual(61);
    expect(p.curta.endsWith('…')).toBe(true);
    expect(p.curta.slice(0, -1).trim()).not.toMatch(/[^\s]…$/);
    // e o corte não pode reintroduzir a resposta
    expect(vazaResposta(p.curta, 'keyboard')).toBe(false);
  });

  it('pista curta não é encurtada nem ganha reticências', () => {
    expect(pistaDeJogo('casa', 'house').curta).toBe('house');
  });

  it('pista vazia continua vazia — quem decide elegibilidade é outro', () => {
    expect(pistaDeJogo('x', null)).toEqual({ texto: '', mascarada: false, curta: '' });
  });
});
