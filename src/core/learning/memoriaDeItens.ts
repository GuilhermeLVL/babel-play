/**
 * MEMÓRIA DE ITENS — o que o app lembra de cada palavra/frase em TODOS os jogos, e o que faz com isso.
 *
 * O DEFEITO QUE ISTO CONSERTA (mapeado em 2026-08-28): o histórico por item (`vezes/erros/
 * ultimoAcerto`) era lido e virava SÓ um selo na antessala. A seleção da rodada nunca o consultava:
 * uma palavra errada no Ditado (sem cartão, sem FSRS) não influenciava rodada nenhuma, e um erro no
 * Termo voltava na rodada seguinte por causa do FSRS (`dueAt = now`) ou nunca mais, conforme a
 * memória curta em RAM. Não havia régua.
 *
 * A RÉGUA (uma só, para os 9 jogos), inspirada no tratamento de "leeches" do Anki (falha repetida
 * = sinalizar e mudar de abordagem, não repetir cegamente):
 *   · 1º erro → volta 2 rodadas depois;  2º seguido → 4 rodadas;  3º seguido → amanhã;
 *   · 4º erro seguido → LEECH: sai do sorteio comum e volta numa "rodada de resgate" (só ela + 2
 *     fáceis, com ajuda liberada). Um acerto zera a contagem e a palavra volta como "aprendendo".
 *
 * Puro: recebe o histórico agregado, devolve estado e decisões. Também mora aqui o embaralhador
 * COM SEMENTE — cada jogo recebe uma ordem própria e estável no dia, para a mesma sessão não
 * render as mesmas 8 palavras em 4 jogos (rotação por jogo).
 */

export interface HistoricoDoItem {
  vezes: number;
  erros: number;
  ultimoAcerto: boolean;
  ultimaEm?: number;
  /** Erros consecutivos contados do fim (0 se a última foi acerto). */
  errosSeguidos?: number;
  /** Quantas rodadas DESTE jogo já passaram desde a última linha errada. */
  rodadasDesdeUltimoErro?: number;
}

export type TagDoItem = 'nova' | 'aprendendo' | 'firme' | 'errando' | 'leech';

export interface EstadoDoItem {
  tag: TagDoItem;
  errosSeguidos: number;
  /** Quando pode voltar: nº de rodadas a esperar, ou 'amanha'. `0` = já pode. */
  janela: number | 'amanha';
  /** Motivo legível, para a antessala ("voltou porque você errou 2×"). */
  motivo: string;
}

export const LEECH_APOS = 4;
/** Índice = erros seguidos − 1. */
export const JANELAS_DE_RETORNO: Array<number | 'amanha'> = [2, 4, 'amanha'];
/** Acertos seguidos (sem erro no meio) para a palavra contar como firme. */
export const FIRME_APOS = 3;

export function janelaDeRetorno(errosSeguidos: number): number | 'amanha' {
  if (errosSeguidos <= 0) return 0;
  return JANELAS_DE_RETORNO[Math.min(errosSeguidos, JANELAS_DE_RETORNO.length) - 1];
}

export function estadoDoItem(h: HistoricoDoItem | undefined): EstadoDoItem {
  if (!h || h.vezes === 0) return { tag: 'nova', errosSeguidos: 0, janela: 0, motivo: 'nova para você' };
  const seguidos = h.errosSeguidos ?? (h.ultimoAcerto ? 0 : Math.min(h.erros, 1));
  if (seguidos >= LEECH_APOS) {
    return { tag: 'leech', errosSeguidos: seguidos, janela: 'amanha', motivo: `${seguidos} erros seguidos: difícil para você` };
  }
  if (seguidos > 0) {
    return { tag: 'errando', errosSeguidos: seguidos, janela: janelaDeRetorno(seguidos), motivo: seguidos === 1 ? 'você errou' : `você errou ${seguidos}×` };
  }
  const acertos = h.vezes - h.erros;
  if (h.erros === 0 && acertos >= FIRME_APOS) return { tag: 'firme', errosSeguidos: 0, janela: 0, motivo: `${acertos} acertos, nenhum erro` };
  return { tag: 'aprendendo', errosSeguidos: 0, janela: 0, motivo: h.erros ? 'já errou, acertou depois' : 'já viu' };
}

