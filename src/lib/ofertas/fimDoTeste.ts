/**
 * O FIM DO TESTE DE 14 DIAS DO PREMIUM — o momento `fim_do_teste` (C6), em D-3 e em D0.
 *
 * A autoridade é `GET /api/me/entitlements`: o servidor manda `teste: { terminaEm }` só para quem
 * está no teste (o Premium pago vem com `null`). Nenhuma chamada nova — o host já recarrega os
 * entitlements, e esta conta é pura sobre o cache deles.
 *
 * O DIA É O DO CALENDÁRIO DA PESSOA (o do aparelho): "termina em 3 dias" é contado em dias de
 * calendário até o dia em que o teste acaba, não em blocos de 24 h — quem começou às 22 h leria
 * "termina hoje" na véspera. `Math.round` absorve o dia de 23 h ou 25 h do horário de verão.
 */
import { getEntitlements } from '../entitlements';

export type FaseDoFimDoTeste = 'd3' | 'd0';

const DIA_MS = 86_400_000;

const inicioDoDiaLocal = (ms: number): number => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Faltam 3 dias de calendário → `d3`; é o último dia → `d0`; qualquer outro dia (ou já acabou) → `null`. */
export function faseDoFimDoTeste(terminaEm: number, agora = Date.now()): FaseDoFimDoTeste | null {
  if (!Number.isFinite(terminaEm) || terminaEm <= agora) return null;
  const dias = Math.round((inicioDoDiaLocal(terminaEm) - inicioDoDiaLocal(agora)) / DIA_MS);
  if (dias === 3) return 'd3';
  if (dias === 0) return 'd0';
  return null;
}

/** A fase de agora, pelo cache dos entitlements; `null` para quem não está no teste. */
export function faseDoTesteAgora(agora = Date.now()): FaseDoFimDoTeste | null {
  const teste = getEntitlements().teste;
  return teste ? faseDoFimDoTeste(teste.terminaEm, agora) : null;
}
