/**
 * PAUSA DA NUVEM — desligar a nuvem POR UM TEMPO, e não pela sessão inteira (ADR 0007).
 *
 * Antes, um 402/5xx no Tradutor IA desligava a tradução por nuvem até recarregar a página: um soluço
 * de 5 s do provedor tirava de quem paga a melhor tradução pelo resto da sessão. Com a admissão de
 * IA no servidor, o 429 `nuvem_ocupada` passou a ser NORMAL no pico — e ele traz `Retry-After`.
 *
 * A regra agora:
 *   - 429, 402 e 503 da nuvem PAUSAM o adaptador pelo `Retry-After` (ou 60 s sem ele) e ele RELIGA
 *     sozinho. Durante a pausa ele se declara indisponível e a cadeia cai no motor local NA HORA,
 *     sem ida ao servidor;
 *   - um 5xx isolado NÃO pausa: só uma sequência (`FALHAS_PARA_PAUSAR`) — aí é o provedor, não a rede.
 */

/** Pausa sem `Retry-After`: o suficiente para o balde do minuto se refazer. */
export const PAUSA_PADRAO_MS = 60_000;

/** Teto da pausa: um `Retry-After` de horas (teto diário) não pode prender a sessão até amanhã sem reavaliar. */
export const PAUSA_MAXIMA_MS = 15 * 60_000;

/** 5xx SEGUIDOS que pausam. Um só é rede ruim. */
export const FALHAS_PARA_PAUSAR = 3;

/** Status que dizem "agora não" e pausam na hora. */
export const STATUS_QUE_PAUSAM: ReadonlySet<number> = new Set([402, 429, 503]);

/** O `Retry-After` em ms (segundos ou data HTTP), com teto; ausente ou ilegível → o padrão. */
export function esperaDoRetryAfter(valor: string | null | undefined, agora = Date.now()): number {
  const t = valor?.trim();
  let ms: number | null = null;
  if (t && /^\d+(\.\d+)?$/.test(t)) ms = Number(t) * 1000;
  else if (t) {
    const data = Date.parse(t);
    if (Number.isFinite(data)) ms = data - agora;
  }
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return PAUSA_PADRAO_MS;
  return Math.min(ms, PAUSA_MAXIMA_MS);
}

export class PausaDaNuvem {
  private ate = 0;
  private falhasSeguidas = 0;

  /** A nuvem está em pausa AGORA? */
  get pausada(): boolean {
    return Date.now() < this.ate;
  }

  pausar(ms: number): void {
    this.ate = Math.max(this.ate, Date.now() + ms);
  }

  /** Deu certo: zera a sequência de 5xx. */
  sucesso(): void {
    this.falhasSeguidas = 0;
  }

  /**
   * Registra uma resposta ruim e decide se pausa. Devolve `true` quando pausou.
   * `retryAfter` é o valor cru do cabeçalho.
   */
  falha(status: number, retryAfter?: string | null): boolean {
    if (STATUS_QUE_PAUSAM.has(status)) {
      this.falhasSeguidas = 0;
      this.pausar(esperaDoRetryAfter(retryAfter));
      return true;
    }
    if (status >= 500) {
      this.falhasSeguidas += 1;
      if (this.falhasSeguidas >= FALHAS_PARA_PAUSAR) {
        this.falhasSeguidas = 0;
        this.pausar(PAUSA_PADRAO_MS);
        return true;
      }
    }
    return false;
  }
}
