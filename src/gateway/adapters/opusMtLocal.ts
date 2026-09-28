import { ChamadaCancelada, MotorAindaCarregando } from '@core';

import type { MtOptions, MtResult, TranslationProvider } from '../capabilities';
import { gravarManifesto, MENSAGEM_DO_MANIFESTO } from '../modelManifest';

/**
 * Tradução LOCAL on-device (opus-mt via Transformers.js num Web Worker WASM). Sem rede, sem
 * chave, funciona offline. Cobre PT/ES/FR/IT/… ↔ EN. Roda em WASM para não disputar a GPU
 * com o Whisper.
 *
 * NÃO-BLOQUEANTE: o modelo (~113MB) carrega em BACKGROUND. Enquanto não estiver pronto, cada
 * `translate` falha rápido (o gateway cai para o próximo adapter — Chrome Translator/MyMemory),
 * em vez de segurar a tradução esperando o download. Quando fica pronto, passa a atender.
 *
 * O "falha rápido" é `MotorAindaCarregando`, um PULO: não conta no disjuntor (Quest emulado,
 * 2026-09-28 — contado como falha, abria o disjuntor por 30 s e a primeira tradução real chegava
 * aos 54,6 s com o modelo pronto aos 29,3 s). Quando o modelo fica pronto, `aoFicarPronto` avisa
 * o gateway (fecha o disjuntor) e a captura (retraduz o que ficou sem tradução).
 */
export class OpusMtLocal implements TranslationProvider {
  readonly id = 'opus-mt-local';
  readonly runtime = 'browser' as const;
  readonly cost = 'free' as const;
  readonly label = 'opus-mt local (on-device)';

  private worker: Worker | null = null;
  private pending = new Map<string, { resolve: (t: string) => void; reject: (e: Error) => void }>();
  private ready = new Set<string>(); // modelos carregados e prontos
  private loading = new Set<string>(); // modelos com preload em andamento
  private failed = new Set<string>(); // modelos que falharam o carregamento nesta máquina (não re-tenta)
  private onProgress: ((p: number, label?: string, bytes?: { loaded: number; total: number }) => void) | null = null;
  private prontidao = new Set<(modelo: string) => void>();

  private readonly ROMANCE = new Set(['pt', 'es', 'fr', 'it', 'ro', 'ca', 'gl']);
  private readonly DEDICADOS = new Set(['es', 'fr', 'it', 'de']);

  private modelFor(src: string, tgt: string): string | null {
    const s = src.toLowerCase().split('-')[0];
    const t = tgt.toLowerCase().split('-')[0];
    if (s === t) return null;
    // Espelho de `dirConfig` no worker: dedicados para es/fr/it/de, ROMANCE para o resto.
    if (s === 'en' && this.DEDICADOS.has(t)) return `Xenova/opus-mt-en-${t}`;
    if (this.DEDICADOS.has(s) && t === 'en') return `Xenova/opus-mt-${s}-en`;
    if (s === 'en' && t === 'pt') return 'Xenova/opus-mt-en-ROMANCE'; // só pt tem o ID do token (ver worker)
    if (this.ROMANCE.has(s) && t === 'en') return 'Xenova/opus-mt-ROMANCE-en';
    return null;
  }

  supports(src: string | null, tgt: string): boolean {
    if (!src || !tgt) return false;
    const model = this.modelFor(src, tgt);
    // Modelo que já falhou o carregamento aqui deixa de ser "suportado" → o gateway o pula
    // e roteia direto para o próximo tradutor (Chrome/Edge Translator), sem re-tentar.
    return model !== null && !this.failed.has(model);
  }

  /** Avisa quando um modelo fica PRONTO. Devolve quem solta o ouvinte. */
  aoFicarPronto(fn: (modelo: string) => void): () => void {
    this.prontidao.add(fn);
    return () => this.prontidao.delete(fn);
  }

