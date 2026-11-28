/**
 * O cliente da SELEÇÃO EM MASSA (`POST /api/vocab/lote`, openspec `cartoes` 6.2b; flag `estudo_palavras_v2`). A posse dos ids
 * é conferida no servidor: se um deles não é da conta, nada muda (404). Pedimos em fatias de 50, o teto do servidor.
 */
import { type AcaoEmLote, idsDoLote, LIMITE_DO_LOTE } from '../../core/palavras/lote';
import { apiFetch } from '../funil';

export type ResultadoDoLote = { ok: true; alterados: number } | { ok: false; motivo: 'nao-encontrado' | 'invalido' | 'erro' };

/** Aplica a ação a todos os ids, 50 por vez. Para na primeira fatia que falhar e diz por quê. */
export async function aplicarEmLote(ids: readonly string[], acao: AcaoEmLote): Promise<ResultadoDoLote> {
  const unicos = idsDoLote(ids);
  let alterados = 0;
  for (let i = 0; i < unicos.length; i += LIMITE_DO_LOTE) {
    const res = await apiFetch('/api/vocab/lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...acao, ids: unicos.slice(i, i + LIMITE_DO_LOTE) }),
    });
    if (res.status === 404) return { ok: false, motivo: 'nao-encontrado' };
    if (res.status === 400) return { ok: false, motivo: 'invalido' };
    if (!res.ok) return { ok: false, motivo: 'erro' };
    alterados += ((await res.json()) as { alterados: number }).alterados;
  }
  return { ok: true, alterados };
}
