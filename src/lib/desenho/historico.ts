/**
 * DESFAZER E REFAZER do desenho, por traço. Puro e imutável: cada operação devolve o histórico novo.
 * O "presente" é a lista de itens visíveis; o que foi desfeito espera na pilha de refazer até que um
 * traço novo o descarte (como em qualquer editor).
 */

export interface Historico<T> {
  readonly itens: readonly T[];
  readonly refazer: readonly T[];
}

export const LIMITE_DO_HISTORICO = 200;

export function historicoVazio<T>(itens: readonly T[] = []): Historico<T> {
  return { itens, refazer: [] };
}

/** Um traço novo entra no fim e a pilha de refazer é descartada. O teto tira o mais antigo. */
export function acrescentar<T>(h: Historico<T>, item: T, limite = LIMITE_DO_HISTORICO): Historico<T> {
  const itens = [...h.itens, item];
  return { itens: itens.length > limite ? itens.slice(itens.length - limite) : itens, refazer: [] };
}

export function desfazer<T>(h: Historico<T>): Historico<T> {
  if (h.itens.length === 0) return h;
  const ultimo = h.itens[h.itens.length - 1]!;
  return { itens: h.itens.slice(0, -1), refazer: [...h.refazer, ultimo] };
}

export function refazer<T>(h: Historico<T>): Historico<T> {
  if (h.refazer.length === 0) return h;
  const volta = h.refazer[h.refazer.length - 1]!;
  return { itens: [...h.itens, volta], refazer: h.refazer.slice(0, -1) };
}

export const podeDesfazer = <T>(h: Historico<T>) => h.itens.length > 0;
export const podeRefazer = <T>(h: Historico<T>) => h.refazer.length > 0;

/** "Limpar tudo" j� passou pela confirma��o: n�o h� volta (nem pelo refazer). */
export function limpar<T>(): Historico<T> {
  return { itens: [], refazer: [] };
}
