/**
 * PRESENÇA DIÁRIA — só estatística desde as recompensas v2 (27/09).
 *
 * Abrir o app deixou de render Seeds, XP ou ofensiva: o Decreto 12.880/2026, art. 9º, trata prêmio
 * por tempo de uso e por abrir o app como incentivo compulsivo. O registro continua (o servidor
 * guarda o dia, idempotente) porque "dias em que abriu" é um dado honesto de estatística — ele
 * só não paga nada. O localStorage aqui é um ATALHO para não bater na API a cada render.
 */
import { diaLocal } from '@core';

import { registrarPresenca } from '../data/api';

const CHAVE = 'babel.presenca_dia';

/** Registra o dia uma vez. Devolve `true` quando gravou um dia novo; nunca credita nada. */
export async function registrarPresencaHoje(agora = Date.now()): Promise<boolean> {
  const hoje = diaLocal(agora);
  try { if (Number(localStorage.getItem(CHAVE)) === hoje) return false; } catch { /* sem storage */ }
  const r = await registrarPresenca(hoje);
  if (!r) return false;
  try { localStorage.setItem(CHAVE, String(hoje)); } catch { /* sem storage */ }
  return !r.jaExistia;
}
