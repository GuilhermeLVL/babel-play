/**
 * O WORKER DO MICROBENCHMARK — a mesma multiplicação de matrizes em CPU e num compute shader
 * WebGPU, amostra por amostra, dentro do prazo que a página mandar (ver o porquê em `benchmark.ts`).
 *
 * Fases: CPU com ~35% do prazo, WebGPU com o resto. Cada amostra sai assim que é medida — se a
 * página encerrar o worker no prazo, o que já chegou vale. O `fim` sai SEMPRE (inclusive quando a
 * GPU falha), e nada aqui lança para fora: um adaptador ausente só significa "sem amostra webgpu".
 *
 * As funções são exportadas para o teste (o núcleo da CPU roda no Node); o `onmessage` só é ligado
 * quando este arquivo é de fato o escopo de um Worker.
 */
import type { AmostraDoBenchmark, MensagemDoBenchmark } from './benchmark';

/** Lado da matriz na CPU: 2·128³ ≈ 4,2 MFLOP por multiplicação (poucos ms num desktop). */
const N_CPU = 128;
/** Lado da matriz na GPU: 2·256³ ≈ 33,5 MFLOP por passada. */
const N_GPU = 256;
/** Passadas por envio à fila — amortiza o custo fixo do `submit` sem estourar o prazo num iGPU lento. */
const PASSADAS_POR_ENVIO = 8;

/** C = A·B (n×n, linha-maior), ordem i-k-j para andar na memória em sequência. */
export function matmulCpu(n: number, a: Float32Array, b: Float32Array, c: Float32Array): void {
  c.fill(0);
  for (let i = 0; i < n; i++) {
    const li = i * n;
    for (let k = 0; k < n; k++) {
      const aik = a[li + k];
      const lk = k * n;
      for (let j = 0; j < n; j++) c[li + j] += aik * b[lk + j];
    }
  }
}

function matrizFixa(n: number, semente: number): Float32Array {
  const m = new Float32Array(n * n);
  for (let i = 0; i < m.length; i++) m[i] = ((i * 31 + semente) % 97) / 97 - 0.5;
  return m;
}

/**
 * Amostras de CPU até o orçamento acabar. Cada amostra junta multiplicações até ≥ ~20 ms (um
 * relógio de 1 ms com amostra de 3 ms seria ruído puro).
 */
export function medirCpu(orcamentoMs: number, agora: () => number, n = N_CPU): AmostraDoBenchmark[] {
  const a = matrizFixa(n, 1);
  const b = matrizFixa(n, 7);
  const c = new Float32Array(n * n);
  const flopsPorMatmul = 2 * n * n * n;
  const amostras: AmostraDoBenchmark[] = [];
  const inicio = agora();
  matmulCpu(n, a, b, c); // aquece o JIT fora da medida
  while (agora() - inicio < orcamentoMs) {
    const t0 = agora();
    let vezes = 0;
    let t1: number;
    do {
      matmulCpu(n, a, b, c);
      vezes++;
      t1 = agora();
    } while (t1 - t0 < 20 && t1 - inicio < orcamentoMs);
    amostras.push({ backend: 'wasm', flops: flopsPorMatmul * vezes, ms: t1 - t0 });
  }
  return amostras;
}

/* Os tipos da WebGPU não estão no projeto (lib DOM sem @webgpu/types): só o pedaço usado aqui. */
interface BufferGpu {
  destroy(): void;
}
interface DispositivoGpu {
  createBuffer(d: { size: number; usage: number; mappedAtCreation?: boolean }): BufferGpu & {
    getMappedRange(): ArrayBuffer;
    unmap(): void;
  };
  createShaderModule(d: { code: string }): unknown;
  createComputePipeline(d: { layout: 'auto'; compute: { module: unknown; entryPoint: string } }): {
    getBindGroupLayout(i: number): unknown;
  };
  createBindGroup(d: { layout: unknown; entries: { binding: number; resource: { buffer: BufferGpu } }[] }): unknown;
  createCommandEncoder(): {
    beginComputePass(): {
      setPipeline(p: unknown): void;
      setBindGroup(i: number, g: unknown): void;
      dispatchWorkgroups(x: number, y: number): void;
      end(): void;
    };
    finish(): unknown;
  };
  queue: { submit(c: unknown[]): void; onSubmittedWorkDone(): Promise<void> };
  destroy(): void;
}
interface GpuDoWorker {
  requestAdapter?: () => Promise<{ requestDevice(): Promise<DispositivoGpu> } | null>;
}

/* GPUBufferUsage.STORAGE | COPY_DST — as constantes, para não depender do global no teste. */
const USO_STORAGE = 0x80;
const USO_COPY_DST = 0x08;

