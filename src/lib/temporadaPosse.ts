/**
 * POSSE DA TEMPORADA — só o espelho local, num módulo minúsculo (o padrão de `maestriaPosse`).
 *
 * Separado de `lib/temporada` (que fala com a API) porque `loja.estadoDoItem` precisa perguntar
 * "este item de temporada já é meu?" sem arrastar rede nem criar ciclo de importação. Guarda só o
 * que o SERVIDOR confirmou: os `temporada:<id>:<nível>:<trilha>` já lançados.
 */
import { itemDoCreditoDaTemporada } from '@core';

const CHAVE = 'babel.temporada_creditada';

/** Os `temporada:` que o servidor já creditou (espelho local). */
export function temporadasCreditadas(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Substitui o espelho pela lista do servidor — ele é a fonte. */
export function hidratarTemporada(creditados: readonly string[]): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...new Set(creditados)].sort()));
  } catch {
    /* sem storage: os itens de temporada ficam trancados até a próxima leitura */
  }
}

/** Os ids de item que os créditos de temporada já entregaram. */
export function itensDaTemporadaPossuidos(creditados: ReadonlySet<string> = temporadasCreditadas()): Set<string> {
  const ids = new Set<string>();
  for (const c of creditados) {
    const item = itemDoCreditoDaTemporada(c);
    if (item) ids.add(item.id);
  }
  return ids;
}
