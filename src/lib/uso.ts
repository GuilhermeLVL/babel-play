/**
 * CONSUMO DO MÊS — quanto do plano já foi usado.
 *
 * POR QUE ISTO EXISTE. Os contadores do servidor existiam e ninguém via: a única coisa que a
 * interface mostrava era armazenamento. Um assinante descobria o teto ao ser recusado no meio de
 * uma conversa — a pior hora possível para uma surpresa.
 *
 * Espelha `src/lib/entitlements.ts`: a autoridade é o servidor (`GET /api/me/uso`), o cliente só
 * lê e pinta. Sem cache síncrono, porque nenhuma tela depende deste número para renderizar — quem
 * o mostra pode mostrar "carregando".
 */
import { apiFetch } from '../data/api';
import type { Plan } from './entitlements';

/** Um contador: quanto foi usado e qual o teto. `teto: null` = SEM teto (não "desconhecido"). */
export interface Contador {
  usado: number;
  teto: number | null;
}

export interface UsoDoMes {
  plano: Plan;
  /** Janela 'YYYY-MM'. Os contadores zeram na virada do mês. */
  janela: string;
  /** Chamadas à IA gerenciada — STT, tradução e tutor DIVIDEM este teto. */
  chamadas: Contador;
  /** Segundos de áudio faturáveis no STT de nuvem. É o teto que controla gasto de verdade. */
  segundosDeAudio: Contador;
  /** Tokens do LLM. Contabilidade, não teto: só se conhecem depois da resposta. */
  tokensDeLlm: Contador;
}

/** Busca o consumo. Devolve `null` quando a rota não responde — a tela mostra isso, não zera. */
export async function carregarUso(): Promise<UsoDoMes | null> {
  try {
    const r = await apiFetch('/api/me/uso');
    if (!r.ok) return null;
    return (await r.json()) as UsoDoMes;
  } catch {
    return null;
  }
}

/**
 * Fração usada, de 0 a 1. `null` quando não há teto — e quem consome DEVE tratar esse caso, em vez
 * de desenhar uma barra vazia que pareceria "0% usado" quando na verdade é "ilimitado".
 */
export function fracao(c: Contador): number | null {
  if (c.teto === null || c.teto <= 0) return null;
  return Math.min(1, c.usado / c.teto);
}

/** Segundos → "3 h 20 min" / "12 min" / "45 s". Número cru de segundos não diz nada a ninguém. */
export function duracaoLegivel(segundos: number): string {
  if (segundos < 60) return `${Math.round(segundos)} s`;
  const min = Math.round(segundos / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const restoMin = min % 60;
  return restoMin ? `${h} h ${restoMin} min` : `${h} h`;
}