function shaderDaMatmul(n: number): string {
  return `
@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read> b: array<f32>;
@group(0) @binding(2) var<storage, read_write> c: array<f32>;
const N: u32 = ${n}u;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= N || id.y >= N) { return; }
  var s = 0.0;
  for (var k = 0u; k < N; k = k + 1u) { s = s + a[id.y * N + k] * b[k * N + id.x]; }
  c[id.y * N + id.x] = s;
}`;
}

/**
 * Amostras do compute shader até o orçamento acabar. `[]` sem adaptador/dispositivo ou em qualquer
 * falha da GPU — a falha é o próprio sinal ("este aparelho não tem WebGPU utilizável").
 */
export async function medirWebGpu(
  gpu: GpuDoWorker | undefined,
  orcamentoMs: number,
  agora: () => number,
  n = N_GPU,
): Promise<AmostraDoBenchmark[]> {
  if (typeof gpu?.requestAdapter !== 'function' || orcamentoMs <= 0) return [];
  const amostras: AmostraDoBenchmark[] = [];
  let dispositivo: DispositivoGpu | null = null;
  try {
    const inicio = agora();
    const adaptador = await gpu.requestAdapter();
    if (!adaptador) return [];
    dispositivo = await adaptador.requestDevice();
    const d = dispositivo;
    const bytes = n * n * 4;
    const buffer = (dados: Float32Array | null) => {
      const buf = d.createBuffer({ size: bytes, usage: USO_STORAGE | USO_COPY_DST, mappedAtCreation: !!dados });
      if (dados) {
        new Float32Array(buf.getMappedRange()).set(dados);
        buf.unmap();
      }
      return buf;
    };
    const bufs = [buffer(matrizFixa(n, 1)), buffer(matrizFixa(n, 7)), buffer(null)];
    const pipeline = d.createComputePipeline({
      layout: 'auto',
      compute: { module: d.createShaderModule({ code: shaderDaMatmul(n) }), entryPoint: 'main' },
    });
    const grupo = d.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: bufs.map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    const grupos = Math.ceil(n / 8);
    const enviar = async (passadas: number) => {
      const enc = d.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, grupo);
      for (let p = 0; p < passadas; p++) pass.dispatchWorkgroups(grupos, grupos);
      pass.end();
      d.queue.submit([enc.finish()]);
      await d.queue.onSubmittedWorkDone();
    };
    await enviar(1); // compila o pipeline e sobe os buffers fora da medida
    const flopsPorPassada = 2 * n * n * n;
    while (agora() - inicio < orcamentoMs) {
      const t0 = agora();
      await enviar(PASSADAS_POR_ENVIO);
      amostras.push({ backend: 'webgpu', flops: flopsPorPassada * PASSADAS_POR_ENVIO, ms: agora() - t0 });
    }
    for (const b of bufs) b.destroy();
  } catch (erro) {
    console.warn('[benchmark] WebGPU falhou no meio da medida; vale o que já foi medido', erro);
  } finally {
    dispositivo?.destroy();
  }
  return amostras;
}

/** As duas fases, dentro do prazo. Sempre termina com `{ tipo: 'fim' }`. */
export async function executarBenchmark(
  prazoMs: number,
  enviar: (m: MensagemDoBenchmark) => void,
  escopo: unknown = globalThis,
  agora: () => number = () => performance.now(),
): Promise<void> {
  const inicio = agora();
  try {
    for (const amostra of medirCpu(prazoMs * 0.35, agora)) enviar({ tipo: 'amostra', amostra });
    const gpu = (escopo as { navigator?: { gpu?: GpuDoWorker } }).navigator?.gpu;
    const resto = prazoMs - (agora() - inicio);
    for (const amostra of await medirWebGpu(gpu, resto, agora)) enviar({ tipo: 'amostra', amostra });
  } finally {
    enviar({ tipo: 'fim' });
  }
}

/* Só liga o ouvinte no escopo de um Worker de verdade (no teste este arquivo é importado no Node). */
const escopoDoWorker = globalThis as unknown as {
  WorkerGlobalScope?: unknown;
  postMessage?: (m: MensagemDoBenchmark) => void;
  onmessage?: ((e: MessageEvent<{ prazoMs?: number }>) => void) | null;
};
if (typeof escopoDoWorker.WorkerGlobalScope !== 'undefined' && typeof escopoDoWorker.postMessage === 'function') {
  escopoDoWorker.onmessage = (e) => {
    const prazo = typeof e.data?.prazoMs === 'number' ? e.data.prazoMs : 2700;
    void executarBenchmark(prazo, (m) => escopoDoWorker.postMessage!(m));
  };
}