/** A janela venceu? (rodadas desde o último erro ≥ janela; 'amanha' = dia local diferente). */
export function prontoParaVoltar(h: HistoricoDoItem | undefined, agora: number, diaDe: (ts: number) => number): boolean {
  const e = estadoDoItem(h);
  if (e.tag !== 'errando') return e.tag !== 'leech';
  if (e.janela === 'amanha') return h?.ultimaEm ? diaDe(agora) > diaDe(h.ultimaEm) : true;
  return (h?.rodadasDesdeUltimoErro ?? Infinity) >= e.janela;
}

/* ── Semente por jogo ─────────────────────────────────────────────────────────────────────── */

/** Hash FNV-1a de 32 bits: barato, determinístico, bom o bastante para semear um embaralhador. */
export function hashDaSemente(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — PRNG pequeno e determinístico a partir de uma semente. */
export function rngDe(semente: string | number): () => number {
  let a = typeof semente === 'number' ? semente >>> 0 : hashDaSemente(semente);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates com semente: mesma semente → mesma ordem; sementes diferentes → ordens diferentes. */
export function embaralharComSemente<T>(xs: readonly T[], semente: string | number): T[] {
  const rng = rngDe(semente);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * ORDENA POR MEMÓRIA — a régua de prioridade comum aos 9 jogos.
 *
 * Camadas, na ordem: (1) errando com janela vencida; (2) urgentes (vencidas no agendador, quando
 * quem chama souber); (3) novas; (4) aprendendo; (5) firmes. Dentro de cada camada, embaralha com
 * a semente. Leeches ficam de FORA (voltam só na rodada de resgate). `errando` com janela ainda
 * aberta vai para o fim (não some: num acervo pequeno é melhor repetir do que ficar sem rodada).
 */
export function ordenarPorMemoria<T>(
  itens: readonly T[],
  refDe: (item: T) => string,
  opts: {
    memoria: ReadonlyMap<string, HistoricoDoItem>;
    semente: string | number;
    agora: number;
    diaDe: (ts: number) => number;
    urgente?: (item: T) => boolean;
    /** Cota mínima de itens NOVOS na frente (0..1 da lista final). */
    cotaDeNovas?: number;
    limite?: number;
  },
): { ordenados: T[]; excluidos: T[]; motivos: Map<string, string> } {
  const camadas: T[][] = [[], [], [], [], []];
  const adiadas: T[] = [];
  const excluidos: T[] = [];
  const motivos = new Map<string, string>();
  for (const it of itens) {
    const ref = refDe(it);
    const h = opts.memoria.get(ref);
    const e = estadoDoItem(h);
    motivos.set(ref, e.motivo);
    if (e.tag === 'leech') { excluidos.push(it); continue; }
    if (e.tag === 'errando') {
      if (prontoParaVoltar(h, opts.agora, opts.diaDe)) camadas[0].push(it); else adiadas.push(it);
      continue;
    }
    if (opts.urgente?.(it)) { camadas[1].push(it); continue; }
    camadas[e.tag === 'nova' ? 2 : e.tag === 'aprendendo' ? 3 : 4].push(it);
  }
  const emb = camadas.map((c, i) => embaralharComSemente(c, `${opts.semente}:${i}`));
  let ordenados = [...emb[0], ...emb[1], ...emb[2], ...emb[3], ...emb[4], ...embaralharComSemente(adiadas, `${opts.semente}:adiadas`)];
  // Cota de novas: garante amplitude de vocabulário quando o limite corta a lista.
  if (opts.limite && opts.cotaDeNovas && emb[2].length) {
    const querNovas = Math.min(emb[2].length, Math.ceil(opts.limite * opts.cotaDeNovas));
    const cabeca = ordenados.slice(0, opts.limite);
    const novasNaCabeca = cabeca.filter((x) => emb[2].includes(x)).length;
    if (novasNaCabeca < querNovas) {
      const faltam = emb[2].filter((x) => !cabeca.includes(x)).slice(0, querNovas - novasNaCabeca);
      const semElas = ordenados.filter((x) => !faltam.includes(x));
      ordenados = [...semElas.slice(0, opts.limite - faltam.length), ...faltam, ...semElas.slice(opts.limite - faltam.length)];
    }
  }
  return { ordenados, excluidos, motivos };
}
