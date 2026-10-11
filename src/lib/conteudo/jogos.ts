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
 */
import { type MinigameId, MINIGAMES } from '../../core/minigames/types';

export interface MaterialDaFonte {
  palavras: number;
  frases: number;
}

export type ServeOuNao =
  | { ok: true; disponiveis: number; de: 'palavras' | 'frases'; comPalavrasFaladas?: boolean }
  | { ok: false; pede: 'palavras' | 'frases' | 'frases-ou-palavras' | 'rede'; minimo: number; ha: number };

/** A ordem do catálogo de jogos: a da tabela. */
export const TODOS_OS_JOGOS = Object.keys(MINIGAMES) as MinigameId[];

/** `fxServe()` de `fontes.js:97-106`. Só o Karaokê precisa de rede (`FX_REGRA.karaoke`, `fontes.js:65`). */
export function jogoServe(id: MinigameId, m: MaterialDaFonte, o: { semRede?: boolean } = {}): ServeOuNao {
  const def = MINIGAMES[id];
  const min = def.minItems;
  if (o.semRede && id === 'karaoke') return { ok: false, pede: 'rede', minimo: min, ha: 0 };
  if (def.modalidade === 'palavra')
    return m.palavras >= min
      ? { ok: true, disponiveis: m.palavras, de: 'palavras' }
      : { ok: false, pede: 'palavras', minimo: min, ha: m.palavras };
  if (m.frases >= min) return { ok: true, disponiveis: m.frases, de: 'frases' };
  if (def.aceitaPalavraFalada)
    return m.palavras >= min
      ? { ok: true, disponiveis: m.palavras, de: 'palavras', comPalavrasFaladas: true }
      : { ok: false, pede: 'frases-ou-palavras', minimo: min, ha: Math.max(m.frases, m.palavras) };
  return { ok: false, pede: 'frases', minimo: min, ha: m.frases };
}

/** `fxQuantosServem()` de `fontes.js:107`, com a lista dos que ficam de fora. */
export function jogosQueServem(
  m: MaterialDaFonte,
  o: { semRede?: boolean } = {},
): { servem: number; total: number; fora: MinigameId[] } {
  const fora = TODOS_OS_JOGOS.filter((id) => !jogoServe(id, m, o).ok);
  return { servem: TODOS_OS_JOGOS.length - fora.length, total: TODOS_OS_JOGOS.length, fora };
}
