/**
 * PRÉ-TRADUÇÃO EM LOTE DE LEGENDAS IMPORTADAS (openspec `pre-traducao-de-legendas`). Puro: sem React, sem rede, sem DOM e sem
 * conhecer o motor. Quem chama injeta `traduzir(texto)`, que na prática é o tradutor LOCAL (`gateway/preTraducaoLocal.ts`).
 *
 *  - LOTES: até `FALAS_POR_LOTE` falas ou `CARACTERES_POR_LOTE` caracteres; entre lotes `ceder()` devolve a vez ao navegador.
 *  - CANCELÁVEL: o `AbortSignal` é conferido antes de cada fala; o resultado parcial volta com estado `cancelada`.
 *  - PROGRESSO HONESTO: só conta fala realmente resolvida; traduzidas, repetidas, vazias e falhas ficam separadas; a estimativa
 *    de tempo só existe depois de `MIN_PARA_ESTIMAR` traduções e é a média delas (rotulada estimativa).
 *  - LEGENDA SEGURA: a política do perfil é aplicada ao original e à tradução de cada fala, depois de traduzir.
 */
import { ocultarTermos, POLITICA_DESLIGADA, type PoliticaDaLegenda } from '../moderacao/legendaSegura';
import { ehCancelamento, ehMotorCarregando } from '../robustness';

export const FALAS_POR_LOTE = 20;
export const CARACTERES_POR_LOTE = 2000;
/** Falhas seguidas que indicam motor quebrado (e não uma fala ruim). */
export const FALHAS_SEGUIDAS_PARA_PARAR = 5;
/** Traduções mínimas para mostrar uma estimativa de tempo restante. */
export const MIN_PARA_ESTIMAR = 5;

export type EstadoDaPreTraducao = 'concluida' | 'cancelada' | 'aguardando-motor' | 'falhou';

export interface FalaPreTraduzida {
  /** Posição da fala na legenda importada (0-based). */
  indice: number;
  /** O original, já pela política de legenda segura. */
  original: string;
  /** A tradução pela política, ou `null` (vazia, falha ou ainda não feita). */
  traducao: string | null;
  /** Marcadores `•••` postos no original e na tradução desta fala. */
  ocultadas: number;
}

export interface ProgressoDaPreTraducao {
  total: number;
  /** Falas resolvidas: traduzidas + repetidas + vazias + falhas. */
  feitas: number;
  traduzidas: number;
  repetidas: number;
  vazias: number;
  falhas: number;
  /** `feitas / total`, em [0, 1]; 1 só com tudo resolvido. */
  fracao: number;
  /** Estimativa (ms) do que falta; `null` até haver `MIN_PARA_ESTIMAR` traduções. É média, não promessa. */
  restanteEstimadoMs: number | null;
}

export interface ResultadoDaPreTraducao {
  estado: EstadoDaPreTraducao;
  falas: FalaPreTraduzida[];
  progresso: ProgressoDaPreTraducao;
}

export interface EntradaDaPreTraducao {
  /** As falas da legenda (uma por posição; `textoDaLegenda(...).split('\n')`). */
  falas: readonly string[];
  /** Traduz UMA fala. Deve lançar `MotorAindaCarregando` se o motor não está pronto. */
  traduzir: (texto: string) => Promise<string>;
  politica?: PoliticaDaLegenda;
  signal?: AbortSignal;
  aoProgredir?: (p: ProgressoDaPreTraducao) => void;
  /** Devolve a vez ao navegador entre lotes. Padrão: `setTimeout(0)`. */
  ceder?: () => Promise<void>;
  /** Relógio injetável (ms). Padrão: `Date.now`. */
  agora?: () => number;
  falasPorLote?: number;
  caracteresPorLote?: number;
}

/** Um lote: as posições das falas dentro da legenda. */
export function dividirEmLotes(
  falas: readonly string[],
  falasPorLote = FALAS_POR_LOTE,
  caracteresPorLote = CARACTERES_POR_LOTE,
): number[][] {
  const lotes: number[][] = [];
  let atual: number[] = [];
  let chars = 0;
  falas.forEach((f, i) => {
    const n = f.length;
    if (atual.length > 0 && (atual.length >= falasPorLote || chars + n > caracteresPorLote)) {
      lotes.push(atual);
      atual = [];
      chars = 0;
    }
    atual.push(i);
    chars += n;
  });
  if (atual.length) lotes.push(atual);
  return lotes;
}

const cederPadrao = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Chave de repetição: a legenda repete "Okay." com caixa e espaços diferentes. */
const chaveDaFala = (t: string): string => t.trim().replace(/\s+/g, ' ').toLowerCase();

export async function preTraduzirLegenda(e: EntradaDaPreTraducao): Promise<ResultadoDaPreTraducao> {
  const politica = e.politica ?? POLITICA_DESLIGADA;
  const agora = e.agora ?? Date.now;
  const ceder = e.ceder ?? cederPadrao;
  const total = e.falas.length;
  const saida: FalaPreTraduzida[] = [];
  const memo = new Map<string, string>();
  let traduzidas = 0;
  let repetidas = 0;
  let vazias = 0;
  let falhas = 0;
  let seguidas = 0;
  let msTraduzindo = 0;

  const progresso = (): ProgressoDaPreTraducao => {
    const feitas = traduzidas + repetidas + vazias + falhas;
    const faltam = total - feitas;
    return {
      total,
      feitas,
      traduzidas,
      repetidas,
      vazias,
      falhas,
      fracao: total === 0 ? 1 : feitas / total,
      restanteEstimadoMs: traduzidas >= MIN_PARA_ESTIMAR ? Math.round((msTraduzindo / traduzidas) * faltam) : null,
    };
  };
  const fim = (estado: EstadoDaPreTraducao): ResultadoDaPreTraducao => ({
    estado,
    falas: saida,
    progresso: progresso(),
  });
  const registrar = (indice: number, bruto: string, traducao: string | null): void => {
    const o = ocultarTermos(bruto, politica);
    const t = traducao === null ? null : ocultarTermos(traducao, politica);
    saida.push({ indice, original: o.texto, traducao: t?.texto ?? null, ocultadas: o.ocultadas + (t?.ocultadas ?? 0) });
  };

  const lotes = dividirEmLotes(e.falas, e.falasPorLote, e.caracteresPorLote);
  for (let l = 0; l < lotes.length; l++) {
    if (l > 0) await ceder();
    for (const i of lotes[l]!) {
      if (e.signal?.aborted) return fim('cancelada');
      const bruto = e.falas[i]!;
      if (!bruto.trim()) {
        vazias++;
        registrar(i, bruto, null);
        e.aoProgredir?.(progresso());
        continue;
      }
      const chave = chaveDaFala(bruto);
      const ja = memo.get(chave);
      if (ja !== undefined) {
        repetidas++;
        registrar(i, bruto, ja);
        e.aoProgredir?.(progresso());
        continue;
      }
      const t0 = agora();
      try {
        const t = await e.traduzir(bruto);
        msTraduzindo += agora() - t0;
        traduzidas++;
        seguidas = 0;
        memo.set(chave, t);
        registrar(i, bruto, t);
      } catch (err) {
        if (ehCancelamento(err)) return fim('cancelada');
        if (ehMotorCarregando(err)) return fim('aguardando-motor');
        falhas++;
        seguidas++;
        registrar(i, bruto, null);
        if (seguidas >= FALHAS_SEGUIDAS_PARA_PARAR) {
          e.aoProgredir?.(progresso());
          return fim('falhou');
        }
      }
      e.aoProgredir?.(progresso());
    }
  }
  return fim('concluida');
}
