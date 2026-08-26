/**
 * Interfaces de capacidade do AI Gateway (camada de navegador). Podem referenciar
 * tipos web (AbortSignal, MediaStream) — por isso vivem aqui e NÃO no núcleo puro.
 * Cada adapter implementa uma destas para um backend concreto.
 */
import type { AdapterCost, AdapterRuntime, ChatMessage, ChatResult } from '@core'

/** Metadados comuns a todo adapter: onde roda e quanto custa. */
export interface AdapterMeta {
  readonly id: string
  readonly runtime: AdapterRuntime
  readonly cost: AdapterCost
  readonly label: string
}

// ───────────────────────────── Tradução (MT) ─────────────────────────────

export interface MtResult {
  text: string
  detectedSourceLang?: string
  engine: string
  /** Tradução de qualidade não garantida (último recurso público): a UI marca com "≈". */
  approximate?: boolean
}

export interface TranslationProvider extends AdapterMeta {
  supports(src: string | null, tgt: string): boolean
  translate(text: string, src: string | null, tgt: string, opts?: { signal?: AbortSignal }): Promise<MtResult>
  /** Aquece o modelo desta direção em background (no-op para adapters de rede/nativos). */
  preload?(src: string, tgt: string, onProgress?: (progress: number, label?: string, bytes?: { loaded: number; total: number }) => void): void
}

// ───────────────────────────────── LLM ─────────────────────────────────

export interface LlmOptions {
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

export interface LlmProvider extends AdapterMeta {
  chat(system: string, messages: ChatMessage[], opts?: LlmOptions): Promise<ChatResult>
  chatStream(
    system: string,
    messages: ChatMessage[],
    onDelta: (delta: string) => void,
    opts?: LlmOptions
  ): Promise<ChatResult>
}

// ───────────────────────────────── STT ─────────────────────────────────

export interface SttFinal {
  text: string
  language?: string
  confidence?: number
  /** Adapter que de fato transcreveu (preenchido pelo wrapper do gateway) — procedência honesta. */
  engine?: string
}

/** Sessão de transcrição ao vivo (chame `stop()` para encerrar). */
export interface SttSession {
  stop(): void
}

export interface SttCallbacks {
  onPartial(text: string): void
  onFinal(result: SttFinal): void
  onError?(error: Error): void
}

// ─────────────────────── STT streaming (áudio contínuo) ───────────────────────

/**
 * Sessão de STT com STREAMING: você alimenta PCM continuamente (`feed`) e o provedor
 * emite `onPartial` (texto que refina) e `onFinal` por endpoint. É o contrato que faz
 * o áudio do sistema parecer "tempo real como o microfone".
 *
 * Duas implementações sob o MESMO contrato:
 *  - **Whisper local** (grátis/offline): partials via re-decode do buffer, com idle-gating.
 *  - **Nuvem WebSocket** (Deepgram/AssemblyAI/Gladia — futuro): partials token-a-token reais.
 */
export interface StreamingSttSession {
  /** Alimenta um trecho de PCM (Float32 mono @ sampleRate). */
  feed(pcm: Float32Array, sampleRate: number): void
  /** Encerra a sessão e resolve após o último `onFinal`. */
  end(): Promise<void>
}

export interface StreamingSttOptions {
  languageHint?: string
  onPartial(text: string): void
  onFinal(result: SttFinal): void
  onError?(error: Error): void
}

export interface SttProvider extends AdapterMeta {
  /** Feature-detection (WebGPU, Web Speech, alcance de localhost…). */
  isAvailable(): boolean
  /** Consome o microfone e emite partials/finais (ex.: Web Speech). */
  supportsLiveMic: boolean
  /** Transcreve um enunciado já capturado (ex.: aba via getDisplayMedia → Whisper/Groq). */
  supportsBlob: boolean
  startLive?(lang: string, cb: SttCallbacks): SttSession
  transcribeBlob?(audio: Blob, opts?: { languageHint?: string }): Promise<SttFinal>
  /**
   * Transcreve um enunciado PCM (Float32 mono @ sampleRate, tipicamente 16 kHz) —
   * o caminho VAD→Whisper/Groq para áudio do sistema/aba. Espelha o whisper-server
   * do desktop, mas web-nativo.
   */
  transcribePcm?(
    pcm: Float32Array,
    sampleRate: number,
    opts?: { languageHint?: string; signal?: AbortSignal; onUpdate?: (text: string) => void }
  ): Promise<SttFinal>
  /**
   * `true` enquanto há transcrição em andamento (worker ocupado). Usado para o
   * idle-gating dos partials: um parcial best-effort nunca deve enfileirar atrás de
   * outro trabalho — é isso que impede o backlog crescente em áudio denso.
   */
  readonly busy?: boolean
  /** Profundidade atual da fila de decode (enunciados pendentes) — para métrica. */
  readonly queueDepth?: number
  /**
   * Transcreve um PARTIAL apenas se o adapter estiver ocioso; resolve `null` quando
   * ocupado (o parcial é descartado em vez de enfileirar). Base do "rolling partial".
   */
  transcribeIfIdle?(
    pcm: Float32Array,
    sampleRate: number,
    opts?: { languageHint?: string }
  ): Promise<SttFinal | null>
  /** Suporta STREAMING contínuo real (nuvem WebSocket)? Whisper local aproxima via partials. */
  supportsStreaming?: boolean
  /** Abre uma sessão de streaming (contrato para plugar STT de nuvem — futuro). */
  startStream?(opts: StreamingSttOptions): StreamingSttSession
  /**
   * Pré-carrega o modelo (ex.: Whisper WebGPU), reportando progresso 0..1. No-op para
   * adapters sem download (Web Speech, proxy de nuvem). Resolve quando pronto p/ transcrever.
   */
  preload?(onProgress?: (progress: number, label?: string, bytes?: { loaded: number; total: number }) => void): Promise<void>
}
