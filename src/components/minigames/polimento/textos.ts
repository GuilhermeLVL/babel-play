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

/** A ordem dos jogos (`ORDEM_JOGOS`, `jogos.js:116`): é ela que decide o "Próximo jogo" da tela de fim. */
export const ORDEM_DOS_JOGOS: readonly MinigameId[] = [
  'memory',
  'wordsearch',
  'termo',
  'scramble',
  'blitz',
  'karuta',
  'choseong',
  'tenis',
  'koffer',
  'bao',
  'vitendawili',
  'shiritori',
  'cadavre',
  'taboo',
  'karaoke',
  'escuta',
  'ditado',
  'conectores',
];

/** O nome curto de cada jogo (`curto` em cada `JOGOS[id]`; `jogos.js:309` para a Memória). */
const CURTO: Record<MinigameId, string> = {
  memory: 'Memória',
  wordsearch: 'Caça-palavras',
  termo: 'Termo',
  scramble: 'Frase embaralhada',
  blitz: 'Duelo relâmpago',
  karuta: 'Karuta',
  choseong: 'Choseong',
  tenis: 'Rali',
  koffer: 'Mala',
  bao: 'Bao',
  vitendawili: 'Vitendawili',
  shiritori: 'Shiritori',
  cadavre: 'Cadavre exquis',
  taboo: 'Tabu',
  karaoke: 'Karaokê',
  escuta: 'Qual foi a fala?',
  ditado: 'Ditado',
  conectores: 'Caça-conectores',
};

export const nomeCurtoDoJogo = (jogo: MinigameId): string => CURTO[jogo] ?? jogo;

/**
 * Os jogos que vêm depois deste, na ordem do protótipo e dando a volta (`jogos.js:308`). A tela de fim
 * oferece o primeiro que a pessoa pode jogar agora: no app um jogo pode estar sem material.
 */
export function jogosSeguintes(jogo: MinigameId): MinigameId[] {
  const i = ORDEM_DOS_JOGOS.indexOf(jogo);
  return ORDEM_DOS_JOGOS.map((_, k) => ORDEM_DOS_JOGOS[(i + 1 + k) % ORDEM_DOS_JOGOS.length]).filter((j) => j !== jogo);
}

/** O que o placar conta em cada jogo (`unidade` em cada `JOGOS[id]`): "3 de 8 bolas", "2 de 6 pares". */
const UNIDADE: Record<MinigameId, string> = {
  memory: 'pares',
  wordsearch: 'palavras',
  termo: 'palavras',
  scramble: 'frases',
  blitz: 'palavras',
  karuta: 'cartas',
  choseong: 'palavras',
  tenis: 'bolas',
  koffer: 'níveis',
  bao: 'palavras',
  vitendawili: 'enigmas',
  shiritori: 'elos',
  cadavre: 'palavras',
  taboo: 'cartas',
  karaoke: 'falas',
  escuta: 'falas',
  ditado: 'falas',
  conectores: 'frases',
};

export const unidadeDoPlacar = (jogo: MinigameId): string => UNIDADE[jogo] ?? 'palavras';

/** A unidade da rodada como o protótipo a chama ("Rodada · 8 bolas"): bolas, cartas, pares, elos… */
export function unidadeNoDesenho(jogo: MinigameId, reserva: string): string {
  return /^Rodada · \d+ (.+)$/.exec(TEXTOS[jogo]?.rodada ?? '')?.[1] ?? reserva;
}
