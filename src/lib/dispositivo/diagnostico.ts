/**
 * DIAGNÓSTICO DO APARELHO — medir NO APARELHO o que a emulação não mede (`/diagnostico`).
 *
 * Por que existe: a Fase A ("Grátis sem travar") foi validada num Quest EMULADO, e o headset de verdade
 * seguia outro caminho (tinha `getDisplayMedia`; a emulação não) e travava inteiro ao iniciar a captura
 * (relato do dono, 01/10/2026). O roteiro `docs/testar-no-quest.md` pede cabo, adb e um PC com o
 * DevTools aberto — atrito demais para ser feito. Esta página roda no próprio navegador do aparelho,
 * sem cabo, e mostra o resultado na tela (para um print) e num JSON (para copiar).
 *
 * O QUE ELA RESPONDE (as lacunas de `docs/pesquisa/2026-10-quest-navegador-e-hardware.md`):
 *   · o que o navegador entrega: núcleos, memória, isolamento, GPU, Web Speech, tradutor, compartilhar tela;
 *   · o microfone: as constraints que valeram e o nível, com e sem o processamento de voz (o eco
 *     cancelado some com o som do alto-falante do headset?);
 *   · o compartilhamento de tela: vem trilha de áudio? ela sobrevive sem o vídeo? quanto pesa?
 *   · a velocidade real de cada modelo: carga, tempo do decode, fator de tempo real e quantos quadros
 *     a tela perdeu enquanto ele rodava.
 *
 * NADA DAQUI MUDA A CAPTURA: a página mede e mostra. O microbenchmark roda aqui, a pedido, e não é
 * gravado na sonda (a rota da captura não muda por causa de um teste).
 *
 * Fora do JS inicial: só a tela `Diagnostico.tsx` (lazy) importa este módulo.
 */
import { type InfoDoAdaptadorWebGpu, infoDoAdaptadorWebGpu } from '../../gateway/adaptadorWebGpu';

export interface SinaisDoDiagnostico {
  quando: string;
  userAgent: string;
  /** Versões lidas do UA: só para o relatório, nunca para decidir recurso. */
  navegador: { oculus: string | null; chrome: string | null; modelo: string | null };
  nucleos: number | null;
  memoriaGb: number | null;
  isolado: boolean;
  sharedArrayBuffer: boolean;
  /** `getDisplayMedia` existe. */
  compartilharTela: boolean;
  /** `getUserMedia` existe. */
  microfone: boolean;
  /** `SpeechRecognition`/`webkitSpeechRecognition` existe (existir não é funcionar: ver o teste). */
  webSpeech: boolean;
  tradutorNativo: boolean;
  detectorDeIdioma: boolean;
  webxr: boolean;
  ponteiroGrosso: boolean;
  toques: number;
  viewport: [number, number, number] | null;
  heapLimiteMb: number | null;
  heapUsadoMb: number | null;
  cotaMb: number | null;
  usoMb: number | null;
  /** Quantas vozes o `speechSynthesis` lista (`null` = a API não existe). */
  vozesDeLeitura: number | null;
  webGpu: { fornecedor: string; arquitetura: string; shaderF16: boolean; maxBufferMb: number | null } | null;
  /** O que o app decidiu sobre este aparelho (`<html data-dispositivo data-modo-leve>`). */
  perfilDoApp: { tipo: string | null; modoLeve: string | null };
}

export interface DependenciasDoDiagnostico {
  /** Onde procurar as APIs (padrão `globalThis`). */
  escopo?: unknown;
  infoDoAdaptador?: () => Promise<InfoDoAdaptadorWebGpu | null>;
  perfilDoApp?: { tipo: string | null; modoLeve: string | null };
}

type Solto = Record<string, any>;

const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const emMb = (bytes: unknown): number | null => (numero(bytes) ? Math.round((bytes as number) / 1048576) : null);

async function tentar<T>(f: () => T | Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch {
    return null;
  }
}

