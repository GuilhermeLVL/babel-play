/**
 * A COTA PERTO DO FIM — o momento `cota_proxima` (≥ 80% de qualquer contador do mês).
 *
 * A autoridade é `GET /api/me/uso` (`lib/uso.ts`), a mesma rota da aba "Consumo do mês". Nenhuma
 * tela a chama fora de Planos, então o host pergunta por conta própria, com CACHE de 1 hora no
 * aparelho: o número muda devagar e a pergunta não pode virar tráfego a cada tela.
 *
 * Só com conta: o convidado e o self-host não têm contador a consultar (`/api/me/uso` sem conta cai
 * no servidor em memória, e no self-host não há teto).
 */
import { carregarUso, fracao, type UsoDoMes } from '../uso';

export const LIMIAR_DA_COTA = 0.8;
export const VALIDADE_DO_CACHE_DA_COTA_MS = 60 * 60_000;

const CHAVE = 'babel.ofertas.cota';

export type EstadoDaCota = 'perto' | 'esgotada' | null;

/** Puro: o contador MAIS cheio decide. Sem teto (`null`) não conta. */
export function estadoDaCota(uso: UsoDoMes | null): EstadoDaCota {
  if (!uso) return null;
  const fracoes = [uso.chamadas, uso.segundosDeAudio, uso.tokensDeLlm]
    .map((c) => (c ? fracao(c) : null))
    .filter((f): f is number => f !== null);
  if (!fracoes.length) return null;
  const maior = Math.max(...fracoes);
  if (maior >= 1) return 'esgotada';
  if (maior >= LIMIAR_DA_COTA) return 'perto';
  return null;
}

/** O estado da cota, do cache (1 h) ou da rede. Falha de rede = `null` (não se avisa no escuro). */
export async function verificarCota(agora = Date.now()): Promise<EstadoDaCota> {
  try {
    const b = localStorage.getItem(CHAVE);
    if (b) {
      const c = JSON.parse(b) as { em?: number; estado?: EstadoDaCota };
      if (typeof c.em === 'number' && agora - c.em < VALIDADE_DO_CACHE_DA_COTA_MS) return c.estado ?? null;
    }
  } catch {
    /* sem cache */
  }
  const uso = await carregarUso();
  if (!uso) return null;
  const estado = estadoDaCota(uso);
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ em: agora, estado }));
  } catch {
    /* idem */
  }
  return estado;
}
