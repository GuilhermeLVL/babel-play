/**
 * LIMITADOR DE ATUALIZAÇÃO DA TELA DO PARCIAL VIVO (variante V4 de `parciais-incrementais`; só vale com a flag `parciais_vivos`).
 *
 * No máximo 1 atualização a cada `INTERVALO_DO_LIMITADOR_MS` (125 ms, ~8/s) por fala. O que chega dentro do intervalo é JUNTADO: fica só o último
 * valor, aplicado quando o intervalo vence (quem chama agenda o relógio com o `aguardarMs` devolvido). O FINAL nunca passa por aqui: ele escreve direto
 * e quem chama `cancelar()` para descartar o que estava segurado.
 *
 * PURO: sem React, sem DOM, sem timers; o relógio (`agora`, em ms) entra por parâmetro.
 */
export const INTERVALO_DO_LIMITADOR_MS = 125;

export type RespostaDoLimitador<T> =
  /** Aplique já. */
  | { tipo: 'aplicar'; valor: T }
  /** Segurado: chame `liberar` daqui a `aguardarMs`. Só vem na 1ª oferta de uma espera. */
  | { tipo: 'agendar'; aguardarMs: number }
  /** Segurado: juntou com o que já esperava (o agendamento existente vale). */
  | { tipo: 'juntou' };

export interface LimitadorDeParcial<T> {
  oferecer(valor: T, agora: number): RespostaDoLimitador<T>;
  /** O valor segurado (o último) quando o agendamento vence; `null` se nada espera. Conta como uma atualização aplicada em `agora`. */
  liberar(agora: number): T | null;
  /** Descarta o que espera (o final chegou, ou a fala acabou). */
  cancelar(): void;
}

export function criarLimitadorDeParcial<T>(intervaloMs: number = INTERVALO_DO_LIMITADOR_MS): LimitadorDeParcial<T> {
  let ultimoEm = -Infinity;
  let pendente: { valor: T } | null = null;
  return {
    oferecer(valor, agora) {
      const ja = agora - ultimoEm;
      if (!pendente && ja >= intervaloMs) {
        ultimoEm = agora;
        return { tipo: 'aplicar', valor };
      }
      const haviaEspera = pendente !== null;
      pendente = { valor };
      return haviaEspera ? { tipo: 'juntou' } : { tipo: 'agendar', aguardarMs: Math.max(0, intervaloMs - ja) };
    },
    liberar(agora) {
      if (!pendente) return null;
      const { valor } = pendente;
      pendente = null;
      ultimoEm = agora;
      return valor;
    },
    cancelar() {
      pendente = null;
    },
  };
}
