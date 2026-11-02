/**
 * O WORKER DA VOZ NO APARELHO (Supertonic 3, openspec `voz-no-aparelho`). Tudo que pesa fica aqui, fora da thread
 * principal: o download dos pesos para o OPFS (retomável por `Range`, tamanho e sha256 conferidos), as sessões do
 * `onnxruntime-web` (o MESMO pacote do app: WebGPU pelo runtime JSEP, com queda automática para WASM) e a síntese.
 *
 * A thread principal recebe só o PCM de cada frase (transferido, sem cópia). Liberar a memória é `terminate()` deste
 * worker (o heap do WASM e as sessões só voltam ao sistema assim, como em `memoriaDosModelos.ts`).
 *
 * O protocolo é montado por `criarWorkerDaVoz(deps)`, sem `self`: o teste entra com OPFS, rede e runtime falsos.
 */
import {
  type ArquivoDoSupertonic,
  ARQUIVOS_DO_SUPERTONIC,
  BYTES_DO_SUPERTONIC,
  emendar,
  idiomaDoSupertonic,
  idsDoTexto,
  PASSOS_DO_SUPERTONIC,
  textoParaOModelo,
  trechosParaSintese,
  VOZES_DO_SUPERTONIC,
} from '../../core/voz/supertonic';
import { baseDoWasm } from '../baseDoWasm';

/* ───────── protocolo ───────── */

export type MensagemParaAVoz =
  | { tipo: 'baixar'; id: number; raiz: string }
  | { tipo: 'cancelar' }
  | { tipo: 'carregar'; id: number; threads: number; webgpu: boolean }
  | { tipo: 'sintetizar'; id: number; texto: string; idioma: string; voz: string; velocidade: number }
  | { tipo: 'apagar'; id: number };

export type MensagemDaVoz =
  | { tipo: 'progresso'; id: number; recebidos: number; total: number }
  | { tipo: 'ok'; id: number; backend?: string; pcm?: Float32Array; taxa?: number; ms?: number; trechos?: number }
  | { tipo: 'erro'; id: number; mensagem: string; cancelado?: boolean };

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
  data: ArrayLike<number> | Float32Array;
  dims: readonly number[];
}
export interface SessaoDaVoz {
  run(entradas: Record<string, unknown>): Promise<Record<string, TensorDaVoz>>;
  release(): Promise<void>;
}
export interface RuntimeDaVoz {
  criarSessao(bytes: Uint8Array, ep: 'webgpu' | 'wasm'): Promise<SessaoDaVoz>;
  tensor(tipo: 'float32' | 'int64', dados: Float32Array | BigInt64Array, dims: number[]): unknown;
}

export interface DependenciasDaVoz {
  buscar: (url: string, init: RequestInit) => Promise<Response>;
  abrirPasta: () => Promise<PastaDaVoz>;
  abrirRuntime: (threads: number) => Promise<RuntimeDaVoz>;
  temWebGpu: () => Promise<boolean>;
  sha256: (b: Uint8Array) => Promise<string>;
  enviar: (m: MensagemDaVoz, transferir?: Transferable[]) => void;
  agora?: () => number;
}

const nomeNoDisco = (a: ArquivoDoSupertonic) => a.caminho.replace(/\//g, '__');

class Cancelado extends Error {}

interface Modelo {
  backend: 'webgpu' | 'wasm';
  rt: RuntimeDaVoz;
  sessoes: Record<'duration_predictor' | 'text_encoder' | 'vector_estimator' | 'vocoder', SessaoDaVoz>;
  cfg: {
    ae: { sample_rate: number; base_chunk_size: number };
    ttl: { chunk_compress_factor: number; latent_dim: number };
  };
  indexador: number[];
  estilos: Map<string, { ttl: unknown; dp: unknown }>;
}

const MODELOS = ['duration_predictor', 'text_encoder', 'vector_estimator', 'vocoder'] as const;

function gauss(): number {
  const u1 = Math.max(1e-4, Math.random());
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * Math.random());
}

