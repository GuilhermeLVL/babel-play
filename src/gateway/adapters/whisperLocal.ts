/**
 * Adapter Whisper local (on-device no navegador) — espelho do whisper-server do desktop,
 * mas web-nativo via Web Worker. Backend PADRÃO = WASM (roda em qualquer navegador, sem WebGPU);
 * WebGPU é opcional via localStorage `babel.whisperDevice = 'webgpu'`.
 */
import type { SttProvider, SttFinal } from '../capabilities'
import { criarWatchdogDeEstagnacao } from './modelProgress'

interface PendingRequest {
  resolve: (value: SttFinal) => void
  reject: (error: Error) => void
  /** Callback opcional de texto incremental (streaming token-a-token) durante o decode. */
  onUpdate?: (text: string) => void
}

export class WhisperLocalStt implements SttProvider {
  readonly id = 'whisper-local'
  readonly runtime = 'browser' as const
  readonly cost = 'free' as const
  readonly label = 'Whisper local (WASM/WebGPU)'

  readonly supportsLiveMic = false
  readonly supportsBlob = true

  private worker: Worker | null = null
  private readyPromise: Promise<void> | null = null
  private readyResolve: (() => void) | null = null
  private readyReject: ((err: Error) => void) | null = null
  private pending = new Map<string, PendingRequest>()
  private onProgress: ((progress: number, label?: string, bytes?: { loaded: number; total: number }) => void) | null = null
  /** true depois que o modelo terminou de carregar (worker respondeu 'ready'). */
  private asrReady = false

  /**
   * Modelo Whisper. Override via localStorage `babel.whisperModel` — permite trocar
   * base↔tiny sem recompilar (tiny ≈ 3–4× mais rápido, menos preciso). Default: tiny.
   */
  /** Modelo pedido pelo ROTEADOR (sttRouter) — vence o override manual e o default. */
  private routedModel: string | null = null
  /** Modelo com que o worker ATUAL foi carregado (para saber quando recriar). */
  private loadedModel: string | null = null

  private get model(): string {
    if (this.routedModel) return this.routedModel
    try {
      return localStorage.getItem('babel.whisperModel') || 'onnx-community/whisper-tiny'
    } catch {
      return 'onnx-community/whisper-tiny'
    }
  }

  /**
   * Troca o modelo local (chamado pelo roteador antes de cada sessão). Se o worker já
   * carregou OUTRO modelo, derruba e recria — mesma mecânica do fallback de device.
   * Chamar com o modelo já carregado é no-op (não paga teardown à toa).
   */
  setModel(modelId: string): void {
    if (!modelId) return
    this.routedModel = modelId
    if (this.worker && this.loadedModel && this.loadedModel !== modelId) {
      console.log('[whisper] roteador trocou o modelo:', this.loadedModel, '→', modelId, '— recriando worker')
      try { this.worker.terminate() } catch { /* já morto */ }
      this.worker = null
      this.asrReady = false
      this.loadedModel = null
      for (const p of this.pending.values()) p.reject(new Error('modelo de transcrição trocado — recarregando'))
      this.pending.clear()
      this.readyPromise = null
      this.readyResolve = null
      this.readyReject = null
    }
  }

  /**
   * Preset de quantização (override via localStorage `babel.whisperDtype`). Default `hybrid`:
   * encoder fp32 + decoder q4. MEDIDO: fp32 dá ~480ms/decode; fp16 (apesar de menor no disco)
   * ficou ~2570ms neste WebGPU — a velocidade de decode importa muito mais que o download
   * único de 33MB (fica em cache). Se seu hardware for diferente, teste 'hybrid-fp16'.
   */
  private get dtype(): string {
    try {
      return localStorage.getItem('babel.whisperDtype') || 'hybrid'
    } catch {
      return 'hybrid'
    }
  }

