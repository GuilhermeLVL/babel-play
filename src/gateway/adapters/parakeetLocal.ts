/**
 * Adapter do PARAKEET TDT 0.6b v3 local (int8, WASM) — a mesma interface dos outros STT locais
 * (`whisperLocal.ts`): carrega com progresso, transcreve um trecho FINAL (16 kHz mono) e devolve o texto.
 *
 * O QUE ELE NÃO FAZ, de propósito:
 *  - texto PARCIAL: não há `transcribeIfIdle` nem `onUpdate`. O modelo não é de fluxo; o parcial da
 *    legenda continua vindo de onde vem hoje (`gateway.stt.transcribePartial`);
 *  - idioma fora do medido: só português e espanhol com dica EXPLÍCITA (`parakeetAceita`). O resto é
 *    recusado com erro, e a cadeia do gateway cai no Whisper local;
 *  - troca de backend ou de quantização: int8 em WASM, o que a bancada mediu
 *    (`docs/auditoria/2026-10-09-medicoes-no-aparelho.md`).
 *
 * Este arquivo entra por `import()` no gateway (fora do JS do arranque); o `onnxruntime-web` só é
 * carregado dentro do worker (`parakeetWorker.ts`), quando alguém manda carregar o modelo.
 */
import { distribuirThreads } from '../../lib/dispositivo/orcamentoDeThreads';
import { perfilDoDispositivo } from '../../lib/dispositivo/perfil';
import type { SttFinal, SttProvider } from '../capabilities';
import { gravarManifesto, MENSAGEM_DO_MANIFESTO } from '../modelManifest';
import { planoDaPaginaDoParakeet } from './parakeetArquivos';
import { ADAPTADOR_DO_PARAKEET, ID_DO_PARAKEET, parakeetAceita } from './parakeetModelo';
import type { MensagemDoParakeet, MensagemParaOParakeet } from './parakeetWorker';

interface Pendente {
  resolve: (value: SttFinal) => void;
  reject: (error: Error) => void;
}

type AoProgredir = (progress: number, label?: string, bytes?: { loaded: number; total: number }) => void;

/** Erro de "cancelado por quem pediu" — o mesmo nome que o `fetch` usa, para o chamador reconhecer. */
function erroDeAborto(): Error {
  const e = new Error('transcrição cancelada');
  e.name = 'AbortError';
  return e;
}

export class ParakeetLocalStt implements SttProvider {
  readonly id = ADAPTADOR_DO_PARAKEET;
  readonly runtime = 'browser' as const;
  readonly cost = 'free' as const;
  readonly label = 'Parakeet v3 local (WASM)';

  readonly supportsLiveMic = false;
  readonly supportsBlob = true;

  private worker: Worker | null = null;
  private pronto: Promise<void> | null = null;
  private resolverPronto: (() => void) | null = null;
  private rejeitarPronto: ((e: Error) => void) | null = null;
  private carregado = false;
  private pendentes = new Map<string, Pendente>();
  private aoProgredir: AoProgredir | null = null;
  /**
   * O MOTOR não abriu neste aparelho (o WASM, a sessão de 652 MB, o aquecimento): tentar de novo a
   * cada trecho seria baixar/ler 672 MB para falhar igual. Vale até recarregar a página. Rede e
   * integridade NÃO ficam lembradas: a próxima preparação tenta de novo.
   */
  private falhaDoMotor: Error | null = null;

  /** O modelo que este adapter carrega (o selo da tela usa o mesmo nome dos outros adapters). */
  get modeloAtual(): string {
    return ID_DO_PARAKEET;
  }

  get busy(): boolean {
    return this.pendentes.size > 0;
  }

  get queueDepth(): number {
    return this.pendentes.size;
  }

  isAvailable(): boolean {
    return typeof Worker !== 'undefined' && typeof WebAssembly === 'object' && !this.falhaDoMotor;
  }

  /** Encerra o worker (o heap do WASM, ~2 GB, só volta ao sistema com o `terminate()`) e esquece a carga. */
  liberar(motivo = new Error('modelo de transcrição liberado')): void {
    try {
      this.worker?.terminate();
    } catch {
      /* já morto */
    }
    this.worker = null;
    this.carregado = false;
    this.rejeitarPronto?.(motivo);
    this.pronto = null;
    this.resolverPronto = null;
    this.rejeitarPronto = null;
    for (const p of this.pendentes.values()) p.reject(motivo);
    this.pendentes.clear();
  }

  private enviar(m: MensagemParaOParakeet): void {
    this.worker?.postMessage(m);
  }

