/**
 * ORÇAMENTO GLOBAL DE THREADS — quantas threads do ONNX Runtime cada motor local pode usar.
 *
 * Por que existe: cada motor pedia as suas sem saber dos outros. O Whisper levava `min(núcleos, 4)`
 * e o tradutor, sem pedir nada, o padrão do ORT (`min(4, ⌈núcleos/2⌉)` com isolamento). Num desktop
 * de 8 núcleos: 4 + 4 threads de inferência, mais a thread principal — onde moram a interface E o
 * VAD — disputando os mesmos núcleos. O ORT-web divide o trabalho de cada operador entre as threads
 * do pool e espera por elas; com mais threads que núcleos, quem espera é a thread que ficou sem
 * núcleo, e a aba trava.
 *
 * A CONTA: `núcleos − 1` threads para os motores que rodam em worker (Whisper, tradutor, impressão de
 * voz); um núcleo fica para a thread principal, onde roda o VAD (o `MicVAD` do vad-web roda o ONNX
 * ali, com 1 thread — ver `ortDoVadNumaThread`). Descontados o tradutor e a voz, o resto vai ao
 * Whisper, que é quem decide se a legenda acompanha a fala:
 *
 *   whisper = clamp(núcleos − 3, 1, 4)   (teto 2 no modo leve: Quest, celular fraco, desktop modesto)
 *   mt      = 2 com 8 núcleos ou mais, senão 1
 *   vad     = 1 (thread principal)        voz = 1 (o worker do WeSpeaker já usava 1)
 *
 * Com 4 núcleos ou mais a soma cabe no teto; abaixo disso cada motor já está no mínimo (1) e não há
 * o que tirar. Sem `crossOriginIsolated` não há SharedArrayBuffer e o WASM roda em 1 thread de
 * qualquer jeito: tudo 1.
 *
 * Pura e FORA de `perfil.ts` de propósito: o perfil entra no JS inicial (marca o `<html>` antes do
 * primeiro render); isto só interessa a quem carrega modelo.
 */

export interface EntradaDoOrcamento {
  /** `navigator.hardwareConcurrency`; `null` = API ausente (conta como 4, o padrão do perfil). */
  nucleos: number | null;
  /** `crossOriginIsolated`: sem ele o ORT-web não abre threads. */
  isolado: boolean;
  /** O modo leve do perfil (`PerfilDoDispositivo.leve`). */
  leve: boolean;
}

export interface OrcamentoDeThreads {
  whisper: number;
  mt: number;
  vad: 1;
  voz: 1;
}

/** Núcleos quando o navegador não informa — o mesmo padrão de `classificarDispositivo`. */
const NUCLEOS_PADRAO = 4;
/** O teto que o worker do Whisper já aplicava (`definirThreads` em `whisperWorker.ts`). */
const TETO_DO_WHISPER = 4;
/** No modo leve o Whisper não passa disto: o aparelho é o que menos aguenta disputa. */
const TETO_DO_WHISPER_LEVE = 2;

const nucleosDe = (n: number | null): number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : NUCLEOS_PADRAO;

/** Threads para os motores em worker: todos os núcleos menos o da thread principal. */
export function tetoDeThreads(nucleos: number | null): number {
  return Math.max(1, nucleosDe(nucleos) - 1);
}

export function distribuirThreads({ nucleos, isolado, leve }: EntradaDoOrcamento): OrcamentoDeThreads {
  if (!isolado) return { whisper: 1, mt: 1, vad: 1, voz: 1 };
  const n = nucleosDe(nucleos);
  const mt = n >= 8 ? 2 : 1;
  const teto = leve ? TETO_DO_WHISPER_LEVE : TETO_DO_WHISPER;
  const whisper = Math.max(1, Math.min(n - 3, teto));
  return { whisper, mt, vad: 1, voz: 1 };
}

/** O pedaço do `ort` (o do vad-web) que `ortDoVadNumaThread` toca (`simd` aceita `'fixed' | 'relaxed'`). */
export interface OrtDoVad {
  env: { logLevel?: string; wasm: { numThreads?: number; simd?: boolean | string } };
}

/**
 * O `ortConfig` do VAD (`MicVAD.new` e `NonRealTimeVAD.new`). O Silero roda NA THREAD PRINCIPAL:
 * com mais de 1 thread o ORT abriria workers de pthread para um modelo de 1,7 MB avaliado a cada
 * 96 ms, e a thread principal não pode bloquear esperando por eles (`Atomics.wait` é proibido ali) —
 * espera girando, no lugar da interface. `logLevel: 'error'` é o padrão do vad-web, que um `ortConfig`
 * próprio substitui. Nunca lança: sem os campos, ficam os padrões do runtime.
 */
export function ortDoVadNumaThread(ort: OrtDoVad): void {
  try {
    ort.env.logLevel = 'error';
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;
  } catch {
    /* ort sem esses campos: padrões do runtime */
  }
}
