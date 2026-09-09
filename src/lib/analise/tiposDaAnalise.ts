/**
 * OS TIPOS DA ANÁLISE — arquivo FOLHA (não importa nada do app, só tipos de biblioteca).
 *
 * Existe pelo mesmo motivo de `lib/captura/tiposDaFala.ts`: os módulos que saíram de
 * `views/Analysis.tsx` (métricas, player, palavra, edição de fala) precisam do MESMO formato de
 * fala que a tela monta, e importá-lo do componente criaria um ciclo módulo↔tela. Aqui não há
 * nenhum import de `src/`, então nenhum ciclo é possível.
 */
import type { ImageResult } from '../../data/api';

/**
 * A FALA como o player e o transcrito desta tela a enxergam.
 *
 * É o adaptador local de `Sentence` (lib/sentences): nomes antigos e — o ponto sensível —
 * `startTime` em SEGUNDOS, enquanto o canônico `Sentence.startMs` é em MILISSEGUNDOS.
 */
export interface FalaDaAnalise {
  id: string | undefined;
  original: string;
  translation: string;
  /** Idioma REAL do texto `original` desta fala (o TTS/STT desta tela segue este campo). */
  lang: string;
  speaker: string;
  /** Carimbo mm:ss já formatado (o que aparece na linha do tempo). */
  time: string;
  words: string[];
  /** Início da fala em SEGUNDOS (não em ms). */
  startTime: number;
  index: number;
}

/**
 * A linha crua de `utterances` como as métricas desta tela a leem.
 *
 * `any` no corpo porque é o que `fetchSessionTranscript` devolve para a tela; o que as métricas
 * realmente exigem é só o timing, e ele está declarado.
 */
export interface FalaCrua {
  tStartMs?: number | null;
  tEndMs?: number | null;
  [k: string]: unknown;
}

/** Silêncio total da sessão: soma dos vãos entre falas, em ms, e a fração da gravação. */
export interface SilencioDaSessao {
  ms: number;
  pct: number;
}

/** O que o cartão flutuante de uma palavra guarda em cache (imagem, tradução, contexto). */
export interface EntradaDeHover {
  image: ImageResult | null;
  translation: string | null;
  note: string | null;
  context: string | null;
  lang: string | null;
}
