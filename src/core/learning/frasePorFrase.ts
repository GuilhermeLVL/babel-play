/**
 * FRASE POR FRASE — a máquina de "repetir e pausar" (openspec `repetir-e-pausar-por-frase`).
 *
 * Ao fim de cada frase tocada, devolve a próxima ação: repetir a frase, esperar a pessoa repetir em voz alta, seguir
 * para a próxima ou parar. Lógica pura: sem React, sem DOM e sem relógio próprio; quem chama passa a duração da frase.
 * NADA aqui mede ou premia tempo (Decreto 12.880, art. 9º): é ritmo de estudo, sem ponto, sequência ou prêmio.
 */

export type Repeticoes = 1 | 2 | 3;

export interface ConfigDeFrase {
  /** Quantas vezes a frase toca antes de seguir (1 a 3). */
  repeticoes: Repeticoes;
  /** Pausa para repetir, em múltiplos da duração da frase (0,5 a 2). */
  pausa: number;
  /** Para no fim da frase (e das repetições) até a pessoa tocar em "Próxima". */
  pararNoFim: boolean;
}

export const PAUSA_MINIMA = 0.5;
export const PAUSA_MAXIMA = 2;

export const CONFIG_PADRAO: ConfigDeFrase = { repeticoes: 1, pausa: 1, pararNoFim: false };

export type AcaoDeFrase =
  | { tipo: 'repetir' }
  | { tipo: 'esperar'; ms: number }
  | { tipo: 'seguir' }
  | { tipo: 'parar' };

export interface ResultadoDoFim {
  acao: AcaoDeFrase;
  /** Quantas vezes a frase já tocou, para devolver na chamada seguinte (0 quando a frase acabou de vez). */
  feita: number;
}

export function limitarRepeticoes(v: unknown): Repeticoes {
  const n = Math.round(Number(v));
  return n >= 3 ? 3 : n === 2 ? 2 : 1;
}

export function limitarPausa(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return CONFIG_PADRAO.pausa;
  return Math.min(PAUSA_MAXIMA, Math.max(PAUSA_MINIMA, n));
}

/** Aceita qualquer valor guardado e devolve uma configuração válida (campos fora da faixa são limitados). */
export function normalizarConfig(v: unknown): ConfigDeFrase {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return {
    repeticoes: limitarRepeticoes(o.repeticoes ?? CONFIG_PADRAO.repeticoes),
    pausa: limitarPausa(o.pausa ?? CONFIG_PADRAO.pausa),
    pararNoFim: o.pararNoFim === true,
  };
}

/**
 * A frase `i` (de `total`) acabou de tocar pela vez `feita + 1`. O que fazer agora?
 *  - ainda faltam repetições: `repetir`;
 *  - última frase ou "parar no fim": `parar`;
 *  - senão: `esperar` (duração da frase x fator) e depois `seguir`.
 * `duracaoMs` é o tempo de PAREDE da frase (já considerando a velocidade).
 */
export function aoFimDaFrase(
  config: ConfigDeFrase,
  i: number,
  total: number,
  feita: number,
  duracaoMs: number,
): ResultadoDoFim {
  const cfg = normalizarConfig(config);
  const tocadas = Math.max(0, Math.floor(feita)) + 1;
  if (tocadas < cfg.repeticoes) return { acao: { tipo: 'repetir' }, feita: tocadas };
  if (i >= total - 1 || cfg.pararNoFim) return { acao: { tipo: 'parar' }, feita: 0 };
  const ms = Math.max(0, Math.round((Number.isFinite(duracaoMs) ? duracaoMs : 0) * cfg.pausa));
  return { acao: { tipo: 'esperar', ms }, feita: 0 };
}

/** Terminada a pausa de repetir, segue. Existe para a máquina ficar completa e testável. */
export function aoFimDaPausa(): AcaoDeFrase {
  return { tipo: 'seguir' };
}
