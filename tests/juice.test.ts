import { describe, it, expect } from 'vitest';
import { multiplicador, SOM } from '../src/lib/juice';
import { EVENTS } from '../src/lib/soundFx';
import { gradeFor } from '../src/core/minigames/grade';
import { BURST_SPECS } from '../src/lib/effects';

/**
 * A CAMADA DE COMEMORAÇÃO — o que precisa continuar verdade.
 *
 * O risco desta camada não é quebrar, é EXAGERAR. Um efeito grande demais, ou barato demais de
 * conseguir, transforma a tela num caça-níquel; e um multiplicador que sobe sem teto vira número
 * sem significado. Os testes abaixo travam justamente essas duas fronteiras — mais os preços das
 * ajudas, que são o que impede a dica de virar atalho grátis.
 */

describe('multiplicador por sequência', () => {
  it('só existe a partir de três acertos seguidos', () => {
    expect(multiplicador(0)).toBe(1);
    expect(multiplicador(2)).toBe(1);
    expect(multiplicador(3)).toBe(2);
  });

  it('é monótono e tem teto', () => {
    let anterior = 1;
    for (let n = 0; n <= 60; n++) {
      const m = multiplicador(n);
      expect(m).toBeGreaterThanOrEqual(anterior);
      expect(m).toBeLessThanOrEqual(5); // sem teto, o número deixa de significar algo
      anterior = m;
    }
    expect(multiplicador(1000)).toBe(5);
  });

  /* `multiplicador` mudou de casa para o core (a pontuação da rodada precisa dela e o core não
     pode importar DOM). Este arquivo continua importando de `lib/juice`: se o re-export sumir, os
     testes acima quebram — é a trava, e é por isso que este import NÃO foi atualizado. */
  it('continua exportada por lib/juice, para quem já importava de lá', () => {
    expect(typeof multiplicador).toBe('function');
  });
});

describe('o combo tem som próprio', () => {
  it('deixou de emprestar o som de "escolher item numa lista"', () => {
    // Era `select` — uma nota só, idêntica à de clicar num item de lista. Um combo que soa como
    // navegação não avisa nada.
    expect(SOM.sequencia).toBe('combo');
    expect(SOM.sequencia).not.toBe('select');
  });

  it('o gesto do combo SOBE — na gramática do kit, subir é ganho', () => {
    const forma = EVENTS.combo;
    expect(forma).toBeDefined();
    expect([...forma.steps]).toEqual([...forma.steps].sort((a, b) => a - b));
    // Mais contido que o acerto: acontece durante a sequência e não pode competir com ele.
    expect(forma.gain).toBeLessThan(EVENTS.success.gain);
  });
});

describe('as ajudas têm preço', () => {
  it('pedir dica limita a nota a "difícil", nunca "bom"', () => {
    const semDica = gradeFor('termo', { correct: true, attempts: 1, ms: 4000 });
    const comDica = gradeFor('termo', { correct: true, attempts: 1, ms: 4000, hinted: true });
    expect(comDica).toBeLessThan(semDica);
    expect(comDica).toBeLessThanOrEqual(2);
  });

  it('desistir vale menos que pedir dica', () => {
    const comDica = gradeFor('wordsearch', { correct: false, attempts: 1, ms: 1000, hinted: true });
    const revelou = gradeFor('wordsearch', { correct: false, attempts: 1, ms: 1000, revealed: true });
    expect(revelou).toBeLessThan(comDica);
    expect(revelou).toBe(1);
  });
});

describe('as rajadas não podem virar espetáculo pirotécnico', () => {
  it('nenhuma rajada passa de um teto de partículas', () => {
    for (const [nome, spec] of Object.entries(BURST_SPECS)) {
      // 80 é o limite que o canvas absorve sem engasgar num notebook fraco; acima disso o efeito
      // deixa de ser retorno e vira custo de quadro.
      expect(spec.count, `rajada "${nome}"`).toBeLessThanOrEqual(80);
      expect(spec.life, `rajada "${nome}"`).toBeLessThanOrEqual(2500);
    }
  });

  it('a comemoração comum é MENOR que a rara — é o que faz a rara valer algo', () => {
    const comum = BURST_SPECS.xp;
    const rara = BURST_SPECS.perfeito;
    expect(comum.count).toBeLessThan(rara.count);
  });

  it('toda rajada pinta com token de tema, nunca com cor fixa', () => {
    for (const [nome, spec] of Object.entries(BURST_SPECS)) {
      expect(spec.colorToken, `rajada "${nome}"`).toMatch(/^--/);
    }
  });
});
