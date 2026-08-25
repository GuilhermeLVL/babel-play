import { describe, it, expect } from 'vitest';
import {
  acumular, mesmaCorrente, marcarPromovidas, resumir,
  pontuarRodada, xpFromRound, buildScrambleRounds,
  type EstadoSequencia, type ItemOutcome, type RoundReport, type MinigameId,
} from '../src/core';

/**
 * O que a corrente precisa garantir. Em ordem de gravidade:
 *
 *  1. `vistosNaSequencia` acumula SEM TETO — é o que impede a corrente de re-sortear a mesma
 *     palavra e mandar o agendador revisá-la de novo. Sem isso, jogar muito PIORA a memória.
 *  2. O guard fecha a corrente ao trocar de jogo ou de fonte — senão o placar de uma corrente de
 *     trilha continua numa de sessão, e o recorde é gravado na origem errada.
 *  3. O combo atravessa rodadas — é o gancho que faz clicar "mais uma".
 */

const acerto = (ref: string): ItemOutcome => ({ correct: true, attempts: 1, ms: 900, itemRef: ref } as ItemOutcome);
const erro = (ref: string): ItemOutcome => ({ correct: false, attempts: 1, ms: 900, itemRef: ref } as ItemOutcome);

function rodada(jogo: MinigameId, items: ItemOutcome[]): RoundReport {
  return { gameId: jogo, items, score: 0, durationMs: 1000 } as RoundReport;
}

/** Soma uma rodada como `Play.tsx` faz: pontua herdando o combo, depois acumula. */
function jogar(s: EstadoSequencia | null, jogo: MinigameId, items: ItemOutcome[], origem = 'baralho') {
  const r = rodada(jogo, items);
  const p = pontuarRodada(jogo, items, { sequenciaInicial: mesmaCorrente(s, jogo, origem) ? s!.sequenciaAtual : 0 });
  return acumular(s, r, p, origem, xpFromRound(r));
}

describe('vistosNaSequencia — a trava do agendador', () => {
  it('acumula TODAS as rodadas da corrente, sem teto', () => {
    let s: EstadoSequencia | null = null;
    for (let volta = 0; volta < 20; volta++) {
      const items = Array.from({ length: 8 }, (_, i) => acerto(`p${volta}-${i}`));
      s = jogar(s, 'memory', items);
    }
    // 20 rodadas × 8 itens = 160 refs distintos. O teto de 60 da memória curta NÃO se aplica aqui.
    expect(s!.vistosNaSequencia.size).toBe(160);
    expect(s!.rodadas).toBe(20);
  });

  it('não perde o que caiu em rodadas antigas quando a corrente é longa', () => {
    let s = jogar(null, 'memory', [acerto('primeira')]);
    for (let i = 0; i < 30; i++) s = jogar(s, 'memory', [acerto(`enche-${i}`)]);
    expect(s.vistosNaSequencia.has('primeira')).toBe(true);
  });

  it('itens sem `itemRef` não entram (não há o que evitar)', () => {
    const s = jogar(null, 'memory', [{ correct: true, attempts: 1, ms: 100 } as ItemOutcome]);
    expect(s.vistosNaSequencia.size).toBe(0);
  });
});

describe('o guard — quando a corrente acaba', () => {
  it('trocar de JOGO começa uma corrente nova', () => {
    const s1 = jogar(null, 'memory', [acerto('a'), acerto('b')]);
    const s2 = jogar(s1, 'blitz', [acerto('c')]);
    expect(s2.rodadas).toBe(1);
    expect(s2.jogo).toBe('blitz');
    expect(s2.vistosNaSequencia.has('a')).toBe(false);
  });

  it('trocar de FONTE começa uma corrente nova — o recorde não pode ir para a origem errada', () => {
    const s1 = jogar(null, 'memory', [acerto('a')], 'baralho');
    const s2 = jogar(s1, 'memory', [acerto('b')], 'trilha:A1');
    expect(s2.rodadas).toBe(1);
    expect(s2.origem).toBe('trilha:A1');
    expect(s2.pontos).toBeLessThan(s1.pontos + s2.pontos + 1);
  });

  it('mesmaCorrente é falso sem estado anterior', () => {
    expect(mesmaCorrente(null, 'memory', 'baralho')).toBe(false);
  });
});

describe('o combo atravessando rodadas', () => {
  it('a sequência sai de uma rodada e entra na seguinte', () => {
    const s1 = jogar(null, 'memory', [acerto('a'), acerto('b'), acerto('c')]);
    expect(s1.sequenciaAtual).toBe(3);
    const s2 = jogar(s1, 'memory', [acerto('d')]);
    expect(s2.melhorSequencia).toBe(4);
  });

  it('emendar duas rodadas paga mais que jogar as mesmas separadas', () => {
    const items = Array.from({ length: 5 }, (_, i) => acerto(`x${i}`));
    const emendado = jogar(jogar(null, 'memory', items), 'memory', items.map((_, i) => acerto(`y${i}`)));
    const soltoA = jogar(null, 'memory', items);
    const soltoB = jogar(null, 'memory', items.map((_, i) => acerto(`y${i}`)));
    expect(emendado.pontos).toBeGreaterThan(soltoA.pontos + soltoB.pontos);
  });

  it('errar no fim de uma rodada zera o combo que entraria na próxima', () => {
    const s = jogar(null, 'memory', [acerto('a'), acerto('b'), acerto('c'), erro('d')]);
    expect(s.sequenciaAtual).toBe(0);
    expect(s.melhorSequencia).toBe(3);   // o melhor da corrente fica registrado
  });
});

