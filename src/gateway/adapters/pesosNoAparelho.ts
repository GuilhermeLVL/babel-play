/**
 * OS PESOS DE UM MOTOR DE VOZ NO APARELHO — o que os workers da Supertonic (`supertonicLocal.worker.ts`) e do Kitten
 * (`kittenLocal.worker.ts`) têm em comum: a pasta no OPFS, o download retomável por `Range` com tamanho e sha256
 * conferidos (o arquivo só vira "pronto" com a marca `<nome>.ok`), a leitura conferida e o `onnxruntime-web`.
 *
 * Sem efeito ao importar: cada worker monta o seu protocolo e liga o `self.onmessage`.
 */
import { baseDoWasm } from '../baseDoWasm';

/* ───────── armazenamento (OPFS) ───────── */

export interface ArquivoDaPasta {
  tamanho(): number;
  escrever(b: Uint8Array, em: number): void;
  ler(): Uint8Array;
  truncar(n: number): void;
  fechar(): void;
}

export interface PastaDaVoz {
  abrir(nome: string): Promise<ArquivoDaPasta>;
  /** O sha256 gravado ao conferir o arquivo, ou `null`. */
  marca(nome: string): Promise<string | null>;
  marcar(nome: string, sha256: string): Promise<void>;
  apagarTudo(): Promise<void>;
}

/* ───────── runtime ───────── */

export interface TensorDaVoz {
  data: ArrayLike<number> | ArrayLike<bigint> | Float32Array;
  dims: readonly number[];
}
export interface SessaoDaVoz {
  run(entradas: Record<string, unknown>): Promise<Record<string, TensorDaVoz>>;
  release(): Promise<void>;
  readonly outputNames?: readonly string[];
}
export interface RuntimeDaVoz {
  criarSessao(bytes: Uint8Array, ep: 'webgpu' | 'wasm'): Promise<SessaoDaVoz>;
  tensor(tipo: 'float32' | 'int64', dados: Float32Array | BigInt64Array, dims: number[]): unknown;
}

export class Cancelado extends Error {}

/** O que um arquivo precisa para ser baixado e conferido. */
export interface ArquivoConferido {
  /** Nome no disco (sem barras). */
  nome: string;
  url: string;
  bytes: number;
  sha256: string;
  /** Para a mensagem de erro. */
  rotulo: string;
}

export interface DependenciasDoDownload {
  buscar: (url: string, init: RequestInit) => Promise<Response>;
  sha256: (b: Uint8Array) => Promise<string>;
}

/** Baixa (retomando do que já existe) e confere um arquivo; já conferido, só soma os bytes. */
export async function baixarArquivoConferido(
  d: DependenciasDoDownload,
  pasta: PastaDaVoz,
  a: ArquivoConferido,
  sinal: AbortSignal,
  somar: (n: number) => void,
): Promise<void> {
  if ((await pasta.marca(a.nome)) === a.sha256) return somar(a.bytes);
  const f = await pasta.abrir(a.nome);
  try {
    let tem = f.tamanho();
    if (tem > a.bytes) {
      f.truncar(0);
      tem = 0;
    }
    if (tem < a.bytes) {
      const r = await d.buscar(a.url, { signal: sinal, ...(tem > 0 ? { headers: { Range: `bytes=${tem}-` } } : {}) });
      if (r.status === 206) somar(tem);
      else if (r.ok) {
        f.truncar(0); // o servidor ignorou o Range: recomeça do zero
        tem = 0;
      } else throw new Error(`HTTP ${r.status} em ${a.rotulo}`);
      const leitor = r.body?.getReader();
      if (!leitor) throw new Error(`resposta sem corpo em ${a.rotulo}`);
      for (;;) {
        if (sinal.aborted) throw new Cancelado('cancelado');
        const { done, value } = await leitor.read();
        if (done) break;
        if (tem + value.byteLength > a.bytes) throw new Error(`${a.rotulo}: maior que o esperado`);
        f.escrever(value, tem);
        tem += value.byteLength;
        somar(value.byteLength);
      }
    } else somar(a.bytes);
    if (f.tamanho() !== a.bytes) throw new Error(`${a.rotulo}: tamanho ${f.tamanho()} ≠ ${a.bytes}`);
    const hash = await d.sha256(f.ler());
    if (hash !== a.sha256) {
      f.truncar(0);
      throw new Error(`${a.rotulo}: sha256 não confere`);
    }
    await pasta.marcar(a.nome, hash);
  } finally {
    f.fechar();
  }
}