export function criarWorkerDaVoz(d: DependenciasDaVoz) {
  const agora = d.agora ?? (() => performance.now());
  let download: AbortController | null = null;
  let modelo: Modelo | null = null;

  async function baixarArquivo(
    pasta: PastaDaVoz,
    a: ArquivoDoSupertonic,
    raiz: string,
    sinal: AbortSignal,
    somar: (n: number) => void,
  ): Promise<void> {
    const nome = nomeNoDisco(a);
    if ((await pasta.marca(nome)) === a.sha256) return somar(a.bytes);
    const f = await pasta.abrir(nome);
    try {
      let tem = f.tamanho();
      if (tem > a.bytes) {
        f.truncar(0);
        tem = 0;
      }
      if (tem < a.bytes) {
        const url = `${raiz.replace(/\/+$/, '')}/${a.caminho}`;
        const r = await d.buscar(url, { signal: sinal, ...(tem > 0 ? { headers: { Range: `bytes=${tem}-` } } : {}) });
        if (r.status === 206) somar(tem);
        else if (r.ok) {
          f.truncar(0); // o servidor ignorou o Range: recomeça do zero
          tem = 0;
        } else throw new Error(`HTTP ${r.status} em ${a.caminho}`);
        const leitor = r.body?.getReader();
        if (!leitor) throw new Error(`resposta sem corpo em ${a.caminho}`);
        for (;;) {
          if (sinal.aborted) throw new Cancelado('cancelado');
          const { done, value } = await leitor.read();
          if (done) break;
          if (tem + value.byteLength > a.bytes) throw new Error(`${a.caminho}: maior que o esperado`);
          f.escrever(value, tem);
          tem += value.byteLength;
          somar(value.byteLength);
        }
      } else somar(a.bytes);
      if (f.tamanho() !== a.bytes) throw new Error(`${a.caminho}: tamanho ${f.tamanho()} ≠ ${a.bytes}`);
      const hash = await d.sha256(f.ler());
      if (hash !== a.sha256) {
        f.truncar(0);
        throw new Error(`${a.caminho}: sha256 não confere`);
      }
      await pasta.marcar(nome, hash);
    } finally {
      f.fechar();
    }
  }

  async function baixar(id: number, raiz: string): Promise<void> {
    download?.abort();
    const ctl = new AbortController();
    download = ctl;
    const pasta = await d.abrirPasta();
    let recebidos = 0;
    let ultimo = 0;
    const somar = (n: number) => {
      recebidos += n;
      const t = agora();
      if (t - ultimo > 100 || recebidos >= BYTES_DO_SUPERTONIC) {
        ultimo = t;
        d.enviar({ tipo: 'progresso', id, recebidos, total: BYTES_DO_SUPERTONIC });
      }
    };
    try {
      for (const a of ARQUIVOS_DO_SUPERTONIC) await baixarArquivo(pasta, a, raiz, ctl.signal, somar);
    } finally {
      if (download === ctl) download = null;
    }
  }

  async function lerConferido(pasta: PastaDaVoz, a: ArquivoDoSupertonic): Promise<Uint8Array> {
    const nome = nomeNoDisco(a);
    if ((await pasta.marca(nome)) !== a.sha256) throw new Error(`modelo não está no aparelho (${a.caminho})`);
    const f = await pasta.abrir(nome);
    try {
      return f.ler();
    } finally {
      f.fechar();
    }
  }

  const json = (b: Uint8Array) => JSON.parse(new TextDecoder().decode(b));

  async function liberarModelo() {
    const m = modelo;
    modelo = null;
    if (!m) return;
    for (const s of Object.values(m.sessoes)) await s?.release().catch(() => undefined);
  }

  async function sintetizarTrecho(m: Modelo, trecho: string, idioma: string, voz: string, velocidade: number) {
    const texto = textoParaOModelo(trecho, idioma as never);
    const L = texto.length;
    const ids = m.rt.tensor('int64', idsDoTexto(texto, m.indexador), [1, L]);
    const mascara = m.rt.tensor('float32', new Float32Array(L).fill(1), [1, 1, L]);
    const estilo = m.estilos.get(voz) ?? m.estilos.get(VOZES_DO_SUPERTONIC[0])!;
    const taxa = m.cfg.ae.sample_rate;
    const dp = await m.sessoes.duration_predictor.run({ text_ids: ids, style_dp: estilo.dp, text_mask: mascara });
    const dur = Number(dp.duration.data[0]) / velocidade;
    const enc = await m.sessoes.text_encoder.run({ text_ids: ids, style_ttl: estilo.ttl, text_mask: mascara });
    const chunk = m.cfg.ae.base_chunk_size * m.cfg.ttl.chunk_compress_factor;
    const wavLen = Math.floor(dur * taxa);
    const latLen = Math.max(1, Math.floor((wavLen + chunk - 1) / chunk));
    const latDim = m.cfg.ttl.latent_dim * m.cfg.ttl.chunk_compress_factor;
    let xt = new Float32Array(latDim * latLen);
    for (let i = 0; i < xt.length; i++) xt[i] = gauss();
    const latMask = m.rt.tensor('float32', new Float32Array(latLen).fill(1), [1, 1, latLen]);
    const total = m.rt.tensor('float32', new Float32Array([PASSOS_DO_SUPERTONIC]), [1]);
    for (let passo = 0; passo < PASSOS_DO_SUPERTONIC; passo++) {
      const out = await m.sessoes.vector_estimator.run({
        noisy_latent: m.rt.tensor('float32', xt, [1, latDim, latLen]),
        text_emb: enc.text_emb,
        style_ttl: estilo.ttl,
        latent_mask: latMask,
        text_mask: mascara,
        current_step: m.rt.tensor('float32', new Float32Array([passo]), [1]),
        total_step: total,
      });
      xt = out.denoised_latent.data as Float32Array;
    }
    const voc = await m.sessoes.vocoder.run({ latent: m.rt.tensor('float32', xt, [1, latDim, latLen]) });
    const wav = voc.wav_tts.data as Float32Array;
    return wav.length > wavLen ? wav.slice(0, wavLen) : wav;
  }

  async function sintetizarFrase(m: Modelo, texto: string, idioma: string, voz: string, velocidade: number) {
    const base = idiomaDoSupertonic(idioma);
    if (!base) throw new Error(`idioma fora do motor: ${idioma}`);
    const trechos = trechosParaSintese(texto, base);
    if (!trechos.length) throw new Error('texto vazio');
    const partes: Float32Array[] = [];
    for (const t of trechos) partes.push(await sintetizarTrecho(m, t, base, voz, velocidade));
    return { pcm: emendar(partes, m.cfg.ae.sample_rate), taxa: m.cfg.ae.sample_rate, trechos: trechos.length };
  }

  async function carregar(threads: number, webgpu: boolean): Promise<string> {
    if (modelo) return modelo.backend;
    const pasta = await d.abrirPasta();
    const bytes = new Map<string, Uint8Array>();
    for (const a of ARQUIVOS_DO_SUPERTONIC) bytes.set(a.caminho, await lerConferido(pasta, a));
    const cfg = json(bytes.get('onnx/tts.json')!);
    const indexador = json(bytes.get('onnx/unicode_indexer.json')!) as number[];
    const rt = await d.abrirRuntime(threads);
    const tentativas: Array<'webgpu' | 'wasm'> = webgpu && (await d.temWebGpu()) ? ['webgpu', 'wasm'] : ['wasm'];
    let ultimoErro: unknown = null;
    for (const ep of tentativas) {
      const sessoes = {} as Modelo['sessoes'];
      try {
        for (const nome of MODELOS) sessoes[nome] = await rt.criarSessao(bytes.get(`onnx/${nome}.onnx`)!, ep);
        const estilos = new Map<string, { ttl: unknown; dp: unknown }>();
        for (const v of VOZES_DO_SUPERTONIC) {
          const j = json(bytes.get(`voice_styles/${v}.json`)!);
          estilos.set(v, {
            ttl: rt.tensor('float32', new Float32Array(j.style_ttl.data.flat(Infinity)), j.style_ttl.dims),
            dp: rt.tensor('float32', new Float32Array(j.style_dp.data.flat(Infinity)), j.style_dp.dims),
          });
        }
        const m: Modelo = { backend: ep, rt, sessoes, cfg, indexador, estilos };
        await sintetizarFrase(m, 'Olá.', 'pt', VOZES_DO_SUPERTONIC[0], 1.05); // aquecimento: o WebGPU que falha, falha aqui
        modelo = m;
        return ep;
      } catch (e) {
        ultimoErro = e;
        for (const s of Object.values(sessoes)) await s?.release().catch(() => undefined);
      }
    }
    throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro));
  }

  async function receber(m: MensagemParaAVoz): Promise<void> {
    if (m.tipo === 'cancelar') {
      download?.abort();
      return;
    }
    try {
      if (m.tipo === 'baixar') {
        await baixar(m.id, m.raiz);
        d.enviar({ tipo: 'ok', id: m.id });
      } else if (m.tipo === 'carregar') {
        d.enviar({ tipo: 'ok', id: m.id, backend: await carregar(m.threads, m.webgpu) });
      } else if (m.tipo === 'sintetizar') {
        if (!modelo) throw new Error('modelo não carregado');
        const t0 = agora();
        const r = await sintetizarFrase(modelo, m.texto, m.idioma, m.voz, m.velocidade);
        d.enviar({ tipo: 'ok', id: m.id, ...r, ms: agora() - t0, backend: modelo.backend }, [r.pcm.buffer]);
      } else if (m.tipo === 'apagar') {
        download?.abort();
        await liberarModelo();
        await (await d.abrirPasta()).apagarTudo();
        d.enviar({ tipo: 'ok', id: m.id });
      }
    } catch (e) {
      const cancelado = e instanceof Cancelado || (e instanceof DOMException && e.name === 'AbortError');
      d.enviar({ tipo: 'erro', id: m.id, mensagem: e instanceof Error ? e.message : String(e), cancelado });
    }
  }

  return { receber };
}

