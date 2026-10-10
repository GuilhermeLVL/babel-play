/**
 * A MESMA RESPOSTA, A MESMA REFERÊNCIA — o que impede o saguão do Jogar de refazer o gate dos jogos
 * por causa de um dado que chegou e não mudou nada.
 *
 * O PROBLEMA (auditoria de desempenho de 10/10/2026, gargalos 2 e 8). As contas do saguão são uma
 * corrente de `useMemo`: triagem → cartões jogáveis → estado dos 18 jogos → sugestão. O `useMemo`
 * compara por REFERÊNCIA, e três coisas trocavam a referência sem trocar o conteúdo: a escolha de
 * fonte restaurada do aparelho (um objeto novo, igual ao que já valia), as métricas do perfil (um
 * conjunto novo de palavras difíceis, o mesmo) e a composição do servidor (que a Trilha nem usa).
 * Contado com `lib/passadasDoPipeline` no build de produção: o gate rodava 3 vezes com o acervo
 * inteiro a cada entrada na tela e 2 a cada fim de rodada, de 240 a 530 ms cada (CPU 4×).
 *
 * O CONSERTO. Cada elo guarda aqui a última resposta que deu. Se a nova é igual, devolve a ANTERIOR,
 * e os elos de baixo não veem mudança. "Igual" é pelos mesmos cartões, na mesma ordem: nada de
 * comparar por texto, que custaria o que se quer poupar.
 *
 * Fica FORA do componente (uma guarda por módulo) para o `useMemo` continuar sem efeito colateral à
 * vista do React: a guarda só troca uma referência por outra de conteúdo idêntico.
 */
import type { Triagem } from '@core';

/** Os mesmos itens, na mesma ordem (comparados por referência). */
export function mesmaLista<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** A mesma partição do acervo: os mesmos cartões em cada pilha, com o mesmo motivo de descarte. */
export function mesmaTriagem(a: Triagem, b: Triagem): boolean {
  if (a === b) return true;
  if (!mesmaLista(a.usaveis, b.usaveis) || !mesmaLista(a.outroIdioma, b.outroIdioma)) return false;
  if (a.fora.length !== b.fora.length) return false;
  for (let i = 0; i < a.fora.length; i++) {
    if (a.fora[i].card !== b.fora[i].card || a.fora[i].motivo !== b.fora[i].motivo) return false;
  }
  return true;
}

/**
 * Uma guarda: lembra a última resposta e a devolve de novo enquanto a seguinte for igual a ela.
 * Só a ÚLTIMA: resposta diferente toma o lugar, e a de antes é esquecida.
 */
export function guardaDeReferencia<T>(iguais: (a: T, b: T) => boolean): (novo: T) => T {
  let ultimo: { valor: T } | null = null;
  return (novo) => {
    if (ultimo && iguais(ultimo.valor, novo)) return ultimo.valor;
    ultimo = { valor: novo };
    return novo;
  };
}
