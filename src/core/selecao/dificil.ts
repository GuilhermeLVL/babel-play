/**
 * "PALAVRA DIFÍCIL": UMA DEFINIÇÃO SÓ (openspec `modelo-do-aluno-e-dados`, tarefa 3.1).
 *
 * Hoje a régua é a de `ERROS_DE_DIFICIL` (erradas 8 vezes ou mais), repetida em quatro lugares (catálogo de
 * conteúdo, Jogar, aviso da revisão, tela Cartões). Aqui ela mora uma vez; os outros lugares chamam esta função.
 * A dificuldade contínua do jogo (`learning/dificuldade.ts`) é OUTRA coisa (um escore para ordenar) e não muda.
 */
import { ERROS_DE_DIFICIL } from '../learning/resumoDosCartoes';

export { ERROS_DE_DIFICIL };

/** O que a régua precisa saber do cartão. */
export interface ComErros {
  lapses?: number | null;
}

/** Quantos erros tem o cartão (ausente = 0). */
export const errosDoCartao = (c: ComErros): number => c.lapses ?? 0;

/** A palavra escapou vezes demais? A mesma conta da tela Cartões, do aviso da revisão e do Jogar. */
export const ehDificil = (c: ComErros): boolean => errosDoCartao(c) >= ERROS_DE_DIFICIL;

/** Só os difíceis, os que mais escapam primeiro (empate: a ordem de entrada, que é estável). */
export function soOsDificeis<C extends ComErros>(cartoes: readonly C[]): C[] {
  return cartoes
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => ehDificil(c))
    .sort((a, b) => errosDoCartao(b.c) - errosDoCartao(a.c) || a.i - b.i)
    .map(({ c }) => c);
}
