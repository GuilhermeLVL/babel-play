/**
 * CONQUISTAS — o lado do cliente: montar o contexto, avaliar, CREDITAR uma vez e comemorar.
 *
 * O crédito das Seeds vai para o servidor (`creditarSeeds`, idempotente por `conquista-<id>`),
 * porque saldo é ganho − gasto e os dois lados vivem lá. A posse local (`conquistasPosse`) é o
 * que a Loja e os desbloqueios consultam; se o crédito falhar (rede), a conquista NÃO é marcada
 * e será tentada de novo na próxima avaliação — nunca "conquistada sem as Seeds".
 */
import { type AppMetrics, avaliarConquistas, type Conquista, type ContextoDeConquistas } from '@core';

import { creditarSeeds, type RecordeDoJogo } from '../data/api';
import { conquistasDesbloqueadas, marcarConquista, registrarDataDaConquista } from './conquistasPosse';
import { eventosVistos, todosOsEventos } from './eventosDeJogo';
import { possuidos } from './loja';

/** Junta o que vem do servidor (métricas, recordes) com o que vive no navegador (coleção, posse). */
export function montarContextoDeConquistas(p: {
  metricas: AppMetrics;
  nivel: number;
  recordes: RecordeDoJogo[];
}): ContextoDeConquistas {
  const melhorComboPorJogo: Record<string, number> = {};
  for (const r of p.recordes) melhorComboPorJogo[r.exerciseKind] = r.melhorCombo ?? 0;
  return {
    metricas: p.metricas,
    nivel: p.nivel,
    melhorComboPorJogo,
    eventosVistos: eventosVistos().length,
    totalDeEventos: todosOsEventos().length,
    idiomas: p.metricas.idiomas ?? 0,
    compras: possuidos().size,
  };
}

/** Evento para quem quer reagir (App recarrega métricas; telas comemoram). */
export const EVENTO_CONQUISTA = 'babel:conquista';

export async function verificarConquistas(ctx: ContextoDeConquistas): Promise<Conquista[]> {
  const novas = avaliarConquistas(ctx, conquistasDesbloqueadas());
  const feitas: Conquista[] = [];
  for (const c of novas) {
    const r = await creditarSeeds({ creditoId: `conquista-${c.id}` });
    if (!r) continue; // sem rede: fica para a próxima avaliação
    marcarConquista(c.id);
    registrarDataDaConquista(c.id);
    feitas.push(c);
  }
  if (feitas.length && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENTO_CONQUISTA, { detail: { ids: feitas.map((c) => c.id) } }));
  }
  return feitas;
}
