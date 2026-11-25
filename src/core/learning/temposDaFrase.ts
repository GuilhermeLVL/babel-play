/**
 * OS TEMPOS DA FRASE para o modo "Frase por frase" (openspec `repetir-e-pausar-por-frase`).
 *
 * O corte de cada frase usa o começo da frase seguinte. Legenda importada com tempos ruins cortaria no meio da palavra,
 * então o modo só liga quando as falas têm começo estritamente crescente e duração entre 0,5 s e 15 s.
 * Lógica pura: sem React, sem DOM, sem relógio.
 */

/** O que o modo precisa de uma fala: o começo em segundos (arredondado) e, se houver, o exato. */
export interface FalaComTempo {
  startTime: number;
  inicioExato?: number;
}

export const DURACAO_MINIMA_DA_FRASE_S = 0.5;
export const DURACAO_MAXIMA_DA_FRASE_S = 15;

export type MotivoSemTempos = 'sem-falas' | 'nao-crescente' | 'frase-curta-demais' | 'frase-longa-demais';

export interface ResultadoDosTempos {
  usavel: boolean;
  motivo: MotivoSemTempos | null;
  /** Índice da primeira fala que reprovou, ou `null`. */
  indice: number | null;
}

/** O começo da fala em segundos: o exato quando a gravação o guardou, senão o carimbo. */
export function inicioDaFrase(f: FalaComTempo): number {
  return typeof f.inicioExato === 'number' && Number.isFinite(f.inicioExato) ? f.inicioExato : f.startTime;
}

/**
 * O fim da frase `i`: o começo da seguinte. Na última, a duração da mídia (se conhecida e maior que o começo),
 * senão `null` (a mídia acaba sozinha).
 */
export function fimDaFrase(falas: readonly FalaComTempo[], i: number, duracaoDaMidia?: number | null): number | null {
  if (i < 0 || i >= falas.length) return null;
  if (i < falas.length - 1) return inicioDaFrase(falas[i + 1]);
  const ini = inicioDaFrase(falas[i]);
  return typeof duracaoDaMidia === 'number' && Number.isFinite(duracaoDaMidia) && duracaoDaMidia > ini
    ? duracaoDaMidia
    : null;
}

/**
 * Os tempos servem ao modo? Começo estritamente crescente e cada frase (a última só se a duração da mídia é conhecida)
 * entre 0,5 s e 15 s.
 */
export function temposUsaveis(falas: readonly FalaComTempo[], duracaoDaMidia?: number | null): ResultadoDosTempos {
  if (falas.length === 0) return { usavel: false, motivo: 'sem-falas', indice: null };
  for (let i = 0; i < falas.length; i++) {
    const ini = inicioDaFrase(falas[i]);
    if (!Number.isFinite(ini) || ini < 0) return { usavel: false, motivo: 'nao-crescente', indice: i };
    if (i > 0 && ini <= inicioDaFrase(falas[i - 1])) return { usavel: false, motivo: 'nao-crescente', indice: i };
  }
  for (let i = 0; i < falas.length; i++) {
    const fim = fimDaFrase(falas, i, duracaoDaMidia);
    if (fim === null) continue;
    const d = fim - inicioDaFrase(falas[i]);
    if (d < DURACAO_MINIMA_DA_FRASE_S) return { usavel: false, motivo: 'frase-curta-demais', indice: i };
    if (d > DURACAO_MAXIMA_DA_FRASE_S) return { usavel: false, motivo: 'frase-longa-demais', indice: i };
  }
  return { usavel: true, motivo: null, indice: null };
}
