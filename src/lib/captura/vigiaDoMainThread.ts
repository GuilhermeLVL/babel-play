/**
 * O VIGIA DO MAIN THREAD — quanto a TELA ficou travada nos últimos segundos ("Grátis sem travar", A6).
 *
 * POR QUE EXISTE. O regulador de desempenho (`core/harness/reguladorDeDesempenho.ts`) só olhava o
 * modelo: RTF, fila, latência. No aparelho fraco o sintoma que a pessoa sente vem antes — a aba
 * congela (o React re-renderizando a tela inteira, a tradução, os parciais) e o toque não responde,
 * mesmo com a legenda ainda chegando. Esse sintoma o navegador mede: quadros longos no main thread.
 *
 * O QUE MEDE. A soma do tempo de BLOQUEIO dos quadros longos que terminaram numa janela:
 *   · `long-animation-frame` (LoAF, Chromium 123+) — o `blockingDuration` de cada quadro, que já é a
 *     conta do TBT: o que cada tarefa longa passou de 50 ms, mais a renderização;
 *   · `longtask` onde não há LoAF — o que cada tarefa passou de 50 ms (a mesma conta, sem a pintura).
 * Onde nenhum dos dois existe (Safari, Firefox), o vigia é um no-op: `suportado` é falso e o bloqueio
 * é sempre 0 — o gatilho some, o resto do regulador segue igual.
 *
 * O QUE NÃO CONTA: a ABERTURA DO VAD (A6c, medido em 30/09/2026). `MicVAD.new` cria a sessão do
 * Silero, e a 1ª sessão do ORT da página instancia o WASM de 12 MB NA THREAD PRINCIPAL: um quadro de
 * ~170 ms no desktop e ~880 ms com a CPU 4× mais lenta, sem script atribuído no LoAF (é o V8
 * instanciando o módulo, não JS). Acontece uma vez, antes da 1ª fala, e cortar parciais não o cura; na
 * bancada ele disparava o `travamento` já no 1º parcial da sessão. A captura marca o intervalo
 * (`marcarAberturaDoVad`, uma medida do User Timing, que o DevTools também mostra) e o quadro que
 * COMEÇA dentro dele sai da soma. Qualquer outro quadro, antes ou depois, continua contando.
 *
 * Um por página (`vigiaDoMainThread()`), preguiçoso como os sinais de bateria/pressão; o observador
 * é injetável para os testes. Nunca lança.
 */

type TipoObservado = 'long-animation-frame' | 'longtask';

/** O nome da medida (User Timing) que marca a abertura do VAD — ver o cabeçalho. */
export const MEDIDA_DA_ABERTURA_DO_VAD = 'babel:abertura-do-vad';

/** Um intervalo (relógio de `performance.now()`) em que um quadro longo é esperado e não é travamento. */
export interface QuadroConhecido {
  inicioMs: number;
  fimMs: number;
}

/**
 * A captura abriu o VAD entre `inicioMs` e `fimMs`: o quadro longo que começar aí é a instanciação do
 * WASM do Silero, não travamento (ver o cabeçalho). Nunca lança: sem User Timing de nível 3 (medida com
 * início e fim), o quadro volta a contar, como antes.
 */
export function marcarAberturaDoVad(inicioMs: number, fimMs: number): void {
  try {
    globalThis.performance?.measure(MEDIDA_DA_ABERTURA_DO_VAD, { start: inicioMs, end: fimMs });
  } catch {
    /* navegador sem medida com opções, ou valores inválidos */
  }
}

/** As aberturas do VAD que a captura marcou nesta página. */
function aberturasDoVadMarcadas(): QuadroConhecido[] {
  try {
    return globalThis.performance
      .getEntriesByName(MEDIDA_DA_ABERTURA_DO_VAD, 'measure')
      .map((m) => ({ inicioMs: m.startTime, fimMs: m.startTime + m.duration }));
  } catch {
    return [];
  }
}

/** O pedaço de `PerformanceEntry` (e do `PerformanceLongAnimationFrameTiming`) que o vigia lê. */
interface QuadroLongo {
  startTime: number;
  duration: number;
  blockingDuration?: number;
}

/** O formato de `PerformanceObserver` que o vigia usa — estrutural, para o teste injetar um falso. */
export interface ObservadorDePerformance {
  new (cb: (lista: { getEntries(): readonly QuadroLongo[] }) => void): {
    observe(o: { type: string; buffered?: boolean }): void;
    disconnect(): void;
  };
  readonly supportedEntryTypes?: readonly string[];
}

