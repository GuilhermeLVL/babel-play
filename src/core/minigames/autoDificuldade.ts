/**
 * DIFICULDADE AUTOMÁTICA — mira a "zona de desenvolvimento proximal".
 *
 * Referência: o Birdbrain do Duolingo escolhe exercícios com ~80-90% de chance de acerto — fácil
 * demais entedia, difícil demais frustra. Aqui a versão honesta e barata: olhar a precisão das
 * últimas rodadas DESTE jogo e mover a faixa (fácil/médio/difícil) um degrau por vez, sempre com o
 * motivo escrito para a antessala. Novato (sem rodadas) começa em fácil.
 *
 * Puro e testável: recebe precisões, devolve faixa + motivo.
 */
import type { FaixaDificuldade } from './composicao';

export const ALVO_MIN = 70;
export const ALVO_MAX = 90;
export const JANELA_DE_RODADAS = 3;
const ORDEM: FaixaDificuldade[] = ['facil', 'medio', 'dificil'];

export interface DecisaoAuto {
  faixa: FaixaDificuldade;
  motivo: string;
  /** Precisão média usada (null quando não há rodadas). */
  media: number | null;
}

export function faixaAuto(p: { ultimasPrecisoes: readonly number[]; faixaAtual?: FaixaDificuldade | null }): DecisaoAuto {
  const atual = p.faixaAtual ?? 'facil';
  const ultimas = p.ultimasPrecisoes.slice(-JANELA_DE_RODADAS);
  if (!ultimas.length) return { faixa: 'facil', motivo: 'Começando em Fácil: ainda não há rodadas para medir.', media: null };
  if (ultimas.length < JANELA_DE_RODADAS) {
    return { faixa: atual, motivo: `${rotulo(atual)} por enquanto: faltam ${JANELA_DE_RODADAS - ultimas.length} rodada(s) para ajustar.`, media: media(ultimas) };
  }
  const m = media(ultimas);
  const i = ORDEM.indexOf(atual);
  if (m >= ALVO_MAX && i < ORDEM.length - 1) {
    const nova = ORDEM[i + 1];
    return { faixa: nova, motivo: `Subiu para ${rotulo(nova)}: ${m}% nas últimas ${JANELA_DE_RODADAS} rodadas.`, media: m };
  }
  if (m < ALVO_MIN && i > 0) {
    const nova = ORDEM[i - 1];
    return { faixa: nova, motivo: `Voltou para ${rotulo(nova)}: ${m}% nas últimas ${JANELA_DE_RODADAS} rodadas. Sem pressa.`, media: m };
  }
  return { faixa: atual, motivo: `${rotulo(atual)} mantido: ${m}% nas últimas ${JANELA_DE_RODADAS} rodadas (alvo ${ALVO_MIN}-${ALVO_MAX}%).`, media: m };
}

function media(xs: readonly number[]): number {
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

export function rotulo(f: FaixaDificuldade): string {
  return f === 'facil' ? 'Fácil' : f === 'medio' ? 'Médio' : 'Difícil';
}