/** Lê um arquivo já conferido (a marca precisa bater com o sha256 da lista). */
export async function lerConferido(
  pasta: PastaDaVoz,
  nome: string,
  sha256: string,
  rotulo: string,
): Promise<Uint8Array> {
  if ((await pasta.marca(nome)) !== sha256) throw new Error(`modelo não está no aparelho (${rotulo})`);
  const f = await pasta.abrir(nome);
  try {
    return f.ler();
  } finally {
    f.fechar();
  }
}

export const ehCancelamento = (e: unknown): boolean =>
  e instanceof Cancelado || (e instanceof DOMException && e.name === 'AbortError');

/* ───────── as implementações de verdade (só no worker) ───────── */

interface AlcaSincrona {
  getSize(): number;
  write(b: Uint8Array, o: { at: number }): number;
  read(b: Uint8Array, o: { at: number }): number;
  truncate(n: number): void;
  flush(): void;
  close(): void;
}
type ArquivoOpfs = FileSystemFileHandle & { createSyncAccessHandle(): Promise<AlcaSincrona> };

/** A pasta `nomeDaPasta` na raiz do OPFS (alças síncronas: só em worker). */
export async function pastaOpfs(nomeDaPasta: string): Promise<PastaDaVoz> {
  const raiz = await navigator.storage.getDirectory();
  const pasta = await raiz.getDirectoryHandle(nomeDaPasta, { create: true });
  const lerTexto = async (nome: string) => {
    try {
      const f = await (await pasta.getFileHandle(nome)).getFile();
      return (await f.text()).trim();
    } catch {
      return null;
    }
  };
  return {
    async abrir(nome) {
      const h = await ((await pasta.getFileHandle(nome, { create: true })) as ArquivoOpfs).createSyncAccessHandle();
      return {
        tamanho: () => h.getSize(),
        escrever: (b, em) => void h.write(b, { at: em }),
        ler: () => {
          const b = new Uint8Array(h.getSize());
          h.read(b, { at: 0 });
          return b;
        },
        truncar: (n) => h.truncate(n),
        fechar: () => {
          h.flush();
          h.close();
        },
      };
    },
    marca: (nome) => lerTexto(`${nome}.ok`),
    async marcar(nome, sha) {
      const h = await (
        (await pasta.getFileHandle(`${nome}.ok`, { create: true })) as ArquivoOpfs
      ).createSyncAccessHandle();
      h.truncate(0);
      h.write(new TextEncoder().encode(sha), { at: 0 });
      h.flush();
      h.close();
    },
    async apagarTudo() {
      await raiz.removeEntry(nomeDaPasta, { recursive: true }).catch(() => undefined);
    },
  };
}

export async function sha256Hex(b: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource));
  return Array.from(h, (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * O `onnxruntime-web` padrão (runtime JSEP: WebGPU e WASM), o MESMO do transformers.js, por `import()`. O `.wasm` vem de
 * `baseDoWasm()` (o app já serve `ort-wasm-simd-threaded.jsep.*` na raiz).
 */
export async function abrirRuntime(threads: number): Promise<RuntimeDaVoz> {
  const ort = await import('onnxruntime-web');
  ort.env.wasm.wasmPaths = baseDoWasm();
  ort.env.wasm.numThreads = Math.max(1, Math.min(4, Math.floor(threads) || 1));
  return {
    criarSessao: (bytes, ep) =>
      ort.InferenceSession.create(bytes, {
        executionProviders: [ep],
        graphOptimizationLevel: 'all',
        logSeverityLevel: 3, // o aviso de "nós de forma na CPU" do WebGPU é esperado e só poluía o console
      }) as unknown as Promise<SessaoDaVoz>,
    tensor: (tipo, dados, dims) => new ort.Tensor(tipo, dados as never, dims),
  };
}

/** Há um adaptador WebGPU de verdade? (o adaptador por software do Chromium sem GPU é 100× mais lento que o WASM) */
export async function temWebGpu(): Promise<boolean> {
  const gpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter(): Promise<{ info?: { isFallbackAdapter?: boolean } } | null> };
    }
  ).gpu;
  if (!gpu) return false;
  try {
    const a = await gpu.requestAdapter();
    return !!a && a.info?.isFallbackAdapter !== true;
  } catch {
    return false;
  }
}
