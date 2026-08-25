import { describe, it, expect } from 'vitest';
import { avaliarPalpite, acertou, estadoDoTeclado, buildTermoRounds, contarJogaveisTermo, MIN_LETRAS, MAX_LETRAS } from '../src/core/minigames/termo';
import { shuffleWords, checkOrder, acertosPosicionais, tokenize, fraseJogavel, buildScrambleRounds } from '../src/core/minigames/scramble';
import type { VocabCard } from '../src/types';

const estados = (palpite: string, resposta: string) => avaliarPalpite(palpite, resposta).estados;

describe('Termo — avaliação de letras', () => {
  it('marca posições exatas', () => {
    expect(estados('CASA', 'CASA')).toEqual(['certa', 'certa', 'certa', 'certa']);
  });

  it('marca letra existente fora de lugar', () => {
    // SACA × CASA: os dois "A" já caem na posição exata (1 e 3); S e C existem, deslocados.
    expect(estados('SACA', 'CASA')).toEqual(['existe', 'certa', 'existe', 'certa']);
  });

  it('letra que não existe fica ausente', () => {
    expect(estados('MUDO', 'CASA')).toEqual(['ausente', 'ausente', 'ausente', 'ausente']);
  });

  /**
   * O CASO QUE QUASE TODA IMPLEMENTAÇÃO ERRA. "CASA" tem DOIS "A": um palpite com quatro "A"
   * só pode marcar dois. Uma passada só devolveria quatro amarelos e mentiria para o jogador.
   */
  it('letras repetidas respeitam o ESTOQUE da resposta', () => {
    // CASA: A na posição 2 e 4. "AAAA" → posição 2 e 4 certas, as outras ausentes (estoque zerado).
    expect(estados('AAAA', 'CASA')).toEqual(['ausente', 'certa', 'ausente', 'certa']);
  });

  it('exato consome antes do amarelo (a posição certa tem prioridade)', () => {
    // Resposta OVO: um O na posição 1 e outro na 3.
    // Palpite OOOO seria maior; use tamanho igual: "OOO" → 1ª certa, 2ª ausente (estoque), 3ª certa.
    expect(estados('OOO', 'OVO')).toEqual(['certa', 'ausente', 'certa']);
  });

  it('amarelo é distribuído da esquerda para a direita enquanto há estoque', () => {
    // Resposta "ABA" (dois A). Palpite "AAB": pos0 A certa (consome 1 A), pos1 A → resta 1 A → existe,
    // pos2 B → existe (o B da resposta está livre).
    expect(estados('AAB', 'ABA')).toEqual(['certa', 'existe', 'existe']);
  });

  it('ignora acento e caixa — a grade não pode exigir acentuação', () => {
    expect(acertou(avaliarPalpite('coracao', 'CORAÇÃO'))).toBe(true);
  });

  it('acertou() só é verdade com tudo certo', () => {
    expect(acertou(avaliarPalpite('CASA', 'CASA'))).toBe(true);
    expect(acertou(avaliarPalpite('SACA', 'CASA'))).toBe(false);
  });
});

describe('Termo — teclado acumulado', () => {
  it('a letra guarda o MELHOR estado já conquistado', () => {
    const p1 = avaliarPalpite('SACA', 'CASA');  // C existe
    const p2 = avaliarPalpite('CASA', 'CASA');  // C certa
    expect(estadoDoTeclado([p1, p2]).C).toBe('certa');
    // E não regride se um palpite posterior for pior.
    expect(estadoDoTeclado([p2, p1]).C).toBe('certa');
  });

  it('letra nunca usada não aparece no teclado', () => {
    expect(estadoDoTeclado([avaliarPalpite('CASA', 'CASA')]).Z).toBeUndefined();
  });
});

