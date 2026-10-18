/**
 * VAD DA CAPTURA COM A INFERÊNCIA FORA DA THREAD PRINCIPAL.
 *
 * O `MicVAD` do `@ricky0123/vad-web` roda o Silero (ONNX) na thread principal, a cada quadro de 96 ms, e
 * a abertura dele instancia o WASM de 12 MB ali (~170 ms de quadro longo no desktop, ~880 ms com CPU 4×).
 * `env.wasm.proxy` não resolve: o `SileroLegacy` reusa o tensor `sr` a cada quadro e o proxy o transfere
 * (DataCloneError no 2º quadro). Esta classe faz o mesmo que o `MicVAD` — o mesmo worklet de áudio, o
 * mesmo `FrameProcessor` (limiares, redenção, pré-pad, `minSpeechMs`, pausa que entrega a fala) e os
 * mesmos eventos — trocando SÓ o modelo: cada quadro vai a `vadWorker.ts` e a probabilidade volta.
 *
 * O que muda para quem chama: nada. `start()`, `pause()` e `destroy()` têm o contrato do `MicVAD`. Se o
 * worker não sobe (sem `Worker`/`AudioWorklet`, modelo ausente), `new` rejeita ANTES de abrir qualquer
 * coisa de áudio, e `systemAudio.ts` cai no `MicVAD` da thread principal — o comportamento de antes.
 */
import type { FrameProcessor as FrameProcessorTipo, Message as MensagemDaBiblioteca } from '@ricky0123/vad-web';

/** O contrato com `vadWorker.ts`. */
export type MensagemParaOVad =
  | { tipo: 'carregar'; url: string }
  | { tipo: 'quadro'; id: number; pcm: Float32Array }
  | { tipo: 'reiniciar' }
  | { tipo: 'liberar' };
export type MensagemDoVad =
  | { tipo: 'pronto' }
  | { tipo: 'probabilidade'; id: number; isSpeech: number }
  | { tipo: 'erro'; id?: number; mensagem: string };