  private garantirWorker(): void {
    if (this.worker) return;
    this.worker = new Worker(new URL('./parakeetWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (msg: MessageEvent) => {
      const m = msg.data as MensagemDoParakeet | { type: typeof MENSAGEM_DO_MANIFESTO; manifesto: never };
      switch (m.type) {
        case MENSAGEM_DO_MANIFESTO:
          // O Worker não tem localStorage: o manifesto do download é gravado aqui, na janela.
          gravarManifesto(m.manifesto);
          break;
        case 'progress':
          this.aoProgredir?.(m.progress, m.label, m.total > 0 ? { loaded: m.loaded, total: m.total } : undefined);
          break;
        case 'ready':
          this.carregado = true;
          this.resolverPronto?.();
          break;
        case 'loadError': {
          const erro = new Error(`Parakeet não carregou (${m.motivo}): ${m.message}`);
          if (m.motivo === 'motor') this.falhaDoMotor = erro;
          // Solta o worker e a promessa REJEITADA: o próximo `preload` começa do zero (retry de verdade).
          this.liberar(erro);
          break;
        }
        case 'result': {
          const p = this.pendentes.get(m.id);
          if (!p) break;
          this.pendentes.delete(m.id);
          p.resolve(m.descartado ? { text: m.text, alucinacaoDescartada: true } : { text: m.text });
          break;
        }
        case 'cancelado': {
          const p = this.pendentes.get(m.id);
          if (!p) break;
          this.pendentes.delete(m.id);
          p.reject(erroDeAborto());
          break;
        }
        case 'error': {
          const p = this.pendentes.get(m.id);
          if (!p) break;
          this.pendentes.delete(m.id);
          p.reject(new Error(m.message || 'erro no worker do Parakeet'));
          break;
        }
      }
    };
    this.worker.onerror = (evento: ErrorEvent) => {
      // O worker morreu (script que não carrega, falta de memória): nada pendente fica sem resposta.
      this.liberar(new Error(evento.message || 'erro no worker do Parakeet'));
    };
  }

  /**
   * Pré-carrega o modelo, reportando progresso por bytes. Resolve quando estiver pronto para
   * transcrever; rejeita com o motivo (rede, integridade, motor) — o gateway então cai no Whisper.
   */
  async preload(onProgress?: AoProgredir): Promise<void> {
    if (this.falhaDoMotor) throw this.falhaDoMotor;
    if (onProgress) this.aoProgredir = onProgress;
    this.garantirWorker();
    if (!this.pronto) {
      this.pronto = new Promise<void>((resolve, reject) => {
        this.resolverPronto = resolve;
        this.rejeitarPronto = reject;
      });
      /* Threads pelo ORÇAMENTO GLOBAL (`orcamentoDeThreads.ts`), a mesma parte do Whisper: o Parakeet
         entra NO LUGAR dele. 4 num computador de 8 núcleos ou mais; 1 sem isolamento de origem. */
      const perfil = perfilDoDispositivo();
      const threads = distribuirThreads({
        nucleos: perfil.sinais.nucleos,
        isolado: perfil.sinais.isolado,
        leve: perfil.leve,
        quest: perfil.tipo === 'quest',
      }).whisper;
      this.enviar({ type: 'carregar', plano: planoDaPaginaDoParakeet(), threads });
    }
    return this.pronto;
  }

  /**
   * Transcreve um trecho FINAL (Float32 mono a 16 kHz). O PCM vai ao worker por CÓPIA, não por
   * transferência: se este motor falhar, a cadeia do gateway entrega o MESMO trecho ao Whisper, e um
   * buffer transferido chegaria lá vazio. Um trecho de 6 s são 384 KB.
   */
  async transcribePcm(
    pcm: Float32Array,
    sampleRate: number,
    opts?: { languageHint?: string; signal?: AbortSignal },
  ): Promise<SttFinal> {
    if (!parakeetAceita(opts?.languageHint))
      throw new Error(`Parakeet só atende português e espanhol (pedido: ${opts?.languageHint || 'sem idioma'})`);
    if (sampleRate !== 16000) throw new Error(`Parakeet espera áudio a 16 kHz (recebeu ${sampleRate} Hz)`);
    if (opts?.signal?.aborted) throw erroDeAborto();
    // Pronto: posta sem `await`, para finais em rajada chegarem ao worker na ordem em que foram pedidos.
    if (!this.carregado) await this.preload();
    if (opts?.signal?.aborted) throw erroDeAborto();

    const id = Math.random().toString(36).slice(2);
    return new Promise<SttFinal>((resolve, reject) => {
      this.pendentes.set(id, { resolve, reject });
      opts?.signal?.addEventListener(
        'abort',
        () => {
          if (this.pendentes.has(id)) this.enviar({ type: 'cancelar', id });
        },
        { once: true },
      );
      this.enviar({ type: 'transcrever', id, pcm, idioma: opts?.languageHint });
    });
  }
}
