import { describe, it, expect } from 'vitest';
import {
  buildRodadasEscuta, buildRodadasDitado, conferirDitado,
  buildRodadasConectores, notaConectores, temConectores, falasAudiveis,
  type FalaComAudio,
} from '../src/core/minigames/escuta';

/**
 * OS TRÊS SUBSTITUTOS DOS EXERCÍCIOS LEGADOS.
 *
 * O que estes testes travam são as decisões que fazem cada jogo ser JUSTO: alternativa que se
 * distingue pela duração do áudio (e não pela escuta), ditado que pune pontuação, e nota que
 * premia quem clica em tudo.
 */

const semSorte = <T,>(xs: T[]) => [...xs];

function fala(over: Partial<FalaComAudio> & { text: string }): FalaComAudio {
  return { id: over.text, startMs: 0, endMs: 3000, lang: 'en', ...over };
}

const FALAS: FalaComAudio[] = [
  fala({ id: 'a', text: 'The guys are knowledgeable about Brazil.' }),
  fala({ id: 'b', text: 'The fame is from the American singer.' }),
  fala({ id: 'c', text: 'However, the other countries know that.' }),
  fala({ id: 'd', text: 'She stayed because the weather was bad.' }),
  fala({ id: 'e', text: 'Yes.' }),                                  // curta demais
  fala({ id: 'f', text: 'and it can not belong to', endMs: 3000 }), // cortada no meio
];

describe('quais falas dá para escutar', () => {
  it('descarta fala curta, cortada e sem áudio de verdade', () => {
    const uteis = falasAudiveis(FALAS).map(f => f.id);
    expect(uteis).toEqual(['a', 'b', 'c', 'd']);
  });

  it('trecho de áudio curtíssimo não vira rodada — não há o que ouvir', () => {
    const piscada = [fala({ id: 'x', text: 'This is a full sentence here.', startMs: 0, endMs: 300 })];
    expect(falasAudiveis(piscada)).toEqual([]);
  });
});

describe('Qual foi? — escuta', () => {
  it('a resposta certa está entre as opções', () => {
    const r = buildRodadasEscuta(FALAS, { quantidade: 2, alternativas: 3, shuffle: semSorte });
    for (const rodada of r) {
      expect(rodada.opcoes.map(o => o.id)).toContain(rodada.correta.id);
    }
  });

  it('as alternativas têm comprimento PARECIDO — senão a duração do áudio entrega a resposta', () => {
    const variadas = [
      fala({ id: 'curta', text: 'He came home early today.' }),
      fala({ id: 'media', text: 'He came home early today after work.' }),
      fala({ id: 'longa', text: 'He came home early today after a very long and tiring day at the office downtown.' }),
      fala({ id: 'media2', text: 'She left the house late this morning.' }),
    ];
    const [r] = buildRodadasEscuta(variadas, { quantidade: 1, alternativas: 3, shuffle: semSorte });
    // A alternativa mais desproporcional fica de fora quando há opção melhor.
    expect(r.opcoes.map(o => o.id)).not.toContain('longa');
  });

  it('não oferece a mesma frase duas vezes como alternativa', () => {
    const repetidas = [
      fala({ id: '1', text: 'The same sentence here.' }),
      fala({ id: '2', text: 'The same sentence here.' }),   // texto idêntico, id diferente
      fala({ id: '3', text: 'A different sentence here.' }),
      fala({ id: '4', text: 'Another different one here.' }),
    ];
    const [r] = buildRodadasEscuta(repetidas, { quantidade: 1, alternativas: 4, shuffle: semSorte });
    const textos = r.opcoes.map(o => o.text);
    expect(new Set(textos).size).toBe(textos.length);
  });

  it('sem falas suficientes, não monta rodada meia-boca', () => {
    expect(buildRodadasEscuta([FALAS[0]], { alternativas: 4 })).toEqual([]);
  });
});