const card = (over: Partial<VocabCard> = {}): VocabCard => ({
  id: 'c', word: 'house', phonetics: '', translation: 'casa', explanation: '',
  frequency: 'medium', leitnerBox: 1, leitnerDueAt: '', fsrsState: 'Review',
  fsrsStability: 5, fsrsDifficulty: 5, fsrsPredictedRetention: 0,
  fsrsDueAt: new Date(Date.now() + 86400000).toISOString(), inDeck: true, ...over,
});

describe('Termo — seleção de palavras', () => {
  it('descarta palavras curtas, longas e sem tradução', () => {
    const deck = [
      card({ id: 'ok', word: 'house' }),
      card({ id: 'curta', word: 'go' }),
      card({ id: 'longa', word: 'extraordinarily' }),
      card({ id: 'sem-pista', word: 'water', translation: '' }),
    ];
    expect(buildTermoRounds(deck).map(r => r.cardId)).toEqual(['ok']);
    expect(contarJogaveisTermo(deck)).toBe(1);
  });

  it('a resposta vai normalizada (só letras maiúsculas)', () => {
    expect(buildTermoRounds([card({ word: 'coração' })])[0].resposta).toBe('CORACAO');
  });

  it('respeita a faixa de tamanho declarada', () => {
    for (const r of buildTermoRounds([card({ word: 'house' }), card({ id: 'b', word: 'water' })])) {
      expect(r.resposta.length).toBeGreaterThanOrEqual(MIN_LETRAS);
      expect(r.resposta.length).toBeLessThanOrEqual(MAX_LETRAS);
    }
  });

  it('modo difícil não entrega a pista', () => {
    expect(buildTermoRounds([card()], { dificil: true })[0].pista).toBe('');
  });
});

describe('Frase embaralhada', () => {
  const frase = ['I', 'live', 'in', 'a', 'big', 'house'];

  it('NUNCA devolve a ordem original (senão entrega a resposta)', () => {
    for (let i = 0; i < 40; i++) {
      expect(shuffleWords(frase).join(' ')).not.toBe(frase.join(' '));
    }
  });

  it('preserva exatamente as mesmas palavras', () => {
    const s = shuffleWords(frase);
    expect([...s].sort()).toEqual([...frase].sort());
  });

  it('funciona com listas mínimas sem quebrar', () => {
    expect(shuffleWords([])).toEqual([]);
    expect(shuffleWords(['um'])).toEqual(['um']);
    expect(shuffleWords(['a', 'b']).join(' ')).toBe('b a');
  });

  it('a verificação ignora caixa e pontuação de borda', () => {
    expect(checkOrder(['i', 'live', 'in', 'a', 'big', 'house.'], frase)).toBe(true);
    expect(checkOrder(['live', 'I', 'in', 'a', 'big', 'house'], frase)).toBe(false);
  });

  it('acertos posicionais dão o feedback parcial', () => {
    expect(acertosPosicionais(frase, frase)).toBe(6);
    expect(acertosPosicionais(['I', 'live', 'a', 'in', 'big', 'house'], frase)).toBe(4);
  });

  it('só entram frases com tamanho útil E tradução', () => {
    expect(fraseJogavel('I live in a big house', 'moro numa casa grande')).toBe(true);
    expect(fraseJogavel('Sim', 'yes')).toBe(false);                    // curta demais
    expect(fraseJogavel('I live in a big house', '')).toBe(false);     // sem tradução
    expect(fraseJogavel(Array(20).fill('x').join(' '), 'y')).toBe(false); // longa demais
  });

  it('monta rodadas só com falas reais aproveitáveis', () => {
    const rodadas = buildScrambleRounds([
      { id: 's1', text: 'I live in a big house', translation: 'moro numa casa grande' },
      { id: 's2', text: 'Sim', translation: 'yes' },
      { id: 's3', text: 'she works at the hospital today', translation: 'ela trabalha no hospital hoje' },
    ]);
    expect(rodadas.map(r => r.sentenceId)).toEqual(['s1', 's3']);
    expect(rodadas[0].correta).toEqual(tokenize('I live in a big house'));
  });
});
