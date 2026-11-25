/**
 * QUEM ERRA REVÊ NA MESMA RODADA (openspec `cartoes`, tarefa 2.4). Lógica pura da fila.
 *
 * Quando a pessoa dá "Errei", o cartão volta mais adiante NA MESMA RODADA (depois de alguns outros, ou no fim se a
 * fila é curta), para a palavra não ficar para amanhã sem uma segunda chance. É prática, não agendamento:
 *
 *  · a nota "Errei" grava UMA vez só (a primeira); a volta não manda nota nenhuma ao servidor, então o FSRS, os
 *    agregados e o limite do dia não mudam por causa dela;
 *  · cada cartão volta no máximo `MAX_VOLTAS` vezes por rodada (quem erra três vezes seguidas ganha uma pausa, não
 *    um laço sem fim);
 *  · a volta é uma CÓPIA marcada (`repeticaoNaRodada`), para a tela saber que não vale nota.
 */

/** Quantos cartões passam antes de o errado voltar. */
export const DISTANCIA_DA_VOLTA = 4;
/** Quantas vezes o mesmo cartão volta numa rodada. */
export const MAX_VOLTAS = 2;

export interface MarcaDeVolta {
  /** `true` na cópia que volta: ela é prática e não grava nota. */
  repeticaoNaRodada?: boolean;
}

export const ehVolta = (c: MarcaDeVolta): boolean => c.repeticaoNaRodada === true;

/**
 * Devolve a fila com o cartão errado reinserido, e a posição onde entrou; `null` se o cartão já voltou
 * `MAX_VOLTAS` vezes (`voltasJaFeitas`). `atual` é o índice do cartão que acabou de ser respondido.
 */
export function reinserirErrado<C extends { id: string }>(
  fila: readonly C[],
  atual: number,
  cartao: C,
  voltasJaFeitas: number,
): { fila: Array<C & MarcaDeVolta>; posicao: number } | null {
  if (voltasJaFeitas >= MAX_VOLTAS) return null;
  const posicao = Math.min(fila.length, atual + 1 + DISTANCIA_DA_VOLTA);
  const copia: C & MarcaDeVolta = { ...cartao, repeticaoNaRodada: true };
  return { fila: [...fila.slice(0, posicao), copia, ...fila.slice(posicao)], posicao };
}
