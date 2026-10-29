/**
 * GUIA "ALFABETO MANUAL" (regras puras): as teclas de cada alfabeto, o teclado e as setas da grade, e o instante em que a
 * mão já chegou à forma da letra (a pose "parada" mostrada grande).
 *
 * Soletração do alfabeto manual, não tradução. As poses são de DEMONSTRAÇÃO, NÃO revisadas por pessoas surdas.
 */
import type { Alfabeto, Sequencia } from './tipos';

const ORDEM_DAS_LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÇ';
const ORDEM_DOS_NUMEROS = '0123456789';

/** As teclas do alfabeto, na ordem do guia: A a Z, Ç (só Libras) e os algarismos 0 a 9 (quando o alfabeto os traz). */
export function teclasDoAlfabeto(alfabeto: Alfabeto): string[] {
  const tem = (k: string) => alfabeto.letras[k] !== undefined;
  return [...ORDEM_DAS_LETRAS, ...ORDEM_DOS_NUMEROS].filter(tem);
}

/** A tecla do teclado que escolhe uma letra do guia (uma letra ou algarismo; o resto, `Enter`, espaço, é ignorado). */
export function teclaDoTeclado(key: string, teclas: readonly string[]): string | null {
  if ([...key].length !== 1) return null;
  const k = key.toUpperCase();
  return teclas.includes(k) ? k : null;
}

export type DirecaoNaGrade = 'cima' | 'baixo' | 'esquerda' | 'direita' | 'inicio' | 'fim';

/** Para onde vai o foco ao apertar uma seta na grade de `colunas` colunas. Nunca sai da grade. */
export function proximaTecla(
  teclas: readonly string[],
  atual: string,
  direcao: DirecaoNaGrade,
  colunas: number,
): string {
  if (teclas.length === 0) return atual;
  const i = teclas.indexOf(atual);
  if (i < 0) return teclas[0] as string;
  const ultimo = teclas.length - 1;
  const cols = Math.max(1, colunas);
  const j =
    direcao === 'direita'
      ? Math.min(ultimo, i + 1)
      : direcao === 'esquerda'
        ? Math.max(0, i - 1)
        : direcao === 'baixo'
          ? i + cols <= ultimo
            ? i + cols
            : ultimo
          : direcao === 'cima'
            ? i - cols >= 0
              ? i - cols
              : i
            : direcao === 'inicio'
              ? 0
              : ultimo;
  return teclas[j] as string;
}

/**
 * O instante (ms) em que a mão já está na forma da letra de uma sequência de UMA letra, para congelar a pose. Nas letras
 * com percurso (J, Z...) é o começo do percurso, a forma-base.
 */
export function instanteDaPose(seq: Sequencia): number {
  const p = seq.passos[0];
  if (!p) return 0;
  return p.chegadaMs + Math.min(80, (p.fimMs - p.chegadaMs) / 2);
}
