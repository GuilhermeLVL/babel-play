/**
 * Adapter Whisper local (on-device no navegador) — espelho do whisper-server do desktop,
 * mas web-nativo via Web Worker. Backend PADRÃO = `auto`: WebGPU quando há um ADAPTADOR de verdade
 * (`adaptadorWebGpu.ts`), WASM no resto; `babel.whisperDevice` força um dos dois.
 */
import { perfilDoDispositivo } from '../../lib/dispositivo/perfil';
import { temAdaptadorWebGpu } from '../adaptadorWebGpu';
import type { AvisoDeDegradacaoDoStt, SttFinal, SttProvider } from '../capabilities';
import { gravarManifesto, MENSAGEM_DO_MANIFESTO } from '../modelManifest';
import { WHISPER_MODELS } from '../sttRouter';
import { criarWatchdogDeEstagnacao } from './modelProgress';
import { ehMoonshine, moonshineAceita } from './moonshine';

interface PendingRequest {
  resolve: (value: SttFinal) => void;
  reject: (error: Error) => void;
  /** Callback opcional de texto incremental (streaming token-a-token) durante o decode. */
  onUpdate?: (text: string) => void;
  /**
   * O worker respondeu `cancelado` (descartado na fila ou parado no meio). Parcial: resolve vazio.
   * Final: rejeita com AbortError (só acontece quando quem pediu cancelou pelo `signal`).
   */
  aoCancelar: () => void;
}

/** Erro de "cancelado por quem pediu" — o mesmo nome que o `fetch` usa, para o chamador reconhecer. */
function erroDeAborto(): Error {
  const e = new Error('transcrição cancelada');
  e.name = 'AbortError';
  return e;
}

/**
 * O MODELO QUE CABE SEM GPU. O small em WASM não é tempo real (auditoria de latência 2026-09-26:
 * legenda 18,6 s p50 depois da fala, com fila crescente); o base é o multilíngue que a bancada
 * aponta para CPU (WER pt 18,0% contra 11,0% do small, mas a 4,8 s em vez de 18,6 s).
 */
function modeloParaWasm(modelo: string): string {
  return modelo === WHISPER_MODELS.small ? WHISPER_MODELS.base : modelo;
}

export class WhisperLocalStt implements SttProvider {
  readonly id = 'whisper-local';
  readonly runtime = 'browser' as const;
  readonly cost = 'free' as const;
  readonly label = 'Whisper local (WASM/WebGPU)';

  readonly supportsLiveMic = false;
  readonly supportsBlob = true;

  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((err: Error) => void) | null = null;
  private pending = new Map<string, PendingRequest>();
  private onProgress: ((progress: number, label?: string, bytes?: { loaded: number; total: number }) => void) | null =
    null;
  /** Quem quer saber quando o motor degradou sozinho (GPU → WASM, small → base). */
  private aoDegradar: ((aviso: AvisoDeDegradacaoDoStt) => void) | null = null;
  /** true depois que o modelo terminou de carregar (worker respondeu 'ready'). */
  private asrReady = false;
  /** Device com que a carga ATUAL foi pedida ao worker ('webgpu' | 'wasm'). */
  private deviceDaCarga: 'webgpu' | 'wasm' | null = null;

  /** Modelo pedido pelo ROTEADOR (sttRouter) — vence o override manual e o default. */
  private routedModel: string | null = null;
  /** Modelo com que o worker ATUAL foi carregado (para saber quando recriar). */
  private loadedModel: string | null = null;
  /** Quantização pedida pelo ROTEADOR (`q8` no celular/Quest) e com qual o worker ATUAL carregou. */
  private routedDtype: string | null = null;
  private loadedDtype: string | null = null;
  /** Backend pedido pelo ROTEADOR (`wasm` junto com o q8; `webgpu` no Quest/celular com GPU provada). */
  private routedDevice: 'wasm' | 'webgpu' | null = null;

  /**
   * Modelo Whisper. Override via localStorage `babel.whisperModel` — permite trocar
   * base↔tiny sem recompilar (tiny ≈ 3–4× mais rápido, menos preciso). Default: tiny.
   */
  private get model(): string {
    if (this.routedModel) return this.routedModel;
    try {
      return localStorage.getItem('babel.whisperModel') || 'onnx-community/whisper-tiny';
    } catch {
      return 'onnx-community/whisper-tiny';
    }
  }

