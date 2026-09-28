/**
 * MICROBENCHMARK DO APARELHO — quanto de conta ESTE aparelho faz em WebGPU e em CPU (harness
 * adaptativo §2, `openspec/audits/2026-09-28-eficiencia-ia/harness-adaptativo.md`).
 *
 * Por que medir em vez de supor: a literatura mostra WebGPU PERDENDO para WASM em Whisper em parte
 * dos aparelhos (driver, iGPU compartilhada, cópia de buffer), e o adaptador existir não diz nada
 * sobre a vazão. Sem baixar modelo nenhum, o worker (`benchmark.worker.ts`) roda uma multiplicação
 * de matrizes fixa nos dois motores e devolve amostras; aqui elas viram GFLOP/s por motor.
 *
 * O QUE O NÚMERO É: uma pontuação RELATIVA do mesmo núcleo nos dois lados, para comparar os motores
 * NESTE aparelho — não é RTF, não compara aparelhos entre si. O lado "wasm" é um laço JS em
 * `Float32Array` (o JIT chega perto do WASM escalar; o ONNX Runtime com SIMD e threads faz mais):
 * o sinal é de ordem de grandeza. A troca prevista é pôr no worker uma rodada curta do encoder do
 * modelo real e manter esta mesma forma de amostra — o `pontuarBenchmark` não muda.
 *
 * ORÇAMENTO: ≤ 3 s no total, num worker (nunca trava a tela), cancelável por `AbortSignal` (a
 * captura que começou a carregar modelo não pode disputar GPU com a medida). Estourou o prazo, o
 * worker é encerrado e vale o que chegou.
 */

export type MotorDoBenchmark = 'wasm' | 'webgpu';

/** Uma medida: `flops` operações de ponto flutuante em `ms` milissegundos num motor. */
export interface AmostraDoBenchmark {
  backend: MotorDoBenchmark;
  flops: number;
  ms: number;
}

/** O protocolo do worker: amostras conforme saem, e um `fim`. */
export type MensagemDoBenchmark = { tipo: 'amostra'; amostra: AmostraDoBenchmark } | { tipo: 'fim' };

export interface PontuacaoDoBenchmark {
  /** GFLOP/s (mediana) da matmul na CPU; `null` sem amostra válida. */
  pontuacaoWasm: number | null;
  /** GFLOP/s (mediana) da matmul no compute shader; `null` sem adaptador ou sem amostra. */
  pontuacaoWebgpu: number | null;
  /** O motor mais rápido NESTE núcleo; `null` quando nenhum mediu. */
  melhor: MotorDoBenchmark | null;
  /** Quando foi medido (ms desde a época), para revalidar junto com a sonda. */
  medidoEm: number;
  /** Quanto a medida levou de verdade. */
  duracaoMs: number;
}

/** Teto do benchmark inteiro (CPU + GPU + subir o worker). */
export const PRAZO_DO_BENCHMARK_MS = 3000;

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Amostras → pontuação. Pura: amostra com `ms ≤ 0`, `flops ≤ 0` ou não finita é descartada. */
export function pontuarBenchmark(
  amostras: AmostraDoBenchmark[],
  medidoEm: number,
  duracaoMs: number,
): PontuacaoDoBenchmark {
  const gflops = (motor: MotorDoBenchmark) => {
    const v = amostras
      .filter(
        (a) => a.backend === motor && Number.isFinite(a.flops) && Number.isFinite(a.ms) && a.flops > 0 && a.ms > 0,
      )
      .map((a) => a.flops / a.ms / 1e6); // flops/ms ÷ 1e6 = GFLOP/s
    const m = mediana(v);
    return m == null ? null : Math.round(m * 100) / 100;
  };
  const pontuacaoWasm = gflops('wasm');
  const pontuacaoWebgpu = gflops('webgpu');
  const melhor =
    pontuacaoWasm == null && pontuacaoWebgpu == null
      ? null
      : (pontuacaoWebgpu ?? -1) > (pontuacaoWasm ?? -1)
        ? 'webgpu'
        : 'wasm';
  return { pontuacaoWasm, pontuacaoWebgpu, melhor, medidoEm, duracaoMs };
}

/** O pedaço do `Worker` que a orquestração usa (injetável nos testes). */
export interface WorkerDoBenchmark {
  onmessage: ((e: MessageEvent<MensagemDoBenchmark>) => void) | null;
  onerror: ((e: unknown) => void) | null;
  postMessage(m: unknown): void;
  terminate(): void;
}

export interface OpcoesDoBenchmark {
  sinal?: AbortSignal;
  prazoMs?: number;
  criarWorker?: () => WorkerDoBenchmark;
  agora?: () => number;
}

function criarWorkerPadrao(): WorkerDoBenchmark {
  return new Worker(new URL('./benchmark.worker.ts', import.meta.url), { type: 'module' }) as WorkerDoBenchmark;
}

/**
 * Roda o benchmark num worker e devolve a pontuação. `null` quando abortado, sem `Worker` ou
 * quando o worker nem sobe (CSP, navegador antigo). Nunca lança.
 */
export function medirBenchmark(opcoes: OpcoesDoBenchmark = {}): Promise<PontuacaoDoBenchmark | null> {
  const { sinal, prazoMs = PRAZO_DO_BENCHMARK_MS, criarWorker = criarWorkerPadrao, agora = Date.now } = opcoes;
  if (sinal?.aborted) return Promise.resolve(null);
  let worker: WorkerDoBenchmark;
  try {
    worker = criarWorker();
  } catch (erro) {
    console.warn('[benchmark] worker não subiu; o aparelho fica sem pontuação', erro);
    return Promise.resolve(null);
  }
  const inicio = agora();
  const amostras: AmostraDoBenchmark[] = [];
  return new Promise((resolve) => {
    let feito = false;
    const concluir = (abortado: boolean) => {
      if (feito) return;
      feito = true;
      clearTimeout(relogio);
      sinal?.removeEventListener('abort', aoAbortar);
      worker.terminate();
      resolve(abortado ? null : pontuarBenchmark(amostras, inicio, Math.max(0, agora() - inicio)));
    };
    const aoAbortar = () => concluir(true);
    const relogio = setTimeout(() => concluir(false), prazoMs);
    sinal?.addEventListener('abort', aoAbortar, { once: true });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m?.tipo === 'amostra') amostras.push(m.amostra);
      else if (m?.tipo === 'fim') concluir(false);
    };
    worker.onerror = () => concluir(false);
    // O worker dá a si mesmo um pouco menos que o prazo: sobra tempo para as últimas amostras chegarem.
    worker.postMessage({ prazoMs: Math.max(0, prazoMs - 300) });
  });
}