/** Lê os sinais do navegador. Nunca lança: API ausente ou que recusa vira `null`/`false`. */
export async function coletarSinaisDoDiagnostico(dep: DependenciasDoDiagnostico = {}): Promise<SinaisDoDiagnostico> {
  const g = (dep.escopo ?? globalThis) as Solto;
  const nav: Solto = g.navigator ?? {};
  const ua = String(nav.userAgent ?? '');
  const consulta = (q: string): boolean => {
    try {
      return typeof g.matchMedia === 'function' ? !!g.matchMedia(q)?.matches : false;
    } catch {
      return false;
    }
  };
  const gpu = await tentar(dep.infoDoAdaptador ?? (() => infoDoAdaptadorWebGpu()));
  const estimativa = await tentar<{ quota?: number; usage?: number }>(() => nav.storage?.estimate?.());
  const vozes = await tentar<unknown[]>(() => g.speechSynthesis?.getVoices?.());
  const memoria = g.performance?.memory;
  return {
    quando: new Date().toISOString(),
    userAgent: ua,
    navegador: {
      oculus: /OculusBrowser\/([\d.]+)/.exec(ua)?.[1] ?? null,
      chrome: /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? null,
      modelo: /\b(Quest(?: Pro| \d\w*)?)\b/.exec(ua)?.[1] ?? null,
    },
    nucleos: numero(nav.hardwareConcurrency),
    memoriaGb: numero(nav.deviceMemory),
    isolado: g.crossOriginIsolated === true,
    sharedArrayBuffer: typeof g.SharedArrayBuffer !== 'undefined',
    compartilharTela: typeof nav.mediaDevices?.getDisplayMedia === 'function',
    microfone: typeof nav.mediaDevices?.getUserMedia === 'function',
    webSpeech: !!(g.SpeechRecognition || g.webkitSpeechRecognition),
    tradutorNativo: 'Translator' in g,
    detectorDeIdioma: 'LanguageDetector' in g,
    webxr: nav.xr != null,
    ponteiroGrosso: consulta('(pointer: coarse)'),
    toques: numero(nav.maxTouchPoints) ?? 0,
    viewport: numero(g.innerWidth) ? [g.innerWidth, g.innerHeight, g.devicePixelRatio ?? 1] : null,
    heapLimiteMb: emMb(memoria?.jsHeapSizeLimit),
    heapUsadoMb: emMb(memoria?.usedJSHeapSize),
    cotaMb: emMb(estimativa?.quota),
    usoMb: emMb(estimativa?.usage),
    vozesDeLeitura: Array.isArray(vozes) ? vozes.length : null,
    webGpu: gpu
      ? {
          fornecedor: gpu.fornecedor,
          arquitetura: gpu.arquitetura,
          shaderF16: gpu.shaderF16,
          maxBufferMb: emMb(gpu.limites?.maxBufferSize),
        }
      : null,
    perfilDoApp: dep.perfilDoApp ?? {
      tipo: g.document?.documentElement?.dataset?.dispositivo ?? null,
      modoLeve: g.document?.documentElement?.dataset?.modoLeve ?? null,
    },
  };
}

/** O piso do medidor: silêncio digital não vira `-Infinity` na tela. */
const PISO_DB = -100;
const emDb = (v: number): number => (v > 0 ? Math.max(PISO_DB, Math.round(20 * Math.log10(v))) : PISO_DB);

/** Nível de um trecho de áudio em dBFS: RMS (o volume médio) e pico. */
export function nivelDoAudio(amostras: Float32Array): { rmsDb: number; picoDb: number } {
  if (amostras.length === 0) return { rmsDb: PISO_DB, picoDb: PISO_DB };
  let soma = 0;
  let pico = 0;
  for (let i = 0; i < amostras.length; i++) {
    const a = Math.abs(amostras[i]);
    soma += a * a;
    if (a > pico) pico = a;
  }
  return { rmsDb: emDb(Math.sqrt(soma / amostras.length)), picoDb: emDb(pico) };
}

export interface EstatisticaDeQuadros {
  quadros: number;
  /** O maior intervalo entre dois quadros (ms). */
  piorMs: number;
  /** Quadros que levaram mais de 50 ms: a travada que a pessoa percebe. */
  longos: number;
  mediaMs: number;
}

/** A tela travou? Dos intervalos entre quadros (`requestAnimationFrame`) durante uma medida. */
export function estatisticaDeQuadros(intervalosMs: number[]): EstatisticaDeQuadros {
  if (intervalosMs.length === 0) return { quadros: 0, piorMs: 0, longos: 0, mediaMs: 0 };
  const soma = intervalosMs.reduce((a, b) => a + b, 0);
  return {
    quadros: intervalosMs.length,
    piorMs: Math.round(Math.max(...intervalosMs)),
    longos: intervalosMs.filter((ms) => ms > 50).length,
    mediaMs: Math.round(soma / intervalosMs.length),
  };
}

