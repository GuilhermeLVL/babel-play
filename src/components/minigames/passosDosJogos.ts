import type { MinigameId } from '@core';

/**
 * A PRIMEIRA PARTIDA DE CADA JOGO: a casca da rodada abre a explicação em três telas
 * (`polimento/ExplicacaoDoJogo.tsx`) uma vez por jogo, e guarda aqui que já mostrou.
 */
const CHAVE = (jogo: string) => `babel_tour_${jogo}`;

/** Já viu a explicação deste jogo? */
export function jaFezTour(jogo: MinigameId): boolean {
  try {
    return localStorage.getItem(CHAVE(jogo)) === '1';
  } catch {
    return false;
  }
}

export function marcarTourFeito(jogo: MinigameId): void {
  try {
    localStorage.setItem(CHAVE(jogo), '1');
  } catch {
    /* storage bloqueado: mostra de novo */
  }
}
