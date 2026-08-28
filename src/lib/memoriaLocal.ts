/**
 * MEMÓRIA LOCAL DA PRÁTICA — o que antes morria no F5.
 *
 *  · VISTAS RECENTES por origem: os itens que caíram nas últimas rodadas (era estado React, teto
 *    60, zerado a cada recarga). Agora localStorage, teto 200, por origem (`baralho`, `sessao:<id>`,
 *    `trilha:<nivel>`), com carimbo para poder envelhecer.
 *  · PRECISÕES por jogo: as últimas 5 precisões (%) de cada jogo, insumo do modo Auto
 *    (`core/minigames/autoDificuldade`).
 *
 * Mesmo padrão de `eventosVistos`/`possuidos`: JSON em localStorage, try/catch, nunca lança.
 */
const TETO_VISTAS = 200;
const TETO_PRECISOES = 5;

const chaveVistas = (origem: string) => `babel.vistas.${origem}`;
const chavePrecisoes = (jogo: string) => `babel.precisoes.${jogo}`;

export function lerVistas(origem: string): string[] {
  try { return JSON.parse(localStorage.getItem(chaveVistas(origem)) || '[]') as string[]; } catch { return []; }
}

/** Acrescenta refs (mais recentes no fim) e corta pelo teto. Devolve a lista nova. */
export function registrarVistas(origem: string, refs: Iterable<string>): string[] {
  const atual = lerVistas(origem);
  const set = new Set(atual);
  for (const r of refs) { set.delete(r); set.add(r); } // re-inserir move para o fim (mais recente)
  const lista = [...set].slice(-TETO_VISTAS);
  try { localStorage.setItem(chaveVistas(origem), JSON.stringify(lista)); } catch { /* sem storage */ }
  return lista;
}

/** As N mais recentes (para "evitar o que acabou de cair"). */
export function vistasRecentes(origem: string, n = 24): Set<string> {
  return new Set(lerVistas(origem).slice(-n));
}

export function lerPrecisoes(jogo: string): number[] {
  try { return JSON.parse(localStorage.getItem(chavePrecisoes(jogo)) || '[]') as number[]; } catch { return []; }
}

export function registrarPrecisao(jogo: string, precisao: number): number[] {
  const lista = [...lerPrecisoes(jogo), Math.max(0, Math.min(100, Math.round(precisao)))].slice(-TETO_PRECISOES);
  try { localStorage.setItem(chavePrecisoes(jogo), JSON.stringify(lista)); } catch { /* sem storage */ }
  return lista;
}
