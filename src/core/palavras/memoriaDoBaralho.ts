/**
 * A MEMÓRIA POR BARALHO (openspec `cartoes` 4.2; flag `estudo_palavras_v2`): quanto da palavra a pessoa lembra, e quando o
 * baralho volta a pedir revisão, para cada idioma, sessão, baralho do Anki e a Trilha.
 *
 * REGRA DE HONESTIDADE: com menos de `MINIMO_DE_REVISOES` revisões na janela, NÃO há porcentagem. Dez revisões dizem pouco e um
 * "80%" sobre 5 respostas parece medida e não é; a tela mostra "poucas revisões ainda".
 *
 * "Lembrada" é nota 2, 3 ou 4 (a mesma régua da retenção da Memória, `resumoDosCartoes`); "Errei" é a esquecida.
 */

/** Revisões mínimas, na janela, para mostrar uma porcentagem. */
export const MINIMO_DE_REVISOES = 20;
/** A janela da retenção por baralho, em dias. */
export const JANELA_DA_RETENCAO_DIAS = 90;

export type TipoDeBaralho = 'idioma' | 'sessao' | 'anki' | 'trilha';

export interface MemoriaDoBaralho {
  tipo: TipoDeBaralho;
  /** Código do idioma, id da sessão, id do baralho do Anki, ou `trilha`. */
  id: string;
  /** Revisões na janela (notas de 1 a 4). */
  revisoes: number;
  /** Quantas delas foram lembradas. */
  lembradas: number;
  /** Quando o primeiro cartão do baralho volta a vencer (ms), ou `null` se nenhum tem data. */
  proximaRevisao: number | null;
}

export interface MemoriaPorBaralho {
  /** O instante (ms) em que foi contado. */
  agora: number;
  janelaDias: number;
  baralhos: MemoriaDoBaralho[];
}

/** A retenção em porcentagem inteira (0 a 100), ou `null` quando há menos de 20 revisões. */
export function retencaoDoBaralho(b: Pick<MemoriaDoBaralho, 'revisoes' | 'lembradas'>): number | null {
  if (!Number.isFinite(b.revisoes) || b.revisoes < MINIMO_DE_REVISOES) return null;
  const pct = Math.round((Math.min(b.lembradas, b.revisoes) / b.revisoes) * 100);
  return Math.max(0, Math.min(100, pct));
}

/** A próxima revisão como o dia em que ela cai: `agora` (já venceu), `hoje`, `amanha`, ou `em` N dias; `nenhuma` sem data. */
export type QuandoVolta =
  | { quando: 'nenhuma' }
  | { quando: 'agora' | 'hoje' | 'amanha' }
  | { quando: 'em'; dias: number };

export function quandoVolta(proxima: number | null, agora: number, inicioDoDia: number): QuandoVolta {
  if (proxima == null) return { quando: 'nenhuma' };
  if (proxima <= agora) return { quando: 'agora' };
  const dias = Math.floor((proxima - inicioDoDia) / 86_400_000);
  if (dias <= 0) return { quando: 'hoje' };
  if (dias === 1) return { quando: 'amanha' };
  return { quando: 'em', dias };
}
