/**
 * O HISTÓRICO DO INTÉRPRETE (Intérprete v3, Fase 1) — a lista de falas que cada metade desenha, pura.
 *
 * Cada metade lê a conversa no IDIOMA DELA: as falas do OUTRO aparecem traduzidas (o original pequeno
 * embaixo) e as dela, no original. O DESTAQUE é a última fala do outro (o que a tela já mostrava). O
 * PARCIAL é só o da própria metade (a fala que ela está dizendo) e fica à parte da lista. A JANELA limita
 * o que a tela desenha; o histórico inteiro continua em `speechSegments`, para salvar e exportar.
 */
import type { LadoDoInterprete, SpeechSegment } from './tiposDaFala';

/** A fala, no que o histórico precisa (o mesmo recorte que a tela do intérprete recebe). */
export type FalaDoHistorico = Pick<SpeechSegment, 'id' | 'originalText' | 'translatedText'> &
  Partial<Pick<SpeechSegment, 'isPartial' | 'lado'>>;

export interface ItemDoHistorico {
  id: string;
  /** De que metade veio a fala. */
  lado: LadoDoInterprete;
  /** O que foi dito, e a tradução crua (vazia enquanto não vem): a lista em bolhas usa os dois. */
  original: string;
  traducao: string;
  /** Foi dita por quem lê esta metade. */
  propria: boolean;
  /** O que a metade lê: o original, se é dela; a tradução, se é do outro (`…` enquanto não vem). */
  texto: string;
  /** O original pequeno embaixo da tradução do outro; vazio nas falas dela. */
  secundario: string;
  /** A tradução ainda não chegou. */
  traduzindo: boolean;
}

export interface Historico {
  /** As falas finais, em ordem, só as da janela. */
  itens: ItemDoHistorico[];
  /** Quantas falas finais ficaram de fora da janela. */
  escondidas: number;
  /** A última fala do outro: a frase grande da metade. */
  destaque?: ItemDoHistorico;
  /** A fala em andamento desta metade (só a dela). */
  parcial?: { id: string; texto: string };
}

export const JANELA_DO_HISTORICO = 50;

const SEM_TRADUCAO = '…';

/** A janela depois de "ver mais": 50 a mais, sem passar do total. */
export const subirJanela = (janela: number, total: number): number =>
  Math.min(Math.max(total, 0), janela + JANELA_DO_HISTORICO);

export function historicoDoInterprete(
  falas: ReadonlyArray<FalaDoHistorico>,
  lado: LadoDoInterprete,
  opcoes: { janela?: number } = {},
): Historico {
  const janela = Math.max(1, opcoes.janela ?? JANELA_DO_HISTORICO);
  const todos: ItemDoHistorico[] = [];
  let destaque: ItemDoHistorico | undefined;
  let parcial: Historico['parcial'];

  for (const f of falas) {
    if (!f.lado || !f.originalText.trim()) continue;
    if (f.isPartial) {
      if (f.lado === lado) parcial = { id: f.id, texto: f.originalText };
      continue;
    }
    const propria = f.lado === lado;
    const traducao = f.translatedText?.trim() ?? '';
    const traduzindo = !propria && (!traducao || traducao === SEM_TRADUCAO);
    const item: ItemDoHistorico = {
      id: f.id,
      lado: f.lado,
      original: f.originalText,
      traducao: traduzindo ? '' : (f.translatedText ?? ''),
      propria,
      texto: propria ? f.originalText : traduzindo ? SEM_TRADUCAO : f.translatedText,
      secundario: propria ? '' : f.originalText,
      traduzindo,
    };
    todos.push(item);
    if (!propria) destaque = item;
  }

  const itens = todos.slice(-janela);
  return {
    itens,
    escondidas: todos.length - itens.length,
    ...(destaque ? { destaque } : {}),
    ...(parcial ? { parcial } : {}),
  };
}
