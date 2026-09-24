import type { MinigameId } from '@core';

import { PENALIDADE_ERRO_S, SEQUENCIA_FEVER } from '../../../core/minigames/blitzRegras';

/**
 * A REGRA DA RODADA EM UMA LINHA — o que a antessala mostra embaixo de "Treina" (`regra` no
 * `T.antessala` do protótipo aprovado).
 *
 * Só entra aqui o que o jogo FAZ de verdade, conferido no componente de cada um: o relógio do
 * Duelo vem da mesma constante que ele usa, o "Espiar ×2" é o limite da Memória, a escada do Termo
 * é a de `core/minigames/termo`. Jogo sem regra conferida cai em "Rodada curta", que é verdade para
 * todos — melhor genérico do que uma regra inventada.
 */
const REGRA: Partial<Record<MinigameId, string>> = {
  memory: 'Sem relógio · Espiar ×2',
  termo: 'Escada Termo → Dueto → Quarteto · letra de dica',
  wordsearch: 'Sem relógio · radar, dica e revelar',
  blitz: `Contra o relógio · erro tira ${PENALIDADE_ERRO_S} s · FEVER ×2 com ${SEQUENCIA_FEVER} seguidas`,
  escuta: 'Sem relógio · ouça quantas vezes quiser',
  ditado: 'Sem relógio · ouça e escreva o que ouviu',
  karaoke: 'Sem relógio · ouça e repita a fala',
  scramble: 'Sem relógio · toque nas palavras na ordem',
};

/** O nome do que a rodada conta: "palavras", "falas" (os de áudio), "frases" (os de montar frase). */
export function unidadeDaRodada(jogo: MinigameId | string): string {
  if (jogo === 'escuta' || jogo === 'ditado' || jogo === 'karaoke') return 'falas';
  if (jogo === 'scramble' || jogo === 'conectores') return 'frases';
  return 'palavras';
}

/** A regra do jogo, seguida da regra do combo, que é a mesma para todos (`multiplicador`). */
export function regraDaRodada(jogo: MinigameId | string | undefined): string {
  const r = (jogo && REGRA[jogo as MinigameId]) || 'Rodada curta';
  return `${r} · ×2 com 3 seguidas, ×3 com 6`;
}
