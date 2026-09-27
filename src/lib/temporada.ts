/**
 * TEMPORADA NO CLIENTE (recompensas v2, onda 5): ler a temporada do servidor, pedir as casas que
 * faltam e guardar o espelho local das casas creditadas.
 *
 * O SERVIDOR DECIDE. `GET /api/metrics/temporada` soma o XP da janela e diz se a conta é
 * assinante; cada `temporada:<id>:<nível>:<trilha>` que falta é pedido pela rota de crédito, que
 * confere tudo de novo. O espelho (`babel.temporada_creditada`) só guarda o que o servidor
 * confirmou — é o que `estadoDoItem` consulta para abrir os itens de temporada sem ir à rede.
 *
 * Os pedidos de crédito ficam atrás da flag `recompensas_v2`, como os da maestria; a leitura não.
 */
import { creditosDaTemporadaDevidos, lerCreditoDaTemporada, recompensaDaTrilha } from '@core';
import { useEffect, useState } from 'react';

import { creditarSeeds, lerTemporada, type TemporadaNoServidor } from '../data/api';
import { recompensasV2Ligadas } from './recompensasV2';
import { hidratarTemporada } from './temporadaPosse';

/**
 * Lê a temporada, pede as casas devidas (grátis até o nível; de assinante só para assinante) e
 * atualiza o espelho. Devolve o estado lido, com `creditados` já atualizado, e quantas Seeds as
 * casas novas renderam. `null` sem resposta do servidor.
 */
export async function sincronizarTemporada(): Promise<{ estado: TemporadaNoServidor; seedsNovas: number } | null> {
  const r = await lerTemporada();
  if (!r) return null;
  const creditados = new Set(r.creditados);
  let seedsNovas = 0;
  let novos = 0;
  if (r.temporada && recompensasV2Ligadas()) {
    for (const creditoId of creditosDaTemporadaDevidos(r.temporada, r.nivel, r.assinante, creditados)) {
      const c = await creditarSeeds({ creditoId });
      if (!c) continue; // recusado ou sem rede: fica para a próxima visita
      creditados.add(creditoId);
      if (c.jaExistia) continue;
      novos += 1;
      const casa = lerCreditoDaTemporada(creditoId);
      const recompensa = casa && recompensaDaTrilha(casa.nivel, casa.trilha, casa.temporada.id);
      if (recompensa && 'seeds' in recompensa) seedsNovas += recompensa.seeds;
    }
  }
  hidratarTemporada([...creditados]);
  if (novos && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('babel:metricas-mudaram'));
  return { estado: { ...r, creditados: [...creditados].sort() }, seedsNovas };
}

/**
 * A temporada para as telas: sincroniza ao montar e devolve o estado (`undefined` enquanto carrega,
 * `null` sem resposta). `aoCreditar` recebe as Seeds das casas novas, para a tela avisar.
 */
export function useTemporada(aoCreditar?: (seeds: number) => void): TemporadaNoServidor | null | undefined {
  const [estado, setEstado] = useState<TemporadaNoServidor | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    void sincronizarTemporada().then((r) => {
      if (!vivo) return;
      setEstado(r?.estado ?? null);
      if (r && r.seedsNovas > 0) aoCreditar?.(r.seedsNovas);
    });
    return () => {
      vivo = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- sincroniza uma vez por montagem; o aviso é de quem chamou
  return estado;
}
