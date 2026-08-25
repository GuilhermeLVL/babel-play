import { describe, it, expect } from 'vitest';
import {
  pontuarRodada, scoreRound, multiplicador, MINIGAMES,
  PONTOS_BASE, BONUS_RAPIDO, BONUS_SEM_DICA, LIMITE_RESPOSTA_RAPIDA_MS,
  MINIGAME_IDS,
  type ItemOutcome,
} from '../src/core';
import { exerciseResultSchema } from '../server/validation';

/**
 * Estes testes travam a ORDENAÇÃO, não os números. Base 10, rápido +5 e sem-dica +3 são
 * calibração — quem quiser mexer deve poder, sem reescrever a suíte. O que não pode mudar é
 * "perfeita e rápida vale mais que lenta", "revelar não pontua" e "o combo atravessa a rodada".
 */

const acerto = (extra: Partial<ItemOutcome> = {}): ItemOutcome =>
  ({ correct: true, attempts: 1, ms: 1000, ...extra } as ItemOutcome);
const erro = (): ItemOutcome => ({ correct: false, attempts: 1, ms: 1000 } as ItemOutcome);

describe('pontuarRodada — as parcelas', () => {
  it('perfeita+rápida+sem dica > lenta > com dica (a ordenação é o contrato)', () => {
    const itens = 5;
    const rapida = Array.from({ length: itens }, () => acerto({ ms: 500 }));
    const lenta = Array.from({ length: itens }, () => acerto({ ms: LIMITE_RESPOSTA_RAPIDA_MS + 1 }));
    const comDica = Array.from({ length: itens }, () => acerto({ ms: LIMITE_RESPOSTA_RAPIDA_MS + 1, hinted: true }));

    const a = pontuarRodada('memory', rapida).total;
    const b = pontuarRodada('memory', lenta).total;
    const c = pontuarRodada('memory', comDica).total;
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it('o bônus de velocidade usa o MESMO limiar do agendador', () => {
    const noLimite = pontuarRodada('memory', [acerto({ ms: LIMITE_RESPOSTA_RAPIDA_MS })]);
    const umMsDepois = pontuarRodada('memory', [acerto({ ms: LIMITE_RESPOSTA_RAPIDA_MS + 1 })]);
    expect(noLimite.bonusVelocidade).toBe(BONUS_RAPIDO);
    expect(umMsDepois.bonusVelocidade).toBe(0);
  });

  it('sem-dica exige acertar de primeira E não pedir ajuda', () => {
    expect(pontuarRodada('memory', [acerto()]).bonusSemDica).toBe(BONUS_SEM_DICA);
    expect(pontuarRodada('memory', [acerto({ hinted: true })]).bonusSemDica).toBe(0);
    expect(pontuarRodada('memory', [acerto({ attempts: 2 })]).bonusSemDica).toBe(0);
  });

  it('o multiplicador multiplica só a BASE — os bônus não compõem', () => {
    // 6 acertos seguidos: o 6º já vale 3×. Se o multiplicador pegasse nos bônus, o total
    // estouraria a soma de base+combo+parcelas fixas.
    const r = pontuarRodada('memory', Array.from({ length: 6 }, () => acerto({ ms: 500 })));
    expect(r.base).toBe(6 * PONTOS_BASE);
    expect(r.bonusVelocidade).toBe(6 * BONUS_RAPIDO);
    expect(r.bonusSemDica).toBe(6 * BONUS_SEM_DICA);
    expect(r.total).toBe(r.base + r.bonusCombo + r.bonusVelocidade + r.bonusSemDica);
  });
});

describe('pontuarRodada — o combo', () => {
  it('vale para TODOS os nove jogos, não só para o duelo', () => {
    const seguidos = Array.from({ length: 6 }, () => acerto());
    for (const id of MINIGAME_IDS) {
      expect(pontuarRodada(id, seguidos).bonusCombo, `${id} sem combo`).toBeGreaterThan(0);
    }
  });

  it('um erro no meio zera a sequência e o que sai é 0', () => {
    const r = pontuarRodada('blitz', [acerto(), acerto(), acerto(), erro()]);
    expect(r.melhorSequencia).toBe(3);
    expect(r.sequenciaFinal).toBe(0);
  });

  it('`sequenciaInicial` já multiplica o PRIMEIRO item — é o combo atravessando rodadas', () => {
    const comHeranca = pontuarRodada('memory', [acerto()], { sequenciaInicial: 5 });
    const doZero = pontuarRodada('memory', [acerto()]);
    expect(comHeranca.bonusCombo).toBe(PONTOS_BASE * (multiplicador(6) - 1));
    expect(doZero.bonusCombo).toBe(0);
    expect(comHeranca.total).toBeGreaterThan(doZero.total);
  });

  it('a sequência que SAI alimenta a próxima rodada sem perda', () => {
    const primeira = pontuarRodada('memory', [acerto(), acerto(), acerto()]);
    expect(primeira.sequenciaFinal).toBe(3);
    const segunda = pontuarRodada('memory', [acerto()], { sequenciaInicial: primeira.sequenciaFinal });
    expect(segunda.melhorSequencia).toBe(4);
  });
});

describe('pontuarRodada — o que nunca pontua', () => {
  it('`revealed` não vale ponto em nenhum dos nove, e ainda quebra o combo', () => {
    for (const id of MINIGAME_IDS) {
      const r = pontuarRodada(id, [acerto({ revealed: true })]);
      expect(r.total, `${id} pontuou uma revelação`).toBe(0);
      expect(r.sequenciaFinal, `${id} manteve o combo após revelar`).toBe(0);
    }
  });

  it('rodada vazia vale zero e não quebra', () => {
    expect(pontuarRodada('memory', []).total).toBe(0);
  });
});

describe('scoreRound — o wrapper não diverge', () => {
  it('devolve exatamente o total de pontuarRodada nos nove jogos', () => {
    const amostra = [acerto({ ms: 400 }), erro(), acerto(), acerto({ hinted: true })];
    for (const id of MINIGAME_IDS) {
      expect(scoreRound(id, amostra)).toBe(pontuarRodada(id, amostra).total);
    }
  });
});

/**
 * O TESTE QUE AMARRA CORE E VALIDAÇÃO.
 *
 * É o acoplamento que estava quebrado: `scoreRound` do duelo passava de 100 com 5 acertos
 * seguidos, e o zod do servidor recusava `score > 100` — a rodada inteira sumia em silêncio.
 * Medido no banco antes do conserto: 53 linhas de blitz, `max(score)` 90, UM `round_id`.
 *
 * Agora que o combo vale nos nove e há bônus, TODOS eles passam de 100. Este teste falha se
 * alguém mexer no teto do zod ou na escala da pontuação sem olhar para o outro lado.
 */
describe('o teto do servidor aguenta a pontuação real', () => {
  it('o pior caso de cada jogo passa na validação do POST', () => {
    for (const id of MINIGAME_IDS) {
      const max = MINIGAMES[id].maxItems;
      const perfeita = Array.from({ length: max }, () => acerto({ ms: 1 }));
      const pior = pontuarRodada(id, perfeita, { sequenciaInicial: 15 }).total;
      const r = exerciseResultSchema.safeParse({ exerciseKind: id, score: pior });
      expect(r.success, `${id}: score ${pior} recusado pelo servidor`).toBe(true);
    }
  });

  it('o duelo relâmpago — o caso que quebrava — passa com folga', () => {
    const perfeita = Array.from({ length: MINIGAMES.blitz.maxItems }, () => acerto({ ms: 1 }));
    const pontos = pontuarRodada('blitz', perfeita, { sequenciaInicial: 15 }).total;
    expect(pontos).toBeGreaterThan(100);            // continua estourando o teto ANTIGO
    expect(exerciseResultSchema.safeParse({ exerciseKind: 'blitz', score: pontos }).success).toBe(true);
  });
});