/** A parte do `Worker` que se usa — para o teste trocar por um falso. */
export interface WorkerDoVad {
  onmessage: ((e: MessageEvent<MensagemDoVad>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(msg: MensagemParaOVad, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface ProbabilidadesDoQuadro {
  isSpeech: number;
  notSpeech: number;
}

/** O modelo, visto de fora: o que o `FrameProcessor` espera (`process`, `reset`) mais o ciclo de vida. */
export interface ModeloDoVad {
  process(quadro: Float32Array): Promise<ProbabilidadesDoQuadro>;
  reset(): void;
  release(): void;
}

/** Cria o worker de verdade. Lança se o navegador não tem `Worker`. */
export const criarWorkerDoVad = (): WorkerDoVad => {
  if (typeof Worker === 'undefined') throw new Error('Web Worker indisponível');
  return new Worker(new URL('./vadWorker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerDoVad;
};

/**
 * Sobe o worker e carrega o modelo. Resolve quando ele responde "pronto"; rejeita se o worker não abre ou
 * o modelo não carrega (e então o worker já foi encerrado). Depois de pronto, cada `process` manda um
 * quadro e espera a probabilidade DAQUELE quadro (casadas por `id`).
 */
export function criarModeloDoVad(url: string, criarWorker: () => WorkerDoVad = criarWorkerDoVad): Promise<ModeloDoVad> {
  return new Promise<ModeloDoVad>((resolve, reject) => {
    let worker: WorkerDoVad;
    try {
      worker = criarWorker();
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    let proximoId = 0;
    let pronto = false;
    let morto: Error | null = null;
    const pendentes = new Map<number, { ok: (p: ProbabilidadesDoQuadro) => void; falha: (e: Error) => void }>();

    const encerrar = (erro: Error): void => {
      morto ??= erro;
      for (const p of pendentes.values()) p.falha(erro);
      pendentes.clear();
      try {
        worker.terminate();
      } catch {
        /* já encerrado */
      }
      if (!pronto) reject(erro);
    };

    worker.onmessage = (e) => {
      const m = e.data;
      if (m.tipo === 'pronto') {
        pronto = true;
        resolve(modelo);
      } else if (m.tipo === 'probabilidade') {
        const p = pendentes.get(m.id);
        pendentes.delete(m.id);
        p?.ok({ isSpeech: m.isSpeech, notSpeech: 1 - m.isSpeech });
      } else if (m.id === undefined) {
        // Erro geral (o modelo não carregou): o worker não serve mais.
        encerrar(new Error(m.mensagem));
      } else {
        const p = pendentes.get(m.id);
        pendentes.delete(m.id);
        p?.falha(new Error(m.mensagem));
      }
    };
    worker.onerror = (e) => encerrar(new Error(e.message || 'o worker do VAD falhou'));

    const modelo: ModeloDoVad = {
      process(quadro) {
        if (morto) return Promise.reject(morto);
        const id = ++proximoId;
        return new Promise<ProbabilidadesDoQuadro>((ok, falha) => {
          pendentes.set(id, { ok, falha });
          // Cópia: o `FrameProcessor` guarda o quadro para montar o áudio da fala.
          worker.postMessage({ tipo: 'quadro', id, pcm: quadro });
        });
      },
      reset() {
        if (!morto) worker.postMessage({ tipo: 'reiniciar' });
      },
      release() {
        if (morto) return;
        morto = new Error('VAD liberado');
        try {
          worker.postMessage({ tipo: 'liberar' });
        } catch {
          /* worker já encerrado */
        }
        for (const p of pendentes.values()) p.falha(morto);
        pendentes.clear();
        // O 'liberar' é a última mensagem: encerra depois de a fila andar um pouco.
        setTimeout(() => worker.terminate(), 50);
      },
    };

    try {
      worker.postMessage({ tipo: 'carregar', url });
    } catch (e) {
      encerrar(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** O módulo `@ricky0123/vad-web`, já carregado (o import é sob demanda em `systemAudio.ts`). */
export interface VadWeb {
  FrameProcessor: typeof FrameProcessorTipo;
  Message: typeof MensagemDaBiblioteca;
}

export interface OpcoesDoVadEmWorker {
  baseAssetPath: string;
  getStream: () => Promise<MediaStream>;
  audioContext?: AudioContext;
  positiveSpeechThreshold: number;
  negativeSpeechThreshold: number;
  redemptionMs: number;
  preSpeechPadMs: number;
  minSpeechMs: number;
  submitUserSpeechOnPause: boolean;
  onFrameProcessed: (probs: ProbabilidadesDoQuadro, frame: Float32Array) => void;
  onSpeechStart: () => void;
  onVADMisfire: () => void;
  onSpeechEnd: (audio: Float32Array) => void;
  /** Só para o teste: troca o worker. */
  criarWorker?: () => WorkerDoVad;
}

const ARQUIVO_DO_MODELO = 'silero_vad_legacy.onnx';
const ARQUIVO_DO_WORKLET = 'vad.worklet.bundle.min.js';
/** O Silero "legacy": 1536 amostras a 16 kHz = 96 ms por quadro. */
const AMOSTRAS_POR_QUADRO = 1536;

type EstadoDoVad = 'novo' | 'iniciando' | 'iniciado' | 'destruido';

export class VadEmWorker {
  private estado: EstadoDoVad = 'novo';
  private ouvindo = false;
  private stream: MediaStream | null = null;
  private contexto: AudioContext | null = null;
  private no: AudioWorkletNode | null = null;
  private fonte: MediaStreamAudioSourceNode | null = null;
  private donoDoContexto = false;

  private constructor(
    private readonly opcoes: OpcoesDoVadEmWorker,
    private readonly vadWeb: VadWeb,
    private readonly modelo: ModeloDoVad,
    private readonly frameProcessor: FrameProcessorTipo,
  ) {}

  /**
   * Carrega o modelo no worker e (como o `MicVAD`, `startOnLoad`) já começa a ouvir. Rejeita, sem deixar
   * worker nem áudio abertos, se algo falhar — quem chama cai no `MicVAD`.
   */
  static async new(opcoes: OpcoesDoVadEmWorker, vadWeb: VadWeb): Promise<VadEmWorker> {
    if (typeof AudioWorkletNode === 'undefined') throw new Error('AudioWorklet indisponível');
    const modelo = await criarModeloDoVad(opcoes.baseAssetPath + ARQUIVO_DO_MODELO, opcoes.criarWorker);
    const msPorQuadro = AMOSTRAS_POR_QUADRO / 16;
    const frameProcessor = new vadWeb.FrameProcessor(
      (q) => modelo.process(q),
      () => modelo.reset(),
      {
        positiveSpeechThreshold: opcoes.positiveSpeechThreshold,
        negativeSpeechThreshold: opcoes.negativeSpeechThreshold,
        redemptionMs: opcoes.redemptionMs,
        preSpeechPadMs: opcoes.preSpeechPadMs,
        minSpeechMs: opcoes.minSpeechMs,
        submitUserSpeechOnPause: opcoes.submitUserSpeechOnPause,
      },
      msPorQuadro,
    );
    const vad = new VadEmWorker(opcoes, vadWeb, modelo, frameProcessor);
    try {
      await vad.start();
    } catch (e) {
      modelo.release();
      throw e;
    }
    return vad;
  }

  async start(): Promise<void> {
    if (this.estado === 'iniciando' || this.estado === 'destruido') return;
    if (this.estado === 'novo') {
      this.estado = 'iniciando';
      this.frameProcessor.resume();
      try {
        this.stream = await this.opcoes.getStream();
        if (this.opcoes.audioContext) {
          this.contexto = this.opcoes.audioContext;
        } else {
          this.contexto = new AudioContext();
          this.donoDoContexto = true;
        }
        await this.contexto.audioWorklet.addModule(this.opcoes.baseAssetPath + ARQUIVO_DO_WORKLET);
        const no = new AudioWorkletNode(this.contexto, 'vad-helper-worklet', {
          processorOptions: { frameSamples: AMOSTRAS_POR_QUADRO },
        });
        no.port.onmessage = (ev: MessageEvent) => {
          const d = ev.data as { message?: unknown; data?: unknown } | null;
          if (!d || typeof d !== 'object' || d.message !== this.vadWeb.Message.AudioFrame) return;
          if (!(d.data instanceof ArrayBuffer)) return;
          void this.processar(new Float32Array(d.data));
        };
        this.no = no;
        this.fonte = new MediaStreamAudioSourceNode(this.contexto, { mediaStream: this.stream });
        this.fonte.connect(no);
      } catch (e) {
        this.estado = 'destruido';
        throw e;
      }
      this.ouvindo = true;
      this.estado = 'iniciado';
      return;
    }
    if (this.ouvindo) return;
    this.ouvindo = true;
    this.frameProcessor.resume();
    if (this.contexto && this.stream && this.no) {
      this.fonte = new MediaStreamAudioSourceNode(this.contexto, { mediaStream: this.stream });
      this.fonte.connect(this.no);
    }
  }

  async pause(): Promise<void> {
    if (!this.ouvindo) return;
    this.ouvindo = false;
    this.fonte?.disconnect();
    this.frameProcessor.pause(this.aoEvento);
  }

  async destroy(): Promise<void> {
    this.estado = 'destruido';
    this.no?.port.postMessage(this.vadWeb.Message.SpeechStop);
    if (this.ouvindo) await this.pause();
    this.modelo.release();
    if (this.donoDoContexto) await this.contexto?.close();
  }

  /** Um quadro do worklet: o `FrameProcessor` pede a probabilidade ao worker e dispara os eventos. */
  private async processar(quadro: Float32Array): Promise<void> {
    try {
      await this.frameProcessor.process(quadro, this.aoEvento);
    } catch (e) {
      // Um quadro perdido (worker encerrado, erro de inferência): o seguinte segue. O `MicVAD` deixava a
      // rejeição solta; aqui ela só vai para o console.
      console.error('[cap:vad] quadro descartado:', e);
    }
  }

  private readonly aoEvento = (
    ev: Parameters<FrameProcessorTipo['process']>[1] extends (e: infer E) => void ? E : never,
  ): void => {
    const { Message } = this.vadWeb;
    switch (ev.msg) {
      case Message.FrameProcessed:
        this.opcoes.onFrameProcessed(ev.probs, ev.frame);
        break;
      case Message.SpeechStart:
        this.opcoes.onSpeechStart();
        break;
      case Message.VADMisfire:
        this.opcoes.onVADMisfire();
        break;
      case Message.SpeechEnd:
        this.opcoes.onSpeechEnd(ev.audio);
        break;
      default:
        break;
    }
  };
}