export interface VigiaDoMainThread {
  /** O navegador mede quadros longos (LoAF ou longtask) e o observador foi aceito. */
  readonly suportado: boolean;
  /** Bloqueio (ms) somado dos quadros longos que TERMINARAM nos últimos `janelaMs`. */
  bloqueioRecenteMs(janelaMs: number): number;
  /** Quantos quadros estão guardados (diagnóstico: a memória é limitada). */
  guardados(): number;
  parar(): void;
}

/** O que se guarda: nenhuma janela útil passa de 1 min (o regulador pede 10 s). */
const RETENCAO_MS = 60_000;
/** Teto de segurança: um aparelho travado o tempo todo não faz o vetor crescer sem limite. */
const MAXIMO_GUARDADO = 1_000;
/** Acima disto uma tarefa é "longa" — a definição da própria Long Tasks API. */
const TAREFA_LONGA_MS = 50;

const NO_OP: VigiaDoMainThread = {
  suportado: false,
  bloqueioRecenteMs: () => 0,
  guardados: () => 0,
  parar: () => undefined,
};

export function criarVigiaDoMainThread(
  opts: {
    Observador?: ObservadorDePerformance | null;
    agoraMs?: () => number;
    /** Os intervalos de quadro longo esperado; de fábrica, as aberturas do VAD marcadas. */
    quadrosConhecidos?: () => readonly QuadroConhecido[];
  } = {},
): VigiaDoMainThread {
  const Observador =
    opts.Observador === undefined
      ? (globalThis as { PerformanceObserver?: ObservadorDePerformance }).PerformanceObserver
      : opts.Observador;
  const agoraMs = opts.agoraMs ?? (() => globalThis.performance?.now() ?? Date.now());
  const quadrosConhecidos = opts.quadrosConhecidos ?? aberturasDoVadMarcadas;
  if (typeof Observador !== 'function') return NO_OP;
  const tipos = Observador.supportedEntryTypes ?? [];
  const tipo: TipoObservado | null = tipos.includes('long-animation-frame')
    ? 'long-animation-frame'
    : tipos.includes('longtask')
      ? 'longtask'
      : null;
  if (!tipo) return NO_OP;

  /** Início e fim do quadro (relógio de `performance.now()`) e quanto ele bloqueou. */
  let bloqueios: Array<{ inicioMs: number; fimMs: number; ms: number }> = [];
  const esquecerAntigos = () => {
    const limite = agoraMs() - RETENCAO_MS;
    let i = 0;
    while (i < bloqueios.length && bloqueios[i].fimMs < limite) i++;
    if (i > 0) bloqueios.splice(0, i);
    if (bloqueios.length > MAXIMO_GUARDADO) bloqueios.splice(0, bloqueios.length - MAXIMO_GUARDADO);
  };

  let observador: InstanceType<ObservadorDePerformance>;
  try {
    observador = new Observador((lista) => {
      for (const q of lista.getEntries()) {
        const ms =
          tipo === 'long-animation-frame' && typeof q.blockingDuration === 'number'
            ? q.blockingDuration
            : q.duration - TAREFA_LONGA_MS;
        if (ms > 0) bloqueios.push({ inicioMs: q.startTime, fimMs: q.startTime + q.duration, ms });
      }
      esquecerAntigos();
    });
    /* `buffered`: os quadros de antes do vigia existir também contam — ele nasce na primeira medida
       da captura, e a tela pode ter travado justo ao abrir o microfone. */
    observador.observe({ type: tipo, buffered: true });
  } catch {
    return NO_OP; // política recusou, ou o navegador aceita o tipo só no nome
  }

  return {
    suportado: true,
    bloqueioRecenteMs(janelaMs) {
      const desde = agoraMs() - janelaMs;
      // Lidos a cada pergunta: a abertura do VAD é marcada no FIM do `MicVAD.new`, depois do quadro.
      const conhecidos = quadrosConhecidos();
      const esperado = (b: { inicioMs: number }) =>
        conhecidos.some((c) => b.inicioMs >= c.inicioMs && b.inicioMs <= c.fimMs);
      let soma = 0;
      for (const b of bloqueios) if (b.fimMs >= desde && !esperado(b)) soma += b.ms;
      return Math.round(soma);
    },
    guardados: () => bloqueios.length,
    parar() {
      try {
        observador.disconnect();
      } catch {
        /* já desconectado */
      }
      bloqueios = [];
    },
  };
}

let daPagina: VigiaDoMainThread | null = null;

/** O vigia desta página, criado na primeira pergunta (a captura regulando) e mantido vivo. */
export function vigiaDoMainThread(): VigiaDoMainThread {
  daPagina ??= criarVigiaDoMainThread();
  return daPagina;
}
