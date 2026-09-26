/**
 * O CANAL DAS OFERTAS — quem percebe um MOMENTO avisa por aqui; quem decide e desenha é o
 * `HostDeOfertas`, que escuta.
 *
 *   window.dispatchEvent(new CustomEvent('babel:oferta', { detail: { momento, contexto } }))
 *
 * É o contrato combinado com a Fase 7 (modo convidado), que dispara `convidado_para_conta` sem
 * importar nada daqui. `dispararOferta` é o mesmo evento com o tipo conferido.
 *
 * `contexto` é livre e NUNCA sai do aparelho: serve para o host (ex.: `{ origem: 'captura' }`), não
 * para a métrica.
 */
import { type MomentoDeOferta, MOMENTOS_DE_OFERTA } from '../../core/ofertas';

export const EVENTO_OFERTA = 'babel:oferta';

export interface DetalheDaOferta {
  momento: MomentoDeOferta;
  contexto?: Record<string, unknown>;
}

export function ehMomento(v: unknown): v is MomentoDeOferta {
  return typeof v === 'string' && (MOMENTOS_DE_OFERTA as readonly string[]).includes(v);
}

export function dispararOferta(momento: MomentoDeOferta, contexto?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DetalheDaOferta>(EVENTO_OFERTA, { detail: { momento, contexto } }));
}

/**
 * Uma recusa da nuvem vira momento de oferta? Só as que falam de PLANO:
 *   - 402 `code: 'quota_exceeded'` → `fim_de_cota` (a cota do mês acabou);
 *   - 402 com `entitlement` ou `code: 'plano_insuficiente'` (o recurso é de plano pago: STT/LLM
 *     gerenciado) → `modelo_premium`;
 *   - `reason: 'managed_requires_plan' | 'managed_requires_pro'` (o tutor responde 200 com isso)
 *     → `modelo_premium`.
 * 429 (fila, rate limit), 503 (portão, orçamento global) e 5xx não são assunto de plano: `null`.
 */
export function momentoDaRecusa(status: number, corpo: unknown): MomentoDeOferta | null {
  if (!corpo || typeof corpo !== 'object') return null;
  const c = corpo as { code?: unknown; entitlement?: unknown; reason?: unknown };
  if (c.reason === 'managed_requires_plan' || c.reason === 'managed_requires_pro') return 'modelo_premium';
  if (status !== 402) return null;
  if (c.code === 'quota_exceeded') return 'fim_de_cota';
  if (typeof c.entitlement === 'string' || c.code === 'plano_insuficiente') return 'modelo_premium';
  return null;
}

/**
 * Para os adaptadores de nuvem: lê o corpo de um 402 SEM consumir a resposta de quem chamou (usa
 * `clone()`), e dispara o momento se couber. Nunca lança: é um efeito colateral de observação.
 */
export async function sinalizarRecusaDaNuvem(res: Response, origem: string): Promise<void> {
  try {
    if (res.status !== 402) return; // só o 402 fala de plano no corpo de um adaptador
    const copia = typeof res.clone === 'function' ? res.clone() : null;
    const corpo: unknown = copia ? await copia.json().catch(() => null) : null;
    const momento = momentoDaRecusa(res.status, corpo);
    if (momento) dispararOferta(momento, { origem });
  } catch {
    /* observação: nunca derruba quem chamou */
  }
}

/** Mesmo que `sinalizarRecusaDaNuvem`, para quem já leu o corpo (texto cru ou objeto). */
export function sinalizarRecusaLida(status: number, corpo: unknown, origem: string): void {
  let obj = corpo;
  if (typeof corpo === 'string') {
    try {
      obj = JSON.parse(corpo);
    } catch {
      return;
    }
  }
  const momento = momentoDaRecusa(status, obj);
  if (momento) dispararOferta(momento, { origem });
}
