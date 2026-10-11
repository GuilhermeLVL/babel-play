/**
 * QUANTOS JOGOS SERVEM PARA UMA FONTE — porte de `fxServe()` e `fxQuantosServem()` de
 * `fontes.js:96-107`, sobre as contagens (palavras e frases) que a rota do catálogo devolve.
 *
 * A regra de cada jogo NÃO é copiada: sai de `MINIGAMES` (`core/minigames/types.ts`), a mesma tabela
 * que `estadoDosJogos.ts` lê (o `FX_REGRA` do protótipo é uma cópia dela, `fontes.js:61-66`):
 *   · `modalidade: 'palavra'`  vive de palavras: precisa de `minItems` palavras;
 *   · frase ou frase com áudio vive de frases: precisa de `minItems` frases;
 *   · `aceitaPalavraFalada`    na falta de frases, aceita `minItems` palavras faladas.
 * `estadoDoJogo` continua sendo a verdade na hora de abrir o jogo (ela vê os cartões: alfabeto, voz,
 * áudio da gravação); esta é a conta do catálogo, feita só com dois números.
 *
 * DUAS DIFERENÇAS DO PROTÓTIPO, para o catálogo não prometer o que a grade do Jogar não cumpre
 * (`estadoDoJogo`, `core/minigames/estadoDosJogos.ts`):
 *   · a PALAVRA FALADA no lugar da frase só existe na Trilha (`trilha`): nas outras fontes o jogo de ouvir
 *     não abre só com palavras;
 *   · o jogo de ouvir (`frase-audio`) toca o ÁUDIO DE UMA GRAVAÇÃO: uma fonte sem gravação (`semGravacao`:
 *     um baralho do Anki, as Difíceis) não o abre, tenha as frases que tiver.
 * O catálogo só mostra a CONTA ("N de 18 jogos") para o conteúdo em uso no Jogar, com os números da própria
 * grade; aqui fica o que marca "não serve" quando um jogo pede o catálogo.
 */
import { type MinigameId, MINIGAMES } from '../../core/minigames/types';

export interface MaterialDaFonte {
  palavras: number;
  frases: number;
}

export type ServeOuNao =
  | { ok: true; disponiveis: number; de: 'palavras' | 'frases'; comPalavrasFaladas?: boolean }
  | { ok: false; pede: 'palavras' | 'frases' | 'frases-ou-palavras' | 'rede' | 'gravacao'; minimo: number; ha: number };

/** A ordem do catálogo de jogos: a da tabela. */
export const TODOS_OS_JOGOS = Object.keys(MINIGAMES) as MinigameId[];

/** `fxServe()` de `fontes.js:97-106`. Só o Karaokê precisa de rede (`FX_REGRA.karaoke`, `fontes.js:65`). */
export interface ContextoDaFonte {
  semRede?: boolean;
  /** A fonte é a Trilha do app: na falta de frases, o jogo de ouvir aceita a palavra falada. */
  trilha?: boolean;
  /** A fonte não tem gravação (baralho do Anki, Difíceis): o jogo de ouvir não tem o que tocar. */
  semGravacao?: boolean;
}

export function jogoServe(id: MinigameId, m: MaterialDaFonte, o: ContextoDaFonte = {}): ServeOuNao {
  const def = MINIGAMES[id];
  const min = def.minItems;
  if (o.semRede && id === 'karaoke') return { ok: false, pede: 'rede', minimo: min, ha: 0 };
  if (def.modalidade === 'frase-audio' && !o.trilha && o.semGravacao)
    return { ok: false, pede: 'gravacao', minimo: min, ha: 0 };
  if (def.modalidade === 'palavra')
    return m.palavras >= min
      ? { ok: true, disponiveis: m.palavras, de: 'palavras' }
      : { ok: false, pede: 'palavras', minimo: min, ha: m.palavras };
  if (m.frases >= min) return { ok: true, disponiveis: m.frases, de: 'frases' };
  if (def.aceitaPalavraFalada && o.trilha)
    return m.palavras >= min
      ? { ok: true, disponiveis: m.palavras, de: 'palavras', comPalavrasFaladas: true }
      : { ok: false, pede: 'frases-ou-palavras', minimo: min, ha: Math.max(m.frases, m.palavras) };
  return { ok: false, pede: 'frases', minimo: min, ha: m.frases };
}

/** `fxQuantosServem()` de `fontes.js:107`, com a lista dos que ficam de fora. */
export function jogosQueServem(
  m: MaterialDaFonte,
  o: ContextoDaFonte = {},
): { servem: number; total: number; fora: MinigameId[] } {
  const fora = TODOS_OS_JOGOS.filter((id) => !jogoServe(id, m, o).ok);
  return { servem: TODOS_OS_JOGOS.length - fora.length, total: TODOS_OS_JOGOS.length, fora };
}
