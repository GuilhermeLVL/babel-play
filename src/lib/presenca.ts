/**
 * PRESENÇA DIÁRIA — abrir o app conta, uma vez por dia.
 *
 * O servidor é quem guarda (idempotente por dia); o localStorage aqui é só um ATALHO para não
 * bater na API a cada render. Se o atalho estiver errado (outro navegador, limpeza), a API
 * responde `jaExistia` e nada é creditado duas vezes.
 */
import { registrarPresenca } from '../data/api';
import { diaLocal, PESOS_SEEDS } from '@core';

const CHAVE = 'babel.presenca_dia';

export interface ResultadoDaPresenca {
  creditou: boolean;
  seeds: number;
  streak: number;
}

export async function registrarPresencaHoje(agora = Date.now()): Promise<ResultadoDaPresenca | null> {
  const hoje = diaLocal(agora);
  try { if (Number(localStorage.getItem(CHAVE)) === hoje) return null; } catch { /* sem storage */ }
  const r = await registrarPresenca(hoje);
  if (!r) return null;
  try { localStorage.setItem(CHAVE, String(hoje)); } catch { /* sem storage */ }
  return { creditou: !r.jaExistia, seeds: PESOS_SEEDS.presenca, streak: r.streakPresenca };
}
