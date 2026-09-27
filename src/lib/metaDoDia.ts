/**
 * A META DO DIA — o pedido do crédito `meta:<AAAA-MM-DD>` (recompensas v2).
 *
 * O cliente só PEDE quando a conta dele já diz que a meta foi cumprida: os acertos de hoje (no
 * fuso de quem joga) saem de `acertosRecentes`, os mesmos carimbos que o servidor usa para
 * conferir. Quem decide o valor e a condição é o servidor (`valorDoCredito` + a conferência na
 * rota); o localStorage é só um atalho para não pedir de novo o que já foi creditado hoje.
 */
import { acertosNoDia, diaNoFuso, fusoDoAmbiente, metaDoDiaCumprida, PESOS_SEEDS } from '@core';

import type { AppMetrics } from '../data/api';
import { creditarSeeds } from '../data/api';

const CHAVE = 'babel.meta_dia';

/** Os acertos de hoje, no fuso do navegador. */
export function acertosDeHoje(m: Pick<AppMetrics, 'acertosRecentes'> | null, agora = Date.now()): number {
  if (!m?.acertosRecentes?.length) return 0;
  const fuso = fusoDoAmbiente();
  return acertosNoDia(m.acertosRecentes, diaNoFuso(agora, fuso), fuso);
}

/**
 * Pede o crédito da meta de hoje se ela foi cumprida e ainda não foi pedida. Devolve as Seeds
 * quando o servidor creditou AGORA (não num reenvio), ou `null`.
 */
export async function reivindicarMetaDoDia(m: AppMetrics | null, agora = Date.now()): Promise<{ seeds: number } | null> {
  if (!m) return null;
  const dia = diaNoFuso(agora, fusoDoAmbiente());
  try { if (localStorage.getItem(CHAVE) === dia) return null; } catch { /* sem storage */ }
  if (!metaDoDiaCumprida(acertosDeHoje(m, agora))) return null;
  const r = await creditarSeeds({ creditoId: `meta:${dia}` });
  if (!r) return null;
  try { localStorage.setItem(CHAVE, dia); } catch { /* sem storage */ }
  return r.jaExistia ? null : { seeds: PESOS_SEEDS.metaDiaria };
}