  /** O modelo que está (ou vai estar) carregado — para o selo da tela dizer a verdade depois de uma degradação. */
  get modeloAtual(): string {
    return this.model;
  }

  /**
   * Troca o modelo local (chamado pelo roteador antes de cada sessão). Se o worker já
   * carregou OUTRO modelo, derruba e recria — mesma mecânica do fallback de device.
   * Chamar com o modelo já carregado é no-op (não paga teardown à toa).
   */
  setModel(modelId: string, opcoes?: { dtype?: string; device?: 'wasm' | 'webgpu' }): void {
    if (!modelId) return;
    // Já degradamos para WASM nesta página: o roteador ainda pode pedir o small (ele não sabe da
    // queda), mas o small em WASM não é tempo real — fica o modelo que cabe.
    const alvo = this.forcedDevice === 'wasm' ? modeloParaWasm(modelId) : modelId;
    this.routedModel = alvo;
    // Sem `opcoes`, quem chama (a guarda do moonshine, rotas antigas) mantém o dtype já roteado.
    if (opcoes) {
      this.routedDtype = opcoes.dtype ?? null;
      this.routedDevice = opcoes.device ?? null;
    }
    const trocouModelo = !!this.loadedModel && this.loadedModel !== alvo;
    const trocouDtype = !!this.loadedDtype && this.loadedDtype !== this.dtype;
    // O regulador troca SÓ o backend (`trocar-backend`): mesmo modelo e dtype, outro device.
    const pedido = this.device;
    const trocouDevice =
      !!this.deviceDaCarga && (pedido === 'wasm' || pedido === 'webgpu') && pedido !== this.deviceDaCarga;
    if (this.worker && (trocouModelo || trocouDtype || trocouDevice)) {
      console.log(
        '[whisper] roteador trocou o modelo:',
        this.loadedModel,
        '→',
        alvo,
        `(${this.dtype}) recriando worker`,
      );
      this.liberar(new Error('modelo de transcrição trocado, recarregando'));
    }
  }

  /**
   * LIBERA a memória do modelo: encerra o worker (o heap do WASM só volta ao sistema com o
   * `terminate()` — relato de campo com ONNX Runtime Web no iOS, zenn.dev/kaz_sakai) e esquece a
   * preparação. A próxima transcrição ou `preload` recria tudo do cache. Chamado ao sair da captura
   * em aparelho com pouca memória (`perfilDoDispositivo().poucaMemoria`).
   */
  liberar(motivo = new Error('modelo de transcrição liberado')): void {
    this.derrubarWorker(motivo);
    this.readyReject?.(motivo);
    this.readyPromise = null;
    this.readyResolve = null;
    this.readyReject = null;
  }

  /**
   * Preset de quantização (override via localStorage `babel.whisperDtype`). Default `hybrid`:
   * encoder fp32 + decoder q4. MEDIDO: fp32 dá ~480ms/decode; fp16 (apesar de menor no disco)
   * ficou ~2570ms neste WebGPU — a velocidade de decode importa muito mais que o download
   * único de 33MB (fica em cache). Se seu hardware for diferente, teste 'hybrid-fp16'.
   */
  private get dtype(): string {
    try {
      return localStorage.getItem('babel.whisperDtype') || this.routedDtype || 'hybrid';
    } catch {
      return this.routedDtype || 'hybrid';
    }
  }