  /**
   * Backend de inferência (override via localStorage `babel.whisperDevice`): `auto|wasm|webgpu`.
   * PADRÃO `auto`: usa WebGPU quando o navegador tem (MUITO mais rápido — decode ~0,48s vs ~5,2s
   * no WASM single-thread) e cai para WASM onde não há WebGPU (Firefox/Safari/celular), mantendo a
   * transcrição local UNIVERSAL. Force `wasm`/`webgpu` para testar/comparar. (O WASM só empata/ganha
   * do WebGPU quando roda MULTI-THREAD, o que exige COOP/COEP — ver mudança local-whisper-realtime A2.)
   */
  private get device(): string {
    if (this.forcedDevice) return this.forcedDevice
    try {
      return localStorage.getItem('babel.whisperDevice') || 'auto'
    } catch {
      return 'auto'
    }
  }

  /**
   * WATCHDOG DO WEBGPU — POR ESTAGNAÇÃO, não por prazo absoluto.
   *
   * O problema que ele resolve é real: com a GPU ocupada/instável (jogo pesado, WSL2/Docker
   * disputando o adaptador), a criação da sessão WebGPU trava indefinidamente e a captura fica
   * presa em "Baixando modelo…" para sempre.
   *
   * Mas a versão anterior usava um prazo ABSOLUTO de 45 s desde o início do load, e por isso
   * não distinguia "GPU travada" de "download grande ainda descendo". Medido em produção:
   * disparou 2× na mesma página (t=52,18 s e t=91,11 s) DURANTE um download legítimo,
   * descartando o carregamento em curso a cada vez — ver A-P1-6 em
   * docs/discovery/A-model-download.md.
   *
   * Agora o relógio reinicia a cada evento de progresso: só derruba o worker depois de
   * ESTE tempo SEM nenhum byte novo. Download lento porém vivo nunca é morto.
   */
  private static readonly WEBGPU_SEM_PROGRESSO_MS = 45_000
  /** Intervalo de checagem do watchdog. */
  private static readonly WATCHDOG_TICK_MS = 5_000
  private forcedDevice: string | null = null
  /** Watchdog da carga em andamento (recebe sinal de vida a cada progresso). */
  private watchdogAtual: { sinalDeVida: () => void; cancelar: () => void } | null = null

  /**
   * Derruba o worker atual e recria FORÇANDO WASM. Usado pelo watchdog de load (GPU que
   * nunca fica pronta) e pelo tratador de erro de runtime (device lost / OOM do WebGPU).
   * Pendências em voo são rejeitadas; a próxima chamada re-inicializa em WASM.
   */
  private fallbackToWasm(): void {
    this.onProgress?.(0, 'GPU indisponível — trocando para o modo compatível (WASM)…')
    try { this.worker?.terminate() } catch { /* já morto */ }
    this.worker = null
    this.asrReady = false
    this.forcedDevice = 'wasm'
    for (const p of this.pending.values()) p.reject(new Error('WebGPU falhou — recarregando em WASM'))
    this.pending.clear()
    this.readyPromise = null
    this.readyResolve = null
    this.readyReject = null
  }

  /** O worker está ocupado (há decode em andamento)? Base do idle-gating dos partials. */
  get busy(): boolean {
    return this.pending.size > 0
  }

  /** Profundidade da fila de decode (enunciados pendentes) — para métrica de saturação. */
  get queueDepth(): number {
    return this.pending.size
  }