describe('o placar somado', () => {
  it('soma rodadas, acertos e XP; a precisão é do conjunto', () => {
    let s = jogar(null, 'memory', [acerto('a'), acerto('b'), erro('c'), erro('d')]);
    s = jogar(s, 'memory', [acerto('e'), acerto('f')]);
    const r = resumir(s)!;
    expect(r.rodadas).toBe(2);
    expect(r.acertos).toBe(4);
    expect(r.total).toBe(6);
    expect(r.precisao).toBe(67);
    expect(r.xp).toBeGreaterThan(0);
  });

  it('resumir devolve null sem corrente — a tela não inventa um placar de zero rodadas', () => {
    expect(resumir(null)).toBeNull();
  });
});

/**
 * POR QUE A CORRENTE PRECISA REORDENAR AS FALAS ANTES DE MONTAR.
 *
 * `buildScrambleRounds` seleciona por `.filter(...).slice(0, quantidade)` — sem sorteio. Dada a
 * mesma lista, devolve a MESMA rodada, sempre. Medido no navegador ao emendar uma corrente: o
 * "mais uma" da Frase embaralhada trazia de volta exatamente as frases anteriores. E os cinco
 * jogos de fala não recebem `evitar` (só `buildItems` e `buildTermoRounds` recebem).
 *
 * A correção fica em `montarRodada`, que empurra para o fim da lista o que já caiu na corrente.
 * Este teste fixa a premissa que a torna válida: a seleção DEPENDE da ordem de entrada. Se algum
 * dia o construtor passar a sortear por conta própria, este teste falha e avisa que a reordenação
 * no chamador virou inócua.
 */
describe('a corrente precisa de material novo', () => {
  const falas = [
    { id: 's1', text: 'she woke up early today', translation: 'ela acordou cedo hoje' },
    { id: 's2', text: 'the coffee is on the table', translation: 'o café está na mesa' },
    { id: 's3', text: 'we should leave before noon', translation: 'devemos sair antes do meio-dia' },
    { id: 's4', text: 'he forgot to close the door', translation: 'ele esqueceu de fechar a porta' },
    { id: 's5', text: 'they arrived at the station', translation: 'eles chegaram na estação' },
    { id: 's6', text: 'the meeting starts in an hour', translation: 'a reunião começa em uma hora' },
  ];
  const idsDe = (r: ReturnType<typeof buildScrambleRounds>) => r.map(x => x.sentenceId).join(',');

  it('a mesma lista devolve a MESMA rodada — é por isso que o chamador reordena', () => {
    expect(idsDe(buildScrambleRounds(falas, { quantidade: 3 })))
      .toBe(idsDe(buildScrambleRounds(falas, { quantidade: 3 })));
  });

  it('empurrar o que já caiu para o fim entrega uma rodada diferente', () => {
    const primeira = buildScrambleRounds(falas, { quantidade: 3 });
    const jaCairam = new Set(primeira.map(x => x.sentenceId));
    // A mesma despriorização que `montarRodada` faz: visto vai para o fim, não é excluído.
    const reordenadas = [
      ...falas.filter(f => !jaCairam.has(f.id)),
      ...falas.filter(f => jaCairam.has(f.id)),
    ];
    const segunda = buildScrambleRounds(reordenadas, { quantidade: 3 });
    expect(idsDe(segunda)).not.toBe(idsDe(primeira));
    for (const r of segunda) expect(jaCairam.has(r.sentenceId!)).toBe(false);
  });

  it('com material insuficiente a rodada REPETE em vez de virar beco sem saída', () => {
    const poucas = falas.slice(0, 2);
    const r = buildScrambleRounds([...poucas].reverse(), { quantidade: 3 });
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('jaPromovidas — a trava da trilha', () => {
  it('guarda entre rodadas, para a mesma palavra errada não virar dois cartões', () => {
    let s = jogar(null, 'memory', [erro('andar')], 'trilha:A1');
    s = marcarPromovidas(s, ['andar']);
    s = jogar(s, 'memory', [erro('andar')], 'trilha:A1');
    expect(s.jaPromovidas.has('andar')).toBe(true);
  });

  it('ignora refs vazias', () => {
    const s = marcarPromovidas(jogar(null, 'memory', [acerto('a')]), ['', 'b']);
    expect(s.jaPromovidas.has('')).toBe(false);
    expect(s.jaPromovidas.has('b')).toBe(true);
  });
});
