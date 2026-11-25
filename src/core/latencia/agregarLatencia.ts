/**
 * AGREGADOR DA LATÊNCIA PUBLICADA (openspec `latencia-publicada-por-aparelho`, tarefa 1.1). Função PURA: recebe, por célula
 * `classe x idioma`, as contagens dos baldes fixos do lote `v: 2` (somadas na janela) e devolve o `latencia.json` (`v: 1`).
 *
 * REGRAS QUE NÃO SE NEGOCIAM
 *  - O percentil sai da SOMA dos baldes, nunca da média de percentis (dois lotes com p75 de 1.000 e 5.000 ms não dão 3.000).
 *  - O valor publicado é o LIMITE do balde que cruza o quantil (o mesmo critério do `docs/runbook.md` §3.2); o último
 *    balde ("acima de 10 s") vale `ACIMA_DO_ULTIMO_BALDE_MS`. Não se inventa um valor "exato" que o cliente nunca mandou.
 *  - Célula com menos de `N_MIN` falas contadas (ou com menos de `N_MIN` legendas medidas) sai `insuficiente`, SEM número:
 *    amostra pequena é instável e, pior, a diferença entre dois snapshots viraria instrumento de reidentificação.
 *  - O arquivo não tem texto, id, hora individual, IP nem valor por pessoa; só a data do snapshot.
 *
 * Fica em `src/core/` (sem React, sem rede, sem DOM): o app, o gerador do site, o painel e o script de publicação usam as
 * mesmas regras.
 */

/** Os limites dos baldes do `v: 2`, em ms (espelho de `LIMITES_DOS_BALDES_DE_CAMPO_MS` do servidor; um teste confere). */
export const LIMITES_DOS_BALDES_MS = [250, 500, 1000, 1500, 2000, 3000, 5000, 10000] as const;
/** Quanto vale o balde "acima de 10 s" (o mesmo número do servidor e do runbook). */
export const ACIMA_DO_ULTIMO_BALDE_MS = 30000;
/** Baldes do `v: 2`: 8 limites + o "acima de 10 s". */
export const N_BALDES_DA_LATENCIA = LIMITES_DOS_BALDES_MS.length + 1;

/** Menos falas que isto e a célula não tem número publicado. */
export const N_MIN = 200;
/** O p95 só aparece (no painel do dono) com amostra desta ordem. */
export const N_MIN_P95 = 1000;
/** Janela da agregação, em dias. */
export const JANELA_DIAS = 28;
/** Arquivo mais velho que isto não é mostrado (o snapshot é semanal; 35 dias = 5 semanas). */
export const IDADE_MAXIMA_DIAS = 35;

/** As 5 classes de `TipoDeDispositivo` + `outro` (listas fechadas, como no recebimento). */
export const CLASSES_DA_LATENCIA = [
  'quest',
  'celular-fraco',
  'celular-bom',
  'desktop-sem-gpu',
  'desktop-com-gpu',
  'outro',
] as const;
export type ClasseDaLatencia = (typeof CLASSES_DA_LATENCIA)[number];

/** Idiomas-base do recebimento + `outro`; `todos` é a linha da classe somada (soma de baldes, não média). */
export const IDIOMAS_DA_LATENCIA = ['pt', 'en', 'es', 'outro', 'todos'] as const;
export type IdiomaDaLatencia = (typeof IDIOMAS_DA_LATENCIA)[number];

/** O que as fontes (Prometheus, Analytics Engine, simulador) entregam: contagens SOMADAS de uma célula na janela. */
export interface AmostraDeCelula {
  classe: string;
  idioma: string;
  /** Exatamente `N_BALDES_DA_LATENCIA` contagens (falas com legenda por balde). */
  baldes: readonly number[];
  /** Falas contadas (com legenda + falhas + sem tradução). */
  falas: number;
  falhas: number;
}

export type EstadoDaCelula = 'ok' | 'insuficiente';

export interface CelulaDeLatencia {
  classe: ClasseDaLatencia;
  idioma: IdiomaDaLatencia;
  n: number;
  estado: EstadoDaCelula;
  /** Ausentes quando `insuficiente`. */
  p50Ms?: number;
  p75Ms?: number;
  /** Falhas ÷ falas, 0..1; ausente quando `insuficiente`. */
  falha?: number;
}

export interface LatenciaPublicada {
  v: 1;
  /** Dia do snapshot, `AAAA-MM-DD` (sem hora). */
  geradoEm: string;
  janelaDias: number;
  celulas: CelulaDeLatencia[];
}

/** O valor que representa o balde `i`: o limite; o último vale `ACIMA_DO_ULTIMO_BALDE_MS`. */
export const valorDoBalde = (i: number): number => LIMITES_DOS_BALDES_MS[i] ?? ACIMA_DO_ULTIMO_BALDE_MS;

