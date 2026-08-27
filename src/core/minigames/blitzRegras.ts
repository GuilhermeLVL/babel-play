/**
 * REGRAS DO DUELO RELÂMPAGO — puras, testáveis em node.
 *
 * O jogo é contra o relógio, então o que se premia é VELOCIDADE e CONSTÂNCIA:
 *   - bônus de velocidade: pontos extras que caem linearmente com o tempo de resposta;
 *   - bônus de tempo: resposta rápida DEVOLVE segundos à barra (a rodada dura mais para quem
 *     está bem) — é o que transforma "60 s" em "quanto tempo você consegue sustentar";
 *   - fever: a partir de uma sequência longa, tudo vale o dobro;
 *   - marcos: pontos da sequência que merecem festa na tela inteira.
 *
 * Erro custa tempo. Não custa pontos (o que se ganhou, se ganhou), mas zera a sequência.
 */

/** Resposta em até este tempo é "relâmpago". */
export const RELAMPAGO_MS = 1_500;
/** Até aqui ainda ganha bônus de velocidade. */
export const LIMITE_BONUS_MS = 3_000;
/** Sequência a partir da qual entra o modo fever (tudo × 2). */
export const SEQUENCIA_FEVER = 8;
/** Sequências que ganham comemoração de tela inteira. */
export const MARCOS: readonly number[] = [5, 10, 15, 20, 30, 40, 50];
/** Segundos tirados por erro. */
export const PENALIDADE_ERRO_S = 2;

/** 0..10 pontos extras: 10 se instantâneo, 0 a partir de LIMITE_BONUS_MS. */
export function bonusDeVelocidade(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 10;
  if (ms >= LIMITE_BONUS_MS) return 0;
  return Math.round(10 * (1 - ms / LIMITE_BONUS_MS));
}

/** Segundos devolvidos à barra por um acerto: +2 relâmpago, +1 rápido, 0 pensado. */
export function bonusDeTempo(ms: number): number {
  if (ms <= RELAMPAGO_MS) return 2;
  if (ms <= LIMITE_BONUS_MS) return 1;
  return 0;
}

export function emFever(sequencia: number): boolean {
  return sequencia >= SEQUENCIA_FEVER;
}

export function ehMarco(sequencia: number): boolean {
  return MARCOS.includes(sequencia);
}

/**
 * Pontos de um acerto. `mult` é o multiplicador da sequência (core/minigames/grade); com dica o
 * multiplicador não vale (o combo é mérito) e o bônus de velocidade também não.
 */
export function pontosDoAcerto(ms: number, mult: number, sequencia: number, comDica: boolean): {
  total: number; base: number; velocidade: number; fever: boolean;
} {
  const base = 10 * (comDica ? 1 : mult);
  const velocidade = comDica ? 0 : bonusDeVelocidade(ms);
  const fever = !comDica && emFever(sequencia);
  const total = (base + velocidade) * (fever ? 2 : 1);
  return { total, base, velocidade, fever };
}

/** Rótulo do multiplicador para a tela — cresce com a sequência. */
export function rotuloDaSequencia(sequencia: number): string {
  if (sequencia >= SEQUENCIA_FEVER) return 'FEVER';
  if (sequencia >= 5) return 'em chamas';
  if (sequencia >= 3) return 'embalou';
  if (sequencia >= 2) return 'combo';
  return '';
}