  /**
   * Backend de inferência (override via localStorage `babel.whisperDevice`): `auto|wasm|webgpu`.
   * PADRÃO `auto`: WebGPU quando há adaptador (MUITO mais rápido — decode ~0,48s vs ~5,2s no WASM
   * single-thread) e WASM onde não há (Firefox/Safari/celular, headless, GPU bloqueada), mantendo a
   * transcrição local UNIVERSAL. Force `wasm`/`webgpu` para testar/comparar.
   */
  private get device(): string {
    if (this.forcedDevice) return this.forcedDevice;
    try {
      return localStorage.getItem('babel.whisperDevice') || this.routedDevice || 'auto';
    } catch {
      return this.routedDevice || 'auto';
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
  private static readonly WEBGPU_SEM_PROGRESSO_MS = 45_000;
  /** Intervalo de checagem do watchdog. */
  private static readonly WATCHDOG_TICK_MS = 5_000;
  private forcedDevice: string | null = null;
  /** Watchdog da carga em andamento (recebe sinal de vida a cada progresso). */
  private watchdogAtual: { sinalDeVida: () => void; cancelar: () => void } | null = null;

  /** Encerra o worker atual e rejeita o que estava pendente nele. */
  private derrubarWorker(motivo: Error): void {
    try {
      this.worker?.terminate();
    } catch {
      /* já morto */
    }
    this.worker = null;
    this.asrReady = false;
    this.loadedModel = null;
    this.loadedDtype = null;
    this.deviceDaCarga = null;
    this.watchdogAtual?.cancelar();
    this.watchdogAtual = null;
    for (const p of this.pending.values()) p.reject(motivo);
    this.pending.clear();
  }

  /**
   * A GPU NÃO SERVIU: recria o worker em WASM, com o modelo que cabe em CPU, e AVISA.
   *
   * Três portas levam aqui: o watchdog (GPU que nunca fica pronta), um erro na CARGA ("no available
   * backend found", sessão WebGPU que não abre) e um erro de GPU em RUNTIME (device lost, falta de
   * memória). Antes, a falha na carga rejeitava a preparação e a captura ficava sem legenda com as
   * falas guardadas para sempre; e a queda em runtime recriava o SMALL em WASM (18,6 s por legenda).
   *
   * A carga recomeça SOZINHA: quem já esperava a preparação continua esperando a mesma promessa, que
   * resolve quando o WASM responder `ready`.
   */
  private recarregarEmWasm(motivo: AvisoDeDegradacaoDoStt['motivo'], detalhe: string): void {
    const modeloAntes = this.model;
    const armada = this.readyPromise;
    const carregando = !!armada && !this.asrReady;
    console.warn('[whisper]', motivo, '→ recriando o worker em WASM:', detalhe.slice(0, 160));
    this.derrubarWorker(new Error('GPU indisponível, recarregando em WASM'));
    this.forcedDevice = 'wasm';
    this.routedModel = modeloParaWasm(modeloAntes);
    /* A rota da GPU no Quest/celular (`device: 'webgpu'`) volta ao que o aparelho rodava antes dela:
       q8 no WASM (o hybrid-fp16 em CPU é mais lento e baixa o dobro). O desktop fica no dtype dele. */
    if (this.routedDevice === 'webgpu') {
      this.routedDevice = 'wasm';
      this.routedDtype = 'q8';
    }
    this.onProgress?.(0, 'GPU indisponível, trocando para o modo compatível (WASM)…');
    this.aoDegradar?.({ motivo, modeloAntes, modelo: this.model, device: 'wasm', detalhe });
    if (carregando && armada) {
      // Mesma promessa de preparação: quem espera por ela não percebe a troca, só o aviso.
      this.ensureWorker();
      void this.iniciarCarga(armada);
    } else {
      // Já estava pronto (queda em runtime): a próxima preparação carrega o WASM. Começa já, para o
      // próximo trecho não pagar a carga inteira.
      this.readyPromise = null;
      this.readyResolve = null;
      this.readyReject = null;
      void this.preload().catch(() => {
        /* o erro aparece para quem pedir a próxima transcrição */
      });
    }
  }

  /** O worker está ocupado (há decode em andamento)? Base do idle-gating dos partials. */
  get busy(): boolean {
    return this.pending.size > 0;
  }

  /** Profundidade da fila de decode (enunciados pendentes) — para métrica de saturação. */
  get queueDepth(): number {
    return this.pending.size;
  }

  /**
   * Disponível em QUALQUER navegador. O backend padrão é WASM (não exige WebGPU) — por isso a
   * transcrição local funciona em Chrome/Edge/Firefox/Safari/celular. Antes, este método exigia
   * `navigator.gpu` e, sem WebGPU, DESLIGAVA o caminho offline (caía para nuvem): era o bug
   * central que impedia distribuir a versão local. Agora só exige estar rodando num navegador.
   */
  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && typeof Worker !== 'undefined';
  }

  /**
   * Transcreve um PARTIAL só se o worker estiver ocioso; resolve `null` quando ocupado.
   * O parcial é best-effort: descartá-lo (em vez de enfileirar) é o que impede o backlog
   * crescente que fazia o texto ficar 3–6s atrás do áudio. Vai ao worker com prioridade `parcial`:
   * se o final da fala chegar enquanto ele decodifica, o worker o PARA e o final vai na frente
   * (resolve `null` também nesse caso).
   */
  async transcribeIfIdle(
    pcm: Float32Array,
    sampleRate: number,
    opts?: { languageHint?: string },
  ): Promise<SttFinal | null> {
    // Se o modelo ainda nem carregou, ou há decode em andamento, pula este parcial.
    if (!this.asrReady || this.pending.size > 0) return null;
    if (ehMoonshine(this.model) && !moonshineAceita(opts?.languageHint)) return null; // o final troca o modelo
    return this.postarDecode(pcm, { languageHint: opts?.languageHint, prioridade: 'parcial' });
  }

  /**
   * Cria o Web Worker se ainda não existe e conecta os message handlers.
   */
  private ensureWorker(): void {
    if (this.worker) return;

    this.worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (msg: MessageEvent) => {
      const { type, id, text, progress, label, message, loaded, total, descartado, language, confiancaDoIdioma } =
        msg.data;

      switch (type) {
        case MENSAGEM_DO_MANIFESTO:
          // O Worker não tem localStorage: o manifesto do download é gravado aqui, na janela.
          gravarManifesto(msg.data.manifesto);
          break;
        case 'progress': {
          // Sinal de vida do load: é o que reinicia o watchdog de estagnação.
          this.watchdogAtual?.sinalDeVida();
          if (this.onProgress) {
            this.onProgress(progress, label, typeof total === 'number' && total > 0 ? { loaded, total } : undefined);
          }
          break;
        }

        case 'ready': {
          this.asrReady = true;
          this.watchdogAtual?.cancelar();
          this.watchdogAtual = null;
          if (this.readyResolve) {
            this.readyResolve();
          }
          break;
        }

        case 'update': {
          // Texto parcial incremental (streaming token-a-token) durante o decode — não resolve
          // a promise, apenas notifica quem quiser exibir o texto crescendo em tempo real.
          const pending = this.pending.get(id);
          pending?.onUpdate?.(text);
          break;
        }

        case 'cancelado': {
          const pending = this.pending.get(id);
          if (pending) {
            this.pending.delete(id);
            pending.aoCancelar();
          }
          break;
        }

        case 'result': {
          const pending = this.pending.get(id);
          if (pending) {
            /* `language` SÓ quando o worker MEDIU (trecho sem dica, "Detectar"): o contrato de
               `SttFinal.language` é "o que o motor identificou". Com dica, o worker obedece e não
               devolve idioma — ecoar a dica faria o chamador confundir palpite com medição. */
            const medido = typeof language === 'string' && language ? { language, confiancaDoIdioma } : {};
            this.pending.delete(id);
            pending.resolve(descartado ? { text, alucinacaoDescartada: true, ...medido } : { text, ...medido });
          }
          break;
        }

        case 'error': {
          const err = new Error(message || 'Whisper worker error');
          const deGpu = /webgpu|device|d3d12|dawn|buffer|backend/i.test(String(message || ''));

          if (id) {
            const pending = this.pending.get(id);
            if (pending) {
              this.pending.delete(id);
              pending.reject(err);
            }
            // FALHA DE RUNTIME DO WEBGPU (device lost / out-of-memory sob pressão de GPU —
            // jogo/WSL2 disputando VRAM): o pipeline fica inutilizável. Recria em WASM.
            if (this.deviceDaCarga === 'webgpu' && deGpu) this.recarregarEmWasm('falha-gpu', String(message));
            break;
          }

          /* ERRO NA CARGA. No WebGPU, a saída é o WASM (e o modelo que cabe nele), sem deixar a
             preparação cair: "no available backend found" no headless era captura sem legenda. */
          if (this.deviceDaCarga === 'webgpu') {
            this.recarregarEmWasm('sem-gpu', String(message));
            break;
          }
          if (this.readyReject) {
            this.readyReject(err);
            // A promise REJEITADA precisa ser descartada aqui. Sem isto, o `if (!this.readyPromise)`
            // do preload() devolvia a MESMA promise já rejeitada e o botão "Tentar de novo" não
            // emitia request nenhum — retry inerte (A-P1-7). O watchdog já fazia esse reset; o
            // caminho de erro, não.
            this.readyPromise = null;
            this.readyResolve = null;
            this.readyReject = null;
            this.asrReady = false;
          }
          break;
        }
      }
    };

    this.worker.onerror = (event: ErrorEvent) => {
      const err = new Error(event.message || 'Worker error');

      if (this.readyReject) {
        this.readyReject(err);
      }

      // Rejeita todas as requisições pendentes
      for (const pending of this.pending.values()) {
        pending.reject(err);
      }
      this.pending.clear();
    };
  }

  /**
   * Pede a carga ao worker: resolve o device (`auto` → pergunta pelo adaptador WebGPU real), troca
   * o small pelo base quando não há GPU, e arma o watchdog se a carga for no WebGPU.
   */
  private async iniciarCarga(armada: Promise<void>): Promise<void> {
    const pedido = this.device;
    const device: 'webgpu' | 'wasm' =
      pedido === 'webgpu' || pedido === 'wasm' ? pedido : (await temAdaptadorWebGpu()) ? 'webgpu' : 'wasm';
    if (this.readyPromise !== armada || !this.worker) return; // recriado enquanto perguntava
    /* SEM GPU, SEM SMALL. O roteador já escolhe o base quando não há adaptador; isto cobre quem pediu
       o small por outro caminho (qualidade "preciso"). Só no `auto`: quem força `wasm` à mão está
       medindo, e recebe o que pediu. */
    if (
      device === 'wasm' &&
      pedido === 'auto' &&
      !ehMoonshine(this.model) &&
      modeloParaWasm(this.model) !== this.model
    ) {
      const antes = this.model;
      this.routedModel = modeloParaWasm(antes);
      this.aoDegradar?.({ motivo: 'sem-gpu', modeloAntes: antes, modelo: this.model, device: 'wasm', detalhe: '' });
    }
    this.loadedModel = this.model;
    this.loadedDtype = this.dtype;
    this.deviceDaCarga = ehMoonshine(this.model) ? 'wasm' : device;
    // Threads do WASM pelo PERFIL: 1 sem isolamento (sem SharedArrayBuffer), 2 no celular fraco.
    const threads = perfilDoDispositivo().threadsWasm;
    this.worker.postMessage({ type: 'load', model: this.model, dtype: this.dtype, device, threads });

    // Watchdog: só quando o caminho efetivo é WebGPU. O moonshine carrega sempre em WASM.
    if (this.deviceDaCarga !== 'webgpu') return;
    // Watchdog por ESTAGNAÇÃO (testado em tests/modelProgress.test.ts): o relógio reinicia a
    // cada byte que chega, então download lento não é confundido com GPU travada.
    const cao = criarWatchdogDeEstagnacao({
      semProgressoMs: WhisperLocalStt.WEBGPU_SEM_PROGRESSO_MS,
      tickMs: WhisperLocalStt.WATCHDOG_TICK_MS,
      aoTravar: (paradoHa) => {
        if (this.asrReady || this.readyPromise !== armada) return; // resolveu ou já foi recriado
        this.recarregarEmWasm('gpu-travada', `sem progresso há ${Math.round(paradoHa / 1000)} s`);
      },
    });
    this.watchdogAtual = cao;
    armada.then(
      () => cao.cancelar(),
      () => cao.cancelar(),
    );
  }

  /**
   * Pré-carrega o modelo Whisper, reportando progresso.
   * Resolve quando o modelo estiver pronto para transcrever. `aoDegradar` é avisado se a carga
   * trocar de motor sozinha (GPU que não serve → WASM com o base).
   */
  async preload(
    onProgress?: (progress: number, label?: string, bytes?: { loaded: number; total: number }) => void,
    opts?: { aoDegradar?: (aviso: AvisoDeDegradacaoDoStt) => void },
  ): Promise<void> {
    if (onProgress) this.onProgress = onProgress;
    if (opts?.aoDegradar) this.aoDegradar = opts.aoDegradar;

    this.ensureWorker();

    if (!this.readyPromise) {
      const armada = new Promise<void>((resolve, reject) => {
        this.readyResolve = resolve;
        this.readyReject = reject;
      });
      this.readyPromise = armada;
      void this.iniciarCarga(armada);
    }

    return this.readyPromise;
  }

  /** Posta um decode ao worker e devolve a promessa do resultado (null = parcial descartado). */
  private postarDecode(
    pcm: Float32Array,
    opts: {
      languageHint?: string;
      prioridade: 'final' | 'parcial';
      signal?: AbortSignal;
      onUpdate?: (text: string) => void;
    },
  ): Promise<SttFinal | null> {
    const id = Math.random().toString(36).slice(2);
    const worker = this.worker!;
    return new Promise<SttFinal | null>((resolve, reject) => {
      if (opts.signal?.aborted) {
        reject(erroDeAborto());
        return;
      }
      this.pending.set(id, {
        resolve,
        reject,
        onUpdate: opts.onUpdate,
        aoCancelar: () => (opts.prioridade === 'parcial' ? resolve(null) : reject(erroDeAborto())),
      });
      opts.signal?.addEventListener(
        'abort',
        () => {
          // Quem pediu desistiu (ex.: final especulativo cuja fala continuou): o worker descarta ou
          // para no meio, e responde `cancelado`.
          if (this.pending.has(id)) worker.postMessage({ type: 'cancelar', id });
        },
        { once: true },
      );

      // Transfere o buffer do PCM (zero-copy) para o worker
      worker.postMessage(
        {
          type: 'transcribe',
          id,
          pcm,
          language: opts.languageHint,
          device: this.deviceDaCarga ?? this.device,
          prioridade: opts.prioridade,
        },
        [pcm.buffer],
      );
    });
  }

  /**
   * Transcreve um enunciado PCM (Float32 mono, tipicamente 16 kHz).
   * O PCM é transferido para o worker com zero-copy via ArrayBuffer. Vai com prioridade `final`:
   * passa na frente de qualquer parcial e para o parcial em voo.
   */
  async transcribePcm(
    pcm: Float32Array,
    _sampleRate: number,
    opts?: { languageHint?: string; signal?: AbortSignal; onUpdate?: (text: string) => void },
  ): Promise<SttFinal> {
    // GUARDA DO MOONSHINE (só inglês): o roteador não o escolhe fora do inglês, mas quem vê a dica
    // de CADA trecho é este adapter. Com o moonshine carregado (rota antiga, override manual em
    // `babel.whisperModel`) e uma dica de outro idioma, troca para o whisper-base — multilíngue e
    // leve o bastante para WASM — em vez de mandar português a um modelo que o devolveria como
    // inglês inventado. `setModel` recria o worker; o preload abaixo carrega o novo modelo.
    if (ehMoonshine(this.model) && !moonshineAceita(opts?.languageHint)) {
      console.warn('[whisper] moonshine só transcreve inglês; dica', opts?.languageHint, '→ whisper-base');
      this.setModel(WHISPER_MODELS.base);
    }

    // Se o modelo já está pronto, NÃO await antes de postar — assim chamadas concorrentes
    // (finais em rajada) chegam ao worker na MESMA ordem em que foram chamadas (FIFO por seq),
    // sem embaralhar por microtask. Só aguarda o preload no cold start.
    if (!this.asrReady) await this.preload();

    const r = await this.postarDecode(pcm, {
      languageHint: opts?.languageHint,
      prioridade: 'final',
      signal: opts?.signal,
      onUpdate: opts?.onUpdate,
    });
    if (!r) throw erroDeAborto();
    return r;
  }
}
