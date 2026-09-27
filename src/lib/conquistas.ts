/**
 * CONQUISTAS — o lado do cliente: montar o contexto, avaliar, CREDITAR uma vez e comemorar.
 *
 * O crédito das Seeds vai para o servidor (`creditarSeeds`, idempotente por `conquista-<id>`),
 * porque saldo é ganho − gasto e os dois lados vivem lá. A posse local (`conquistasPosse`) é o
 * que a Loja e os desbloqueios consultam; se o crédito falhar (rede), a conquista NÃO é marcada
 * e será tentada de novo na próxima avaliação — nunca "conquistada sem as Seeds".
 */
import {
  type AppMetrics,
  avaliarConquistas,
  type Conquista,
  CONQUISTAS,
  type ContextoDeConquistas,
  JOGOS_DA_MAESTRIA,
  progressoDasConquistas,
} from '@core';

import { creditarSeeds, type RecordeDoJogo } from '../data/api';
import { conquistasDesbloqueadas, marcarConquista, registrarDataDaConquista } from './conquistasPosse';
import { eventosVistos, todosOsEventos } from './eventosDeJogo';
import { possuidos } from './loja';
import { maestriasCreditadas, nivelCreditado } from './maestriaPosse';

/** Junta o que vem do servidor (métricas, recordes) com o que vive no navegador (coleção, posse). */
export function montarContextoDeConquistas(p: {
  metricas: AppMetrics;
  nivel: number;
  recordes: RecordeDoJogo[];
}): ContextoDeConquistas {
  const melhorComboPorJogo: Record<string, number> = {};
  for (const r of p.recordes) melhorComboPorJogo[r.exerciseKind] = r.melhorCombo ?? 0;
  /* A maestria do navegador é a que o SERVIDOR já creditou (`maestriaPosse`): a conquista nunca
     anda à frente do que a rota de crédito vai conferir. */
  const creditadas = maestriasCreditadas();
  const maestria: NonNullable<ContextoDeConquistas['maestria']> = {};
  for (const jogo of JOGOS_DA_MAESTRIA) {
    const n = nivelCreditado(jogo, creditadas);
    if (n > 0) maestria[jogo] = n;
  }
  return {
    metricas: p.metricas,
    nivel: p.nivel,
    melhorComboPorJogo,
    eventosVistos: eventosVistos().length,
    totalDeEventos: todosOsEventos().length,
    idiomas: p.metricas.idiomas ?? 0,
    compras: possuidos().size,
    maestria,
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

/**
 * QUANTAS CONQUISTAS JÁ FORAM FEITAS, de quantas — a conta da tela Desafios e da contagem da aba.
 *
 * A posse local manda junto com o progresso: uma conquista creditada continua "feita" mesmo se a
 * métrica cair depois (ex.: sequência de presença perdida). Um id na posse que não existe mais no
 * catálogo não conta — senão "feitas" poderia passar do total.
 */
export function contarConquistas(ctx: ContextoDeConquistas | null): { feitas: number; total: number } {
  const posse = conquistasDesbloqueadas();
  const atingidas = ctx
    ? new Set(
        progressoDasConquistas(ctx)
          .filter((p) => p.conquistada)
          .map((p) => p.conquista.id),
      )
    : new Set<string>();
  const feitas = CONQUISTAS.filter((c) => posse.has(c.id) || atingidas.has(c.id)).length;
  return { feitas, total: CONQUISTAS.length };
}