/* ───────── o worker de verdade ───────── */

const PASTA = 'voz-no-aparelho-supertonic3';

interface AlcaSincrona {
  getSize(): number;
  write(b: Uint8Array, o: { at: number }): number;
  read(b: Uint8Array, o: { at: number }): number;
  truncate(n: number): void;
  flush(): void;
  close(): void;
}
type ArquivoOpfs = FileSystemFileHandle & { createSyncAccessHandle(): Promise<AlcaSincrona> };

async function pastaOpfs(): Promise<PastaDaVoz> {
  const raiz = await navigator.storage.getDirectory();
  const pasta = await raiz.getDirectoryHandle(PASTA, { create: true });
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
      await raiz.removeEntry(PASTA, { recursive: true }).catch(() => undefined);
    },
  };
}

async function sha256Hex(b: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', b as BufferSource));
  return Array.from(h, (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * O `onnxruntime-web` padrão (runtime JSEP: WebGPU e WASM), o MESMO do transformers.js, por `import()`. O `.wasm` vem de
 * `baseDoWasm()` (o app já serve `ort-wasm-simd-threaded.jsep.*` na raiz).
 */
async function abrirRuntime(threads: number): Promise<RuntimeDaVoz> {
  const ort = await import('onnxruntime-web');
  ort.env.wasm.wasmPaths = baseDoWasm();
  ort.env.wasm.numThreads = Math.max(1, Math.min(4, Math.floor(threads) || 1));
  return {
    criarSessao: (bytes, ep) =>
      ort.InferenceSession.create(bytes, {
        executionProviders: [ep],
        graphOptimizationLevel: 'all',
      }) as unknown as Promise<SessaoDaVoz>,
    tensor: (tipo, dados, dims) => new ort.Tensor(tipo, dados as never, dims),
  };
}

async function temWebGpu(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

declare const WorkerGlobalScope: unknown;
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined') {
  const w = criarWorkerDaVoz({
    buscar: (url, init) => fetch(url, init),
    abrirPasta: pastaOpfs,
    abrirRuntime,
    temWebGpu,
    sha256: sha256Hex,
    enviar: (m, t) =>
      (self as unknown as { postMessage(m: unknown, t?: Transferable[]): void }).postMessage(m, t ?? []),
  });
  self.onmessage = (e: MessageEvent<MensagemParaAVoz>) => void w.receber(e.data);
}
