/**
 * A META DO DIA E O AVISO DE MISSÃO — o lado do cliente das missões diárias (recompensas v2, onda 5).
 *
 * A meta do dia é "as três missões fechadas" (`src/core/missoes.ts`). Quem conta o progresso é o
 * servidor (`GET /api/metrics/missoes`); o cliente só PEDE o crédito `meta:<dia>` quando o estado
 * que o servidor devolveu diz que a meta fechou e ainda não foi creditada. Quem decide o valor e
 * confere a condição de novo é a rota de crédito.
 *
 * O AVISO "missão quase completa": falta uma missão só. No máximo uma vez por dia, nunca entre 22h e
 * 8h (a mesma janela de silêncio do aviso de ofensiva) e nunca para o perfil protegido.
 */
import { diaLocal, type EstadoDasMissoes, missaoQuaseCompleta } from '@core';

import { creditarSeeds } from '../data/api';
import { HORA_DO_FIM_DO_SILENCIO, HORA_DO_SILENCIO } from './ofensiva';

const CHAVE_AVISO = 'babel.missao_avisada';

/**
 * Pede o crédito da meta do dia se o servidor diz que ela fechou e ainda não foi creditada.
 * Devolve a recompensa quando o servidor creditou AGORA (não num reenvio), ou `null`.
 */
export async function reivindicarMetaDoDia(estado: EstadoDasMissoes | null): Promise<{ seeds: number; xp: number } | null> {
  if (!estado?.metaConcluida || estado.metaCreditada) return null;
  const r = await creditarSeeds({ creditoId: `meta:${estado.dia}` });
  if (!r || r.jaExistia) return null;
  return { ...estado.recompensa };
}

function avisadoHoje(agora: Date): boolean {
  try {
    return localStorage.getItem(CHAVE_AVISO) === String(diaLocal(agora.getTime()));
  } catch {
    return false;
  }
}

/** Pode sair o aviso "missão quase completa" agora? */
export function podeAvisarMissao(
  estado: { missoes: EstadoDasMissoes['missoes'] | null | undefined; protegido: boolean },
  agora = new Date(),
): boolean {
  if (estado.protegido || !estado.missoes || !missaoQuaseCompleta(estado.missoes)) return false;
  const h = agora.getHours();
  if (h >= HORA_DO_SILENCIO || h < HORA_DO_FIM_DO_SILENCIO) return false;
  return !avisadoHoje(agora);
}

export function registrarAvisoDeMissao(agora = new Date()): void {
  try {
    localStorage.setItem(CHAVE_AVISO, String(diaLocal(agora.getTime())));
  } catch {
    /* sem storage: o pior caso é um aviso a mais no dia */
  }
}
