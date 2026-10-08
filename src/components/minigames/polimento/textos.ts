/**
 * OS TEXTOS E AS MINIATURAS DOS JOGOS, COMO NO PROTÓTIPO.
 *
 * `src/data/polimento/jogos-textos.json` foi EXTRAÍDO do protótipo rodando (um jogo por vez, lendo a
 * explicação e o palco da página), não redigitado: título, o que treina, os três passos, o texto de
 * cada nível, as ajudas com o preço, a instrução do palco e a marcação da miniatura
 * (`minis.js:11-30`, `jogos3.js`). Mexer num texto é mexer no desenho: confira com o protótipo.
 */
import type { MinigameId } from '@core';

import type { NivelDoJogo } from '../../../core/minigames/regras';
import dados from '../../../data/polimento/jogos-textos.json';

export interface AjudaNoTexto {
  nome: string;
  /** " · 2 por rodada" no Médio, ou vazio quando a ajuda não tem limite. */
  resto: string;
  txt: string | null;
  custo: string;
}

export interface TextosDoJogo {
  titulo: string;
  /** A frase da primeira tela e do alto do palco (pode ter marcação simples do protótipo). */
  instr: string;
  treina: string;
  passos: string[];
  /** `[nível, o que muda]`; vazio nos jogos sem níveis (Cadavre, Karaokê). */
  niveis: Array<[NivelDoJogo, string]>;
  ajudas: AjudaNoTexto[];
  paragrafos: string[];
  /** A marcação da cena pequena (`.px-mini`). É do protótipo, não vem de quem usa o app. */
  mini: string;
  rodada: string;
}

const TEXTOS = dados as unknown as Record<MinigameId, TextosDoJogo>;

export function textosDoJogo(jogo: MinigameId): TextosDoJogo | null {
  return TEXTOS[jogo] ?? null;
}

/** O jogo tem níveis no protótipo (`DIF`, `jogos4.js:30-46`): 16 dos 18. */
export function jogoTemNiveisNoDesenho(jogo: MinigameId): boolean {
  return (TEXTOS[jogo]?.niveis.length ?? 0) > 0;
}

/**
 * Quantas vezes a ajuda vale no nível (`ajudasDe`, `jogos4.js:69-78`): "+10 s" 3/2/1, "Ver resposta"
 * 2/1/1, as do próprio jogo uma a mais no Fácil e uma a menos no Difícil (nunca zero). `null`: sem limite.
 */
export function vezesDaAjuda(ajuda: AjudaNoTexto, nivel: NivelDoJogo): number | null {
  const noMedio = /(\d+) por rodada/.exec(ajuda.resto);
  if (!noMedio) return null;
  if (ajuda.nome === '+10 s') return { facil: 3, medio: 2, dificil: 1 }[nivel];
  if (ajuda.nome === 'Ver resposta') return { facil: 2, medio: 1, dificil: 1 }[nivel];
  return Math.max(1, Number(noMedio[1]) + { facil: 1, medio: 0, dificil: -1 }[nivel]);
}
