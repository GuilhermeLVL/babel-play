import { describe, expect,it } from 'vitest';

import { JOGOS } from '../src/components/views/play/jogos';
import { type MinigameId,MINIGAMES } from '../src/core/minigames/types';

/* `JOGOS` e um array, nao um Record: um id novo em MINIGAMES compila sem entrada aqui e
   simplesmente nao aparece na grade. Este teste e a unica coisa que acusa. */
describe('a grade mostra todo jogo que o sistema conhece', () => {
  const daGrade = JOGOS.map((j) => j.id as MinigameId);
  const daTabela = Object.keys(MINIGAMES) as MinigameId[];

  it('nenhum jogo de MINIGAMES fica fora da grade', () => {
    expect([...daGrade].sort()).toEqual([...daTabela].sort());
  });

  it('nenhum id repetido', () => {
    expect(new Set(daGrade).size).toBe(daGrade.length);
  });

  it('todo jogo tem titulo e descricao nos tres perfis', () => {
    for (const j of JOGOS) {
      for (const perfil of ['kids', 'pro', 'senior'] as const) {
        expect(j.titulo[perfil], `${j.id}.titulo.${perfil}`).toBeTruthy();
        expect(j.descricao[perfil], `${j.id}.descricao.${perfil}`).toBeTruthy();
      }
    }
  });
});