  /**
   * Encerra o worker e esquece os modelos carregados: o heap do WASM só volta ao sistema com o
   * `terminate()`. A próxima tradução recria o worker e recarrega do cache. `failed` fica: um modelo
   * que não abre neste navegador continua não abrindo.
   */
  liberar(): void {
    try {
      this.worker?.terminate();
    } catch {
      /* já morto */
    }
    this.worker = null;
    this.ready.clear();
    this.loading.clear();
    const err = new Error('tradutor local liberado');
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private ensureWorker(): void {
    if (this.worker) return;
    this.worker = new Worker(new URL('./mtWorker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (msg: MessageEvent) => {
      const { type, id, text, message, model, progress, label, loaded, total } = msg.data;
      // O Worker não tem localStorage: o manifesto do download é gravado aqui, na janela.
      if (type === MENSAGEM_DO_MANIFESTO) {
        gravarManifesto(msg.data.manifesto);
        return;
      }
      if (type === 'progress') {
        this.onProgress?.(progress, label, typeof total === 'number' && total > 0 ? { loaded, total } : undefined);
        return;
      }
      if (type === 'ready') {
        this.ready.add(model);
        this.loading.delete(model);
        // Antes do progresso: o disjuntor fecha ANTES de a captura pedir as retraduções.
        for (const fn of this.prontidao) {
          try {
            fn(model);
          } catch {
            /* ouvinte com defeito não impede o resto */
          }
        }
        this.onProgress?.(1, 'Tradutor pronto');
        return;
      }
      if (type === 'loadError') {
        // O modelo não carrega neste ambiente (ex.: ORT não cria a sessão ONNX). Marca como
        // falho para PARAR de re-tentar a cada tradução — o gateway usa o próximo adapter.
        this.loading.delete(model);
        this.failed.add(model);
        return;
      }
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      if (type === 'result') p.resolve(text);
      // Parcial velho que o final atropelou: não é falha do tradutor (não abre o disjuntor, não cai na cascata).
      else if (type === 'cancelado') p.reject(new ChamadaCancelada('tradução de parcial substituída pela do final'));
      else p.reject(new Error(message || 'opus-mt worker error'));
    };
    this.worker.onerror = (ev: ErrorEvent) => {
      const err = new Error(ev.message || 'opus-mt worker crashed');
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
  }

  /**
   * Aquece o modelo desta direção em background (chamado ao iniciar a gravação/onboarding).
   * `onProgress` (opcional) recebe o progresso do download (0..1) para a UI mostrar a barra
   * do tradutor — antes o opus-mt baixava ~113MB SEM barra nenhuma.
   */
  preload(
    src: string,
    tgt: string,
    onProgress?: (p: number, label?: string, bytes?: { loaded: number; total: number }) => void,
  ): void {
    if (onProgress) this.onProgress = onProgress;
    const model = this.modelFor(src, tgt);
    if (!model || this.failed.has(model)) return;
    this.ensureWorker();
    if (this.ready.has(model)) {
      onProgress?.(1, 'Tradutor pronto');
      return;
    }
    if (this.loading.has(model)) return;
    this.loading.add(model);
    this.worker!.postMessage({ type: 'preload', src, tgt });
  }

  async translate(text: string, src: string | null, tgt: string, opts?: MtOptions): Promise<MtResult> {
    if (!src) throw new Error('opus-mt exige idioma de origem');
    const model = this.modelFor(src, tgt);
    if (!model) throw new Error(`opus-mt não cobre ${src}->${tgt}`);
    if (this.failed.has(model)) throw new Error('opus-mt indisponível neste ambiente (fallback)');
    /* PARCIAL NÃO BAIXA MODELO. Um texto que o próximo refinamento joga fora não justifica abrir o
       worker e puxar ~113 MB (no celular, plano de dados). O parcial só usa o modelo já pronto; o
       final — ou o aquecimento do início da gravação — é quem dispara o download. */
    if (opts?.parcial && !this.ready.has(model))
      throw new MotorAindaCarregando(this.id, 'opus-mt não carregado: parcial fica sem tradução local');
    this.ensureWorker();

    // Ainda não carregou este modelo → dispara preload em background e FALHA RÁPIDO
    // (o gateway usa o próximo adapter). Não segura a tradução esperando o download.
    if (!this.ready.has(model)) {
      if (!this.loading.has(model)) {
        this.loading.add(model);
        this.worker!.postMessage({ type: 'preload', src, tgt });
      }
      throw new MotorAindaCarregando(this.id, 'opus-mt ainda carregando (usando fallback)');
    }

    const id = Math.random().toString(36).slice(2);
    /* PRIORIDADE: a tradução de um parcial vai atrás das de final e é interrompida quando um final
       chega (o worker responde `cancelado`) — ver `mtWorker.ts`. */
    const translated = await new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({
        type: 'translate',
        id,
        text,
        src,
        tgt,
        prioridade: opts?.parcial ? 'parcial' : 'final',
      });
    });
    if (!translated) throw new Error('opus-mt devolveu vazio');
    return { text: translated, detectedSourceLang: src, engine: 'opus-mt-local' };
  }
}
