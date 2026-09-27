/**
 * MAESTRIA NO CLIENTE (recompensas v2, onda 3): ler a maestria do servidor, pedir os créditos que
 * faltam e guardar o espelho local dos níveis creditados.
 *
 * O SERVIDOR DECIDE. `GET /api/metrics/maestria` soma os pontos das linhas gravadas; cada
 * `maestria:<jogo>:<nível>` que falta é pedido pela rota de crédito, que confere os pontos de novo.
 * O espelho local (`babel.maestria_creditada`) só guarda o que o servidor já confirmou — é o que
 * `estadoDoItem` consulta para abrir os itens de maestria sem ir à rede.
 *
 * Tudo atrás da flag `recompensas_v2`.
 */
import {
  creditoDeMaestria,
  creditosDeMaestriaDevidos,
  type ItemDaLoja,
  type MinigameId,
  type NivelAlcancavel,
  type NivelDeMaestria,
} from '@core';

import { creditarSeeds, lerMaestria, type MaestriaNoServidor } from '../data/api';
import { recompensasV2Ligadas } from './recompensasV2';

const CHAVE = 'babel.maestria_creditada';

/** Os `maestria:<jogo>:<nível>` que o servidor já creditou (espelho local). */
export function maestriasCreditadas(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE) || '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** Substitui o espelho pela lista do servidor — ele é a fonte. */
export function hidratarMaestria(creditados: readonly string[]): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...new Set(creditados)].sort()));
  } catch {
    /* sem storage: os itens de maestria ficam trancados até a próxima leitura */
  }
}

/** O maior nível creditado de um jogo (0 = nenhum). */
export function nivelCreditado(
  jogo: MinigameId,
  creditados: ReadonlySet<string> = maestriasCreditadas(),
): NivelDeMaestria {
  let maior: NivelDeMaestria = 0;
  for (const id of creditados) {
    const m = creditoDeMaestria(id);
    if (m && m.jogo === jogo && m.nivel > maior) maior = m.nivel;
  }
  return maior;
}

/**
 * Os itens que um nível de maestria entrega (efeito, moldura, finalização, título). Até a Task
 * 3.3 o catálogo não tem itens de maestria, e a lista vem vazia.
 */
export function itensDaMaestria(_jogo: MinigameId, _nivel: NivelAlcancavel): ItemDaLoja[] {
  return [];
}

/** Pontos por jogo, para a antessala e o fim da rodada. */
export function pontosPorJogo(jogos: readonly MaestriaNoServidor[]): Map<MinigameId, number> {
  return new Map(jogos.map((j) => [j.jogo, j.pontos]));
}

/**
 * Lê a maestria, pede os créditos que faltam (um por nível alcançado) e atualiza o espelho.
 * Devolve os jogos, ou `null` sem a flag ou sem resposta. Crédito recusado fica para a próxima
 * sincronização — nada é marcado sem o servidor dizer que entrou.
 */
export async function sincronizarMaestria(): Promise<MaestriaNoServidor[] | null> {
  if (!recompensasV2Ligadas()) return null;
  const r = await lerMaestria();
  if (!r) return null;
  const creditados = new Set(r.creditados);
  let novos = 0;
  for (const creditoId of creditosDeMaestriaDevidos(r.jogos, creditados)) {
    const c = await creditarSeeds({ creditoId });
    if (!c) continue;
    creditados.add(creditoId);
    if (!c.jaExistia) novos += 1;
  }
  hidratarMaestria([...creditados]);
  if (novos && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('babel:metricas-mudaram'));
  return r.jogos;
}
