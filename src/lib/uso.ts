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
import type { NivelDaNuvem } from '../core/planos';
import { apiFetch } from '../data/api';
import type { Plan } from './entitlements';

/** Um contador: quanto foi usado e qual o teto. `teto: null` = SEM teto (não "desconhecido"). */
export interface Contador {
  usado: number;
  teto: number | null;
}

/** O contador de um nível da nuvem, com o que RESTA do mês já calculado pelo servidor (`null` = sem teto). */
export interface ContadorDoNivel extends Contador {
  restante: number | null;
}

export interface UsoDoMes {
  plano: Plan;
  /** Janela 'YYYY-MM'. Os contadores zeram na virada do mês. */
  janela: string;
  /** Chamadas à IA gerenciada — STT, tradução e tutor DIVIDEM este teto. */
  chamadas: Contador;
  /** Segundos de áudio faturáveis no STT de nuvem. É o teto que controla gasto de verdade. */
  segundosDeAudio: Contador;
  /**
   * O MÊS POR NÍVEL DE SERVIÇO (planos v3): a nuvem por trechos (o mesmo número de `segundosDeAudio`) e
   * a nuvem ao vivo, cada uma com o seu contador — as horas se somam. Ausente em servidor anterior;
   * quem lê usa `restanteDoNivel`.
   */
  porNivel?: Record<NivelDaNuvem, ContadorDoNivel>;
  /** Tokens do LLM (tradução e tutor). Teto desde a Fase 2 do lançamento: reservados antes, acertados depois. */
  tokensDeLlm: Contador;
  /** Portão global da nuvem (chave de emergência e orçamento do mês). Ausente em servidor antigo. */
  iaDeNuvem?: { disponivel: boolean; motivo: string | null; mensagem: string | null };
  /**
   * A NUVEM DE ALÍVIO do Grátis (A10): o que resta, em segundos de transcrição (o menor entre os
   * segundos e o dólar que sobram da franquia), e se ela pode ser usada agora. `null` fora do Grátis;
   * ausente em servidor antigo.
   */
  alivio?: AlivioDoMes | null;
  /**
   * O USO JUSTO DO DIA (matriz v2): o dia LOCAL da conta, com os contadores e os tetos do dia. `null`
   * para plano sem teto no dia (Grátis, self-host) — ali nada é contado por dia; ausente em servidor
   * anterior. A tela que o mostra é o C7.
   */
  hoje?: UsoDeHoje | null;
}

export interface UsoDeHoje {
  /** `AAAA-MM-DD` no fuso da conta; zera na virada do dia de lá. */
  janela: string;
  fuso: string;
  segundosDeAudio: Contador;
  tokensDeLlm: Contador;
}

export interface AlivioDoMes {
  disponivel: boolean;
  /** Por que não (`alivio_desligado`, `alivio_exige_responsavel`, `pool_de_alivio_esgotado`, `quota_exceeded`). */
  motivo: string | null;
  restanteSegundos: number;
  segundosDeAudio: Contador;
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
 * QUANTOS SEGUNDOS RESTAM NO MÊS num nível da nuvem — o que o medidor mostra e o que a política de
 * rota recebe. `null` = sem teto (self-host): ilimitado NÃO é zero. Sem resposta do servidor não há o
 * que prometer (0). Diante de um servidor anterior (sem `porNivel`), os trechos saem do contador de
 * sempre e o ao vivo não existe.
 */
export function restanteDoNivel(uso: UsoDoMes | null, nivel: NivelDaNuvem): number | null {
  if (!uso) return 0;
  const doServidor = uso.porNivel?.[nivel];
  if (doServidor) return doServidor.restante === null ? null : Math.max(0, doServidor.restante);
  if (nivel !== 'trechos') return 0;
  const { usado, teto } = uso.segundosDeAudio;
  return teto === null ? null : Math.max(0, teto - usado);
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