/** O balde onde o quantil `q` (0..1) cai: o menor índice cuja soma acumulada cobre `q * total`. `null` se não há medida. */
export function baldeDoQuantil(baldes: readonly number[], q: number): number | null {
  const total = baldes.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const alvo = q * total;
  let acumulado = 0;
  for (let i = 0; i < baldes.length; i++) {
    acumulado += baldes[i]!;
    if (acumulado >= alvo) return i;
  }
  return baldes.length - 1;
}

/** O quantil `q` como LIMITE do balde, em ms; `null` sem medida. */
export function quantilEmMs(baldes: readonly number[], q: number): number | null {
  const i = baldeDoQuantil(baldes, q);
  return i === null ? null : valorDoBalde(i);
}

/** Soma elemento a elemento (a única forma honesta de juntar lotes). */
export function somarBaldes(a: readonly number[], b: readonly number[]): number[] {
  return Array.from({ length: N_BALDES_DA_LATENCIA }, (_, i) => (a[i] ?? 0) + (b[i] ?? 0));
}

const fechada = <T extends string>(lista: readonly T[], v: string, fallback: T): T =>
  (lista as readonly string[]).includes(v) ? (v as T) : fallback;

const contagem = (v: number): number => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Arredonda a taxa a 4 casas (0,01%): é um agregado, não há por que expor mais dígitos. */
const taxa = (x: number): number => Math.round(x * 10000) / 10000;

function celula(
  classe: ClasseDaLatencia,
  idioma: IdiomaDaLatencia,
  baldes: readonly number[],
  falas: number,
  falhas: number,
): CelulaDeLatencia {
  const medidas = baldes.reduce((a, b) => a + b, 0);
  /* `falas` nunca é menor que o que se mediu mais as falhas (a fonte pode perder o contador de falas num lote). */
  const n = Math.max(falas, medidas + falhas);
  if (n < N_MIN || medidas < N_MIN) return { classe, idioma, n, estado: 'insuficiente' };
  return {
    classe,
    idioma,
    n,
    estado: 'ok',
    p50Ms: quantilEmMs(baldes, 0.5)!,
    p75Ms: quantilEmMs(baldes, 0.75)!,
    falha: taxa(Math.min(1, falhas / n)),
  };
}

/** A ordem estável do arquivo: classe, depois idioma (a mesma das listas fechadas). */
const ordem = (c: CelulaDeLatencia): number =>
  CLASSES_DA_LATENCIA.indexOf(c.classe) * 10 + IDIOMAS_DA_LATENCIA.indexOf(c.idioma);

/**
 * Agrega as amostras (qualquer número por célula, na mesma célula ou repetidas) no `latencia.json`. Classe ou idioma fora das
 * listas viram `outro` (como no recebimento). Cada classe com algum dado ganha também a linha `todos` (baldes somados).
 * `hoje` é injetado para o teste ser determinístico; o arquivo leva só o dia.
 */
export function agregarLatencia(
  amostras: readonly AmostraDeCelula[],
  hoje: Date,
  janelaDias = JANELA_DIAS,
): LatenciaPublicada {
  type Acc = { baldes: number[]; falas: number; falhas: number };
  const porCelula = new Map<string, Acc>();
  const porClasse = new Map<ClasseDaLatencia, Acc>();
  const somar = (acc: Acc | undefined, a: AmostraDeCelula): Acc => {
    const baldes = Array.from({ length: N_BALDES_DA_LATENCIA }, (_, i) => contagem(a.baldes[i] ?? 0));
    return {
      baldes: acc ? somarBaldes(acc.baldes, baldes) : baldes,
      falas: (acc?.falas ?? 0) + contagem(a.falas),
      falhas: (acc?.falhas ?? 0) + contagem(a.falhas),
    };
  };
  for (const a of amostras) {
    const classe = fechada(CLASSES_DA_LATENCIA, a.classe, 'outro');
    const idioma = fechada(IDIOMAS_DA_LATENCIA, a.idioma, 'outro');
    /* `todos` na entrada seria dupla contagem: só nós o produzimos. */
    const idiomaReal: IdiomaDaLatencia = idioma === 'todos' ? 'outro' : idioma;
    const chave = `${classe}|${idiomaReal}`;
    porCelula.set(chave, somar(porCelula.get(chave), a));
    porClasse.set(classe, somar(porClasse.get(classe), a));
  }
  const celulas: CelulaDeLatencia[] = [];
  for (const [chave, acc] of porCelula) {
    const [classe, idioma] = chave.split('|') as [ClasseDaLatencia, IdiomaDaLatencia];
    celulas.push(celula(classe, idioma, acc.baldes, acc.falas, acc.falhas));
  }
  for (const [classe, acc] of porClasse) celulas.push(celula(classe, 'todos', acc.baldes, acc.falas, acc.falhas));
  celulas.sort((a, b) => ordem(a) - ordem(b));
  return { v: 1, geradoEm: hoje.toISOString().slice(0, 10), janelaDias, celulas };
}