/** Conta os quadros da thread principal até `parar()`. Sem `requestAnimationFrame`, devolve zeros. */
export function vigiarQuadros(): { parar: () => EstatisticaDeQuadros } {
  const intervalos: number[] = [];
  let vivo = true;
  let anterior = performance.now();
  const raf = (globalThis as { requestAnimationFrame?: (f: (t: number) => void) => number }).requestAnimationFrame;
  const passo = (agora: number) => {
    if (!vivo) return;
    intervalos.push(agora - anterior);
    anterior = agora;
    raf?.(passo);
  };
  raf?.(passo);
  return {
    parar: () => {
      vivo = false;
      return estatisticaDeQuadros(intervalos);
    },
  };
}

/** Tempo de decode ÷ duração do áudio, com duas casas. Abaixo de 1 acompanha a fala. */
export function fatorDeTempoReal(decodeMs: number, audioMs: number): number | null {
  if (!(audioMs > 0) || !(decodeMs >= 0)) return null;
  return Math.round((decodeMs / audioMs) * 100) / 100;
}

export type VeredictoDoModelo = 'folga' | 'justo' | 'lento' | 'falhou';

/**
 * O que o fator quer dizer para a legenda: até 0,6 sobra tempo para o tradutor e para a fala seguinte;
 * até 1 acompanha, sem folga; acima disso a fila cresce.
 */
export function veredictoDoModelo(rtf: number | null): VeredictoDoModelo {
  if (rtf == null) return 'falhou';
  if (rtf <= 0.6) return 'folga';
  return rtf <= 1 ? 'justo' : 'lento';
}

export interface ModeloDoDiagnostico {
  id: string;
  rotulo: string;
  /** Id do modelo no Hub. */
  modelo: string;
  dtype: string;
  backend: 'wasm' | 'webgpu';
  threads: number;
  /** Download, se ainda não estiver no navegador (MB). */
  mb: number;
}

/** O que vale medir num aparelho fraco: o modelo leve de inglês e o Whisper do português, com 1 e 2 threads. */
export const MODELOS_DA_CPU: readonly ModeloDoDiagnostico[] = [
  {
    id: 'moonshine-tiny-wasm-1',
    rotulo: 'Moonshine tiny',
    modelo: 'onnx-community/moonshine-tiny-ONNX',
    dtype: 'q8',
    backend: 'wasm',
    threads: 1,
    mb: 32,
  },
  {
    id: 'whisper-base-wasm-1',
    rotulo: 'Whisper base',
    modelo: 'onnx-community/whisper-base',
    dtype: 'q8',
    backend: 'wasm',
    threads: 1,
    mb: 80,
  },
  {
    id: 'whisper-base-wasm-2',
    rotulo: 'Whisper base',
    modelo: 'onnx-community/whisper-base',
    dtype: 'q8',
    backend: 'wasm',
    threads: 2,
    mb: 80,
  },
];

/** O Whisper na placa de vídeo: teste à parte, porque uma GPU que cai pode derrubar a aba. */
export const MODELO_DA_GPU: ModeloDoDiagnostico = {
  id: 'whisper-base-webgpu',
  rotulo: 'Whisper base',
  modelo: 'onnx-community/whisper-base',
  dtype: 'hybrid',
  backend: 'webgpu',
  threads: 1,
  mb: 209,
};

export interface ResultadoDoModelo {
  id: string;
  rotulo: string;
  backend: 'wasm' | 'webgpu';
  threads: number;
  cargaMs: number | null;
  decodeMs: number | null;
  audioMs: number;
  rtf: number | null;
  quadros: EstatisticaDeQuadros | null;
  texto: string;
  erro: string | null;
}

/** O pedaço do `Worker` do Whisper que a medida usa (injetável nos testes). */
export interface WorkerDeTranscricao {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: unknown) => void) | null;
  postMessage(m: unknown): void;
  terminate(): void;
}

function criarWorkerDeTranscricao(): WorkerDeTranscricao {
  return new Worker(new URL('../../gateway/adapters/whisperWorker.ts', import.meta.url), {
    type: 'module',
  }) as WorkerDeTranscricao;
}

export interface OpcoesDaMedida {
  criarWorker?: () => WorkerDeTranscricao;
  /** Prazo de cada etapa (carga, decode): passou disso, o worker é encerrado e a medida falha. */
  prazoMs?: number;
  aoProgredir?: (fracao: number) => void;
  vigiar?: () => { parar: () => EstatisticaDeQuadros };
  agora?: () => number;
}

/**
 * Mede UM modelo num worker novo (as threads são fixadas na primeira carga): carrega, decodifica o
 * trecho duas vezes e fica com a mais rápida (a primeira ainda paga caches frios). O worker é sempre
 * encerrado — a memória do modelo volta antes da medida seguinte. Nunca lança.
 */