  /**
   * Disponível em QUALQUER navegador. O backend padrão é WASM (não exige WebGPU) — por isso a
   * transcrição local funciona em Chrome/Edge/Firefox/Safari/celular. Antes, este método exigia
   * `navigator.gpu` e, sem WebGPU, DESLIGAVA o caminho offline (caía para nuvem): era o bug
   * central que impedia distribuir a versão local. Agora só exige estar rodando num navegador.
   */
  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && typeof Worker !== 'undefined'
  }

  /**
   * Transcreve um PARTIAL só se o worker estiver ocioso; resolve `null` quando ocupado.
   * O parcial é best-effort: descartá-lo (em vez de enfileirar) é o que impede o backlog
   * crescente que fazia o texto ficar 3–6s atrás do áudio.
   */
  async transcribeIfIdle(
    pcm: Float32Array,
    sampleRate: number,
    opts?: { languageHint?: string }
  ): Promise<SttFinal | null> {
    // Se o modelo ainda nem carregou, ou há decode em andamento, pula este parcial.
    if (!this.asrReady || this.pending.size > 0) return null
    return this.transcribePcm(pcm, sampleRate, opts)
  }

  /**
   * Cria o Web Worker se ainda não existe e conecta os message handlers.
   */
  private ensureWorker(): void {
    if (this.worker) return

    this.worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), {
      type: 'module',
    })

    this.worker.onmessage = (msg: MessageEvent) => {
      const { type, id, text, progress, label, message, loaded, total } = msg.data

      switch (type) {
        case 'progress': {
          // Sinal de vida do load: é o que reinicia o watchdog de estagnação.
          this.watchdogAtual?.sinalDeVida()
          if (this.onProgress) {
            this.onProgress(progress, label, typeof total === 'number' && total > 0 ? { loaded, total } : undefined)
          }
          break
        }

        case 'ready': {
          this.asrReady = true
          if (this.readyResolve) {
            this.readyResolve()
          }
          break
        }

        case 'update': {
          // Texto parcial incremental (streaming token-a-token) durante o decode — não resolve
          // a promise, apenas notifica quem quiser exibir o texto crescendo em tempo real.
          const pending = this.pending.get(id)
          pending?.onUpdate?.(text)
          break
        }

        case 'result': {
          const pending = this.pending.get(id)
          if (pending) {
            /* SEM `language`: este adaptador NÃO detecta idioma — ele recebe uma dica e obedece.
               Antes devolvíamos `pending.language`, que é a própria dica ecoada de volta; o
               contrato de `SttFinal.language` é "o que o motor identificou", e devolver a
               pergunta como resposta faria o chamador confundir palpite com medição. Quem
               detecta de verdade é o Whisper de nuvem (verbose_json → `language`). */
            pending.resolve({ text })
            this.pending.delete(id)
          }
          break
        }

        case 'error': {
          const err = new Error(message || 'Whisper worker error')

          if (id) {
            const pending = this.pending.get(id)
            if (pending) {
              pending.reject(err)
              this.pending.delete(id)
            }
          } else if (this.readyReject) {
            this.readyReject(err)
            // A promise REJEITADA precisa ser descartada aqui. Sem isto, o `if (!this.readyPromise)`
            // do preload() devolvia a MESMA promise já rejeitada e o botão "Tentar de novo" não
            // emitia request nenhum — retry inerte (A-P1-7). O watchdog já fazia esse reset; o
            // caminho de erro, não.
            this.readyPromise = null
            this.readyResolve = null
            this.readyReject = null
            this.asrReady = false
          }

          // FALHA DE RUNTIME DO WEBGPU (device lost / out-of-memory sob pressão de GPU —
          // jogo/WSL2 disputando VRAM): o pipeline fica inutilizável. Derruba o worker e
          // recria FORÇANDO WASM — a partir do próximo enunciado, tudo volta a funcionar
          // localmente (mais lento, porém vivo). Mesmo mecanismo do watchdog de load.
          if (!this.forcedDevice && /webgpu|device|d3d12|dawn|buffer/i.test(String(message || ''))) {
            console.warn('[whisper] erro de WebGPU em runtime — recriando o worker em WASM:', String(message).slice(0, 120))
            this.fallbackToWasm()
          }
          break
        }
      }
    }

    this.worker.onerror = (event: ErrorEvent) => {
      const err = new Error(event.message || 'Worker error')

      if (this.readyReject) {
        this.readyReject(err)
      }

      // Rejeita todas as requisições pendentes
      for (const pending of this.pending.values()) {
        pending.reject(err)
      }
      this.pending.clear()
    }
  }

  /**
   * Pré-carrega o modelo Whisper, reportando progresso.
   * Resolve quando o modelo estiver pronto para transcrever.
   */
  async preload(onProgress?: (progress: number, label?: string, bytes?: { loaded: number; total: number }) => void): Promise<void> {
    this.onProgress = onProgress || null

    this.ensureWorker()

    if (!this.readyPromise) {
      this.readyPromise = new Promise<void>((resolve, reject) => {
        this.readyResolve = resolve
        this.readyReject = reject
      })

      this.loadedModel = this.model
      this.worker!.postMessage({ type: 'load', model: this.model, dtype: this.dtype, device: this.device })

      // Watchdog: só quando o caminho efetivo é WebGPU (auto com navigator.gpu, ou forçado).
      const wantsGpu = this.device === 'webgpu' || (this.device === 'auto' && !!(navigator as any).gpu)
      if (wantsGpu && !this.forcedDevice) {
        const armed = this.readyPromise
        // Watchdog por ESTAGNAÇÃO (testado em tests/modelProgress.test.ts): o relógio reinicia a
        // cada byte que chega, então download lento não é confundido com GPU travada.
        const cao = criarWatchdogDeEstagnacao({
          semProgressoMs: WhisperLocalStt.WEBGPU_SEM_PROGRESSO_MS,
          tickMs: WhisperLocalStt.WATCHDOG_TICK_MS,
          aoTravar: (paradoHa) => {
            if (this.asrReady || this.readyPromise !== armed) return // resolveu ou já foi recriado
            console.warn('[whisper] sem progresso há', Math.round(paradoHa / 1000), 's — GPU ocupada/instável. Recriando com WASM…')
            this.onProgress?.(0, 'GPU ocupada — trocando para o modo compatível (WASM)…')
            try { this.worker?.terminate() } catch { /* já morto */ }
            // Zera o estado e força WASM; o retry abaixo reaproveita a MESMA readyPromise externa.
            this.worker = null
            this.asrReady = false
            this.forcedDevice = 'wasm'
            for (const p of this.pending.values()) p.reject(new Error('WebGPU travado — recarregando em WASM'))
            this.pending.clear()
            const resolveOuter = this.readyResolve
            const rejectOuter = this.readyReject
            this.readyPromise = null
            this.readyResolve = null
            this.readyReject = null
            this.preload(this.onProgress || undefined).then(() => resolveOuter?.(), (e) => rejectOuter?.(e))
            // Reancora a promise externa para os awaits antigos continuarem válidos.
            this.readyPromise = armed
          },
        })
        this.watchdogAtual = cao
        armed.then(() => cao.cancelar(), () => cao.cancelar())
      }
    }

    return this.readyPromise
  }

  /**
   * Transcreve um enunciado PCM (Float32 mono, tipicamente 16 kHz).
   * O PCM é transferido para o worker com zero-copy via ArrayBuffer.
   */
  async transcribePcm(
    pcm: Float32Array,
    sampleRate: number,
    opts?: { languageHint?: string; signal?: AbortSignal; onUpdate?: (text: string) => void }
  ): Promise<SttFinal> {
    // Se o modelo já está pronto, NÃO await antes de postar — assim chamadas concorrentes
    // (finais em rajada) chegam ao worker na MESMA ordem em que foram chamadas (FIFO por seq),
    // sem embaralhar por microtask. Só aguarda o preload no cold start.
    if (!this.asrReady) await this.preload()

    const id = Math.random().toString(36).slice(2)

    return new Promise<SttFinal>((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject,
        onUpdate: opts?.onUpdate,
      })

      // Transfere o buffer do PCM (zero-copy) para o worker
      this.worker!.postMessage(
        {
          type: 'transcribe',
          id,
          pcm,
          language: opts?.languageHint,
          device: this.device,
        },
        [pcm.buffer]
      )
    })
  }
}