describe('Ditado', () => {
  it('só usa falas na janela de 4 a 12 palavras', () => {
    const r = buildRodadasDitado(FALAS, { quantidade: 9, shuffle: semSorte });
    for (const x of r) {
      expect(x.palavras).toBeGreaterThanOrEqual(4);
      expect(x.palavras).toBeLessThanOrEqual(12);
    }
  });

  it('acerto total', () => {
    const r = conferirDitado('the fame is from', 'the fame is from');
    expect(r.precisao).toBe(100);
    expect(r.palavras.every(p => p.certa)).toBe(true);
  });

  it('ignora pontuação, acento e caixa — o jogo é de ESCUTA, não de digitação', () => {
    // Punir a vírgula aqui ensinaria a coisa errada: quem ouviu certo ouviu certo.
    expect(conferirDitado('However, she stayed.', 'however she stayed').precisao).toBe(100);
    expect(conferirDitado('É água', 'e agua').precisao).toBe(100);
  });

  it('palavra ENGOLIDA não vira "ouvimos X" com a palavra seguinte', () => {
    // Quando se pula uma palavra, a seguinte desliza para aquele índice. A versão anterior lia
    // `dito[i]` direto e dizia "esperava 'blue', ouvimos 'sky'" — mas "sky" foi falado certo e
    // casou com o próprio lugar. Trocar e engolir pedem correções diferentes.
    const r = conferirDitado('the blue sky is clear', 'the sky is clear');
    const errada = r.palavras.find(p => !p.certa);
    expect(errada).toMatchObject({ esperada: 'blue', escrita: null });
    expect(r.palavras.filter(p => p.certa).map(p => p.esperada)).toEqual(['the', 'sky', 'is', 'clear']);
  });

  it('troca de verdade continua mostrando o que foi dito no lugar', () => {
    const r = conferirDitado('the blue sky', 'the green sky');
    expect(r.palavras.find(p => !p.certa)).toMatchObject({ esperada: 'blue', escrita: 'green' });
  });

  it('número errado NÃO passa por certo', () => {
    // `normalizarPalavra` só mantém A–Z, então "2" e "5" viravam ambos string vazia — e duas
    // vazias são iguais. O jogo dava acerto onde a pessoa errou.
    const r = conferirDitado('I have 2 cats', 'I have 5 cats');
    expect(r.precisao).toBe(75);
    expect(r.palavras.find(p => !p.certa)).toMatchObject({ esperada: '2', escrita: '5' });
  });

  it('número certo continua contando como acerto', () => {
    expect(conferirDitado('I have 2 cats', 'I have 2 cats').precisao).toBe(100);
  });

  it('mostra ONDE errou, não só um percentual', () => {
    const r = conferirDitado('the fame is from', 'the game is from');
    expect(r.precisao).toBe(75);
    const errada = r.palavras.find(p => !p.certa);
    expect(errada).toMatchObject({ esperada: 'fame', escrita: 'game' });
  });

  it('palavra pulada não estraga o resto da frase', () => {
    // Sem a janela de tolerância, faltar uma palavra no começo marcaria TODAS as seguintes como
    // erradas — e um deslize apagaria o mérito da frase inteira.
    const r = conferirDitado('the fame is from the american', 'fame is from the american');
    expect(r.acertos).toBe(5);
    expect(r.palavras[0].certa).toBe(false);
  });

  it('resposta vazia é zero, sem estourar', () => {
    expect(conferirDitado('uma frase qualquer', '')).toMatchObject({ acertos: 0, precisao: 0 });
  });
});

describe('Caça-conectores', () => {
  it('só oferece o jogo em idioma com lista — não aplica a régua inglesa ao francês', () => {
    expect(temConectores('en')).toBe(true);
    expect(temConectores('pt-BR')).toBe(true);
    expect(temConectores('fr')).toBe(false);
    expect(buildRodadasConectores(FALAS, { lang: 'fr' })).toEqual([]);
  });

  it('acha os conectores na fala real', () => {
    const r = buildRodadasConectores(FALAS, { lang: 'en', quantidade: 9, shuffle: semSorte });
    const comHowever = r.find(x => x.fala.id === 'c');
    expect(comHowever?.tokens[comHowever.alvos[0]].toLowerCase()).toContain('however');
  });

  it('frase SEM conector nenhum não vira rodada', () => {
    // Seria uma tela em que a resposta certa é não clicar em nada.
    const sem = [fala({ id: 'z', text: 'My brother bought a red car yesterday.' })];
    expect(buildRodadasConectores(sem, { lang: 'en' })).toEqual([]);
  });

  it('a nota é F1: clicar em tudo NÃO garante nota boa', () => {
    const alvos = [0, 5];
    const soCertos = notaConectores([0, 5], alvos);
    const clicouTudo = notaConectores([0, 1, 2, 3, 4, 5, 6, 7], alvos);
    expect(soCertos.f1).toBe(100);
    expect(clicouTudo.f1).toBeLessThan(50);
    expect(clicouTudo.falsos).toBe(6);
  });

  it('deixar passar pesa tanto quanto marcar errado', () => {
    const deixouPassar = notaConectores([0], [0, 5]);      // 1 de 2
    const marcouAMais = notaConectores([0, 5, 9], [0, 5]);  // 2 certos + 1 falso
    expect(deixouPassar.perdidos).toBe(1);
    expect(marcouAMais.falsos).toBe(1);
    expect(Math.abs(deixouPassar.f1 - marcouAMais.f1)).toBeLessThanOrEqual(15);
  });

  it('não marcar nada é zero, sem dividir por zero', () => {
    expect(notaConectores([], [0, 3]).f1).toBe(0);
  });
});