export async function medirModelo(
  m: ModeloDoDiagnostico,
  pcm: Float32Array,
  opcoes: OpcoesDaMedida = {},
): Promise<ResultadoDoModelo> {
  const { criarWorker = criarWorkerDeTranscricao, prazoMs = 180_000, agora = () => performance.now() } = opcoes;
  const audioMs = Math.round((pcm.length / 16000) * 1000);
  const base = { id: m.id, rotulo: m.rotulo, backend: m.backend, threads: m.threads, audioMs };
  const falha = (erro: string): ResultadoDoModelo => ({
    ...base,
    cargaMs: null,
    decodeMs: null,
    rtf: null,
    quadros: null,
    texto: '',
    erro,
  });
  let worker: WorkerDeTranscricao;
  try {
    worker = criarWorker();
  } catch (e) {
    return falha(String((e as Error)?.message ?? e));
  }
  /** Espera a próxima mensagem que `aceita` reconhecer; erro do worker ou prazo rejeitam. */
  const esperar = <T>(aceita: (d: any) => T | undefined): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const relogio = setTimeout(() => reject(new Error('demorou demais')), prazoMs);
      const fim = () => clearTimeout(relogio);
      worker.onmessage = (e) => {
        const d = e.data;
        if (d?.type === 'progress' && typeof d.progress === 'number') opcoes.aoProgredir?.(d.progress);
        if (d?.type === 'error') {
          fim();
          reject(new Error(String(d.message ?? 'erro no worker')));
          return;
        }
        const r = aceita(d);
        if (r !== undefined) {
          fim();
          resolve(r);
        }
      };
      worker.onerror = (e) => {
        fim();
        reject(new Error(String((e as { message?: string })?.message ?? 'o worker caiu')));
      };
    });
  const quadros = (opcoes.vigiar ?? vigiarQuadros)();
  try {
    const t0 = agora();
    const pronto = esperar((d) => (d?.type === 'ready' ? true : undefined));
    worker.postMessage({ type: 'load', model: m.modelo, dtype: m.dtype, device: m.backend, threads: m.threads });
    await pronto;
    const cargaMs = Math.round(agora() - t0);
    let melhor = Infinity;
    let texto = '';
    for (let i = 0; i < 2; i++) {
      const id = `${m.id}-${i}`;
      const t1 = agora();
      const resposta = esperar((d) => (d?.type === 'result' && d.id === id ? String(d.text ?? '') : undefined));
      // Cópia: o mesmo trecho serve a todas as medidas.
      worker.postMessage({
        type: 'transcribe',
        id,
        pcm: pcm.slice(),
        language: 'en',
        model: m.modelo,
        dtype: m.dtype,
        device: m.backend,
      });
      texto = await resposta;
      melhor = Math.min(melhor, agora() - t1);
    }
    const decodeMs = Math.round(melhor);
    return {
      ...base,
      cargaMs,
      decodeMs,
      rtf: fatorDeTempoReal(decodeMs, audioMs),
      quadros: quadros.parar(),
      texto,
      erro: null,
    };
  } catch (e) {
    quadros.parar();
    return falha(String((e as Error)?.message ?? e));
  } finally {
    worker.terminate();
  }
}

const segundos = (ms: number): string => (ms / 1000).toFixed(1).replace('.', ',');

/** Uma linha por modelo, para a tela e para o print. */
export function resumirModelo(r: ResultadoDoModelo): string {
  const onde = r.backend === 'webgpu' ? 'placa de vídeo' : `CPU, ${r.threads} thread${r.threads > 1 ? 's' : ''}`;
  if (r.erro || r.decodeMs == null || r.rtf == null)
    return `${r.rotulo} · ${onde} · falhou: ${r.erro ?? 'sem resultado'}`;
  const travadas = r.quadros ? ` · ${r.quadros.longos} travadas, pior ${r.quadros.piorMs} ms` : '';
  const carga = r.cargaMs != null ? ` · carga ${segundos(r.cargaMs)} s` : '';
  return `${r.rotulo} · ${onde} · ${Math.round(r.audioMs / 1000)} s de fala em ${segundos(r.decodeMs)} s (fator ${String(r.rtf).replace('.', ',')})${carga}${travadas}`;
}

/** O trecho de fala das medidas: 11 s em inglês (domínio público), o mesmo dos exemplos do transformers.js. */
export const URL_DO_TRECHO_DE_FALA = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav';
