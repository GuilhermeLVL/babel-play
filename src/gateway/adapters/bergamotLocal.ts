import { ChamadaCancelada, ehCancelamento, ehMotorCarregando, MotorAindaCarregando } from '@core';

import type { MtOptions, MtResult, TranslationProvider } from '../capabilities';
import { gravarManifesto, MENSAGEM_DO_MANIFESTO } from '../modelManifest';
import {
  bergamotOferecido,
  lembrarFalhaDoBergamot,
  type ParDoBergamot,
  parDoBergamot,
  parDoId,
  planoDaPagina,
} from './bergamotModelo';
import type { MensagemDoWorker, MensagemParaOWorker, MotivoDaFalha } from './bergamotWorker';
import type { OpusMtLocal } from './opusMtLocal';

type AoProgresso = (p: number, label?: string, bytes?: { loaded: number; total: number }) => void;

/**
 * Tradução LOCAL pt→en com o BERGAMOT (o motor do Firefox Translations, WASM num Web Worker) —
 * o mesmo contrato do `OpusMtLocal`: carga em segundo plano com barra, `MotorAindaCarregando`
 * enquanto não fica pronto (um PULO, não uma falha do disjuntor), parcial que nunca dispara
 * download, `aoFicarPronto`/`aoFalharCarga` e `liberar()` que devolve o heap ao sistema.
 *
 * Só atende o que `bergamotOferecido` diz (pt→en, modelo no build, navegador capaz, sem falha
 * lembrada). Qualquer falha tira o Bergamot desta sessão (`falhou`) — e o `TradutorLocalComBergamot`
 * logo abaixo cai no opus-mt sem a pessoa perceber. Falha do MOTOR (WASM que não abre, modelo que
 * não monta) fica lembrada no aparelho para a próxima captura não baixar 26 MB e falhar de novo.
 */
export class BergamotLocal implements TranslationProvider {
  readonly id = 'bergamot-local';
  readonly runtime = 'browser' as const;
  readonly cost = 'free' as const;
  readonly label = 'Bergamot local (on-device)';

  private worker: Worker | null = null;
  private pendentes = new Map<string, { resolve: (t: string[]) => void; reject: (e: Error) => void }>();
  private prontos = new Set<ParDoBergamot>();
  private emCarga = new Set<ParDoBergamot>();
  /** Falhou NESTA sessão (qualquer motivo): daqui em diante o par vai ao opus-mt. */
  private falhou = false;
  private onProgress: AoProgresso | null = null;
  private prontidao = new Set<(modelo: string) => void>();
  private falhasDeCarga = new Set<(modelo: string, motivo: MotivoDaFalha) => void>();

  supports(src: string | null, tgt: string): boolean {
    return !this.falhou && bergamotOferecido(src, tgt);
  }

  aoFicarPronto(fn: (modelo: string) => void): () => void {
    this.prontidao.add(fn);
    return () => this.prontidao.delete(fn);
  }

  aoFalharCarga(fn: (modelo: string, motivo: MotivoDaFalha) => void): () => void {
    this.falhasDeCarga.add(fn);
    return () => this.falhasDeCarga.delete(fn);
  }

  /**
   * Solta o modelo e encerra o worker: o heap do WASM só volta ao sistema com o `terminate()` (o
   * `descartar` antes é cortesia — o `delete()` do embind roda se o worker ainda escutar). A próxima
   * tradução recria o worker e recarrega do Cache Storage, sem rede.
   */
  liberar(): void {
    this.encerrar(new Error('tradutor local liberado'));
  }

  private encerrar(motivo: Error): void {
    const w = this.worker;
    this.worker = null;
    try {
      w?.postMessage({ type: 'descartar' } satisfies MensagemParaOWorker);
      w?.terminate();
    } catch {
      /* já morto */
    }
    this.prontos.clear();
    this.emCarga.clear();
    for (const p of this.pendentes.values()) p.reject(motivo);
    this.pendentes.clear();
  }

  /** A carga não deu: o Bergamot sai desta sessão, e quem espera é avisado (o composto cai no opus-mt). */
  private falhar(modelo: string, motivo: MotivoDaFalha, mensagem: string): void {
    this.falhou = true;
    if (motivo === 'motor') lembrarFalhaDoBergamot(mensagem);
    console.warn(`[bergamot] ${modelo} indisponível (${motivo}): ${mensagem} — o opus-mt assume o par`);
    this.encerrar(new Error(`Bergamot indisponível (${motivo})`));
    for (const fn of this.falhasDeCarga) {
      try {
        fn(modelo, motivo);
      } catch {
        /* ouvinte com defeito não impede o resto */
      }
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./bergamotWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent) => {
      const m = ev.data as MensagemDoWorker | { type: typeof MENSAGEM_DO_MANIFESTO; manifesto: never };
      // O Worker não tem localStorage: o manifesto do download é gravado aqui, na janela.
      if (m.type === MENSAGEM_DO_MANIFESTO) {
        gravarManifesto(m.manifesto);
        return;
      }
      switch (m.type) {
        case 'progress':
          this.onProgress?.(m.progress, m.label, m.total > 0 ? { loaded: m.loaded, total: m.total } : undefined);
          return;
        case 'ready': {
          const par = parDoId(m.model);
          if (par) {
            this.prontos.add(par);
            this.emCarga.delete(par);
          }
          // Antes do progresso: o disjuntor fecha ANTES de a captura pedir as retraduções.
          for (const fn of this.prontidao) {
            try {
              fn(m.model);
            } catch {
              /* ouvinte com defeito não impede o resto */
            }
          }
          this.onProgress?.(1, 'Tradutor pronto');
          return;
        }
        case 'loadError':
          this.falhar(m.model, m.motivo, m.message);
          return;
        case 'descartado':
          return;
        default: {
          const p = this.pendentes.get(m.id);
          if (!p) return;
          this.pendentes.delete(m.id);
          if (m.type === 'result') p.resolve(m.textos);
          else if (m.type === 'cancelado')
            p.reject(new ChamadaCancelada('tradução de parcial substituída pela do final'));
          else {
            /* Erro do MOTOR numa frase: o WASM pode ter abortado (o heap não é confiável depois
               disso). O Bergamot sai da sessão e esta frase já vai ao opus-mt (o composto). */
            p.reject(new Error(m.message || 'Bergamot: erro na tradução'));
            this.falhar('bergamot/pt-en', 'motor', m.message || 'erro na tradução');
          }
        }
      }
    };
    w.onerror = (ev: ErrorEvent) => {
      // O script do worker não abriu (deploy incompleto, rede): não é "este navegador não roda".
      const carregava = [...this.emCarga][0];
      this.falhar(carregava ? `bergamot/${carregava}` : 'bergamot/pt-en', 'rede', ev.message || 'worker quebrou');
    };
    this.worker = w;
    return w;
  }

  private pedirCarga(par: ParDoBergamot): void {
    if (this.prontos.has(par) || this.emCarga.has(par)) return;
    this.emCarga.add(par);
    this.ensureWorker().postMessage({ type: 'carregar', plano: planoDaPagina(par) } satisfies MensagemParaOWorker);
  }

  preload(src: string, tgt: string, onProgress?: AoProgresso): void {
    if (onProgress) this.onProgress = onProgress;
    const par = parDoBergamot(src, tgt);
    if (!par || !this.supports(src, tgt)) return;
    if (this.prontos.has(par)) {
      onProgress?.(1, 'Tradutor pronto');
      return;
    }
    this.pedirCarga(par);
  }

  async translate(text: string, src: string | null, tgt: string, opts?: MtOptions): Promise<MtResult> {
    const par = parDoBergamot(src, tgt);
    if (!par) throw new Error(`Bergamot não cobre ${src}->${tgt}`);
    if (!this.supports(src, tgt)) throw new Error('Bergamot indisponível neste aparelho (fallback)');
    /* PARCIAL NÃO BAIXA MODELO — a mesma regra do opus-mt: o texto que o próximo refinamento joga
       fora não abre worker nem puxa 26 MB. */
    if (opts?.parcial && !this.prontos.has(par))
      throw new MotorAindaCarregando(this.id, 'Bergamot não carregado: parcial fica sem tradução local');
    if (!this.prontos.has(par)) {
      this.pedirCarga(par);
      throw new MotorAindaCarregando(this.id, 'Bergamot ainda carregando');
    }
    const id = Math.random().toString(36).slice(2);
    const worker = this.ensureWorker();
    const [traduzido] = await new Promise<string[]>((resolve, reject) => {
      this.pendentes.set(id, { resolve, reject });
      worker.postMessage({
        type: 'traduzir',
        id,
        textos: [text],
        prioridade: opts?.parcial ? 'parcial' : 'final',
      } satisfies MensagemParaOWorker);
    });
    if (!traduzido) throw new Error('Bergamot devolveu vazio');
    return { text: traduzido, detectedSourceLang: src ?? undefined, engine: this.id };
  }
}

/**
 * O TRADUTOR LOCAL do perfil (binding `opus-mt-local`): Bergamot no pt→en, opus-mt no resto — e o
 * opus-mt de RESERVA do pt→en.
 *
 * POR QUE UM COMPOSTO, e não um binding a mais na cadeia. Com os dois lado a lado na cascata do
 * gateway, o `MotorAindaCarregando` do Bergamot (baixando) passaria a vez ao opus-mt, que dispararia
 * os 113 MB dele no mesmo instante — o download que o Bergamot existe para evitar. E o `warmup`, o
 * `preload` e o "tradutor local não carregou" do gateway contam com UM motor local por par. Aqui a
 * escolha é por par e a queda é interna: quem está fora (gateway, captura, perfis salvos) continua
 * vendo o `opus-mt-local` de sempre.
 *
 *   - pt→en com o Bergamot oferecido → Bergamot. Carregando: pula (o opus-mt NÃO baixa junto).
 *   - a carga do Bergamot falhou (sem modelo, WASM, integridade) → a carga do opus-mt começa na
 *     hora, com a mesma barra; a pessoa vê "baixando" continuar, não um erro;
 *   - erro numa tradução → esta frase já vai ao opus-mt (que pula se ainda não carregou: a fala
 *     fica "a caminho" e é retraduzida no `aoFicarPronto` dele);
 *   - en→pt e o resto → opus-mt, como antes (o Bergamot escreve português europeu).
 */
export class TradutorLocalComBergamot implements TranslationProvider {
  readonly id = 'opus-mt-local';
  readonly runtime = 'browser' as const;
  readonly cost = 'free' as const;
  readonly label = 'tradutor local (Bergamot no pt→en, opus-mt no resto)';

  /** A barra de cada par, para a reserva continuar a mesma quando o Bergamot cai. */
  private progressoDoPar = new Map<ParDoBergamot, AoProgresso | undefined>();
  private falhasDeCarga = new Set<(modelo: string) => void>();

  constructor(
    readonly bergamot: BergamotLocal,
    readonly opus: OpusMtLocal,
  ) {
    bergamot.aoFalharCarga((modelo) => this.cairNaReserva(modelo));
    opus.aoFalharCarga((modelo) => this.avisarFalha(modelo));
  }

  private avisarFalha(modelo: string): void {
    for (const fn of this.falhasDeCarga) {
      try {
        fn(modelo);
      } catch {
        /* ouvinte com defeito não impede o resto */
      }
    }
  }

  /** O Bergamot não carregou: o opus-mt do par começa já (e, se nem ele cobre, avisa quem espera). */
  private cairNaReserva(modelo: string): void {
    const par = parDoId(modelo);
    if (!par) return;
    const [src, tgt] = par.split('-');
    if (!this.opus.supports(src, tgt)) {
      this.avisarFalha(modelo);
      return;
    }
    this.opus.preload(src, tgt, this.progressoDoPar.get(par));
  }

  supports(src: string | null, tgt: string): boolean {
    return this.bergamot.supports(src, tgt) || this.opus.supports(src, tgt);
  }

  preload(src: string, tgt: string, onProgress?: AoProgresso): void {
    const par = parDoBergamot(src, tgt);
    if (par && this.bergamot.supports(src, tgt)) {
      this.progressoDoPar.set(par, onProgress);
      this.bergamot.preload(src, tgt, onProgress);
      return;
    }
    // Os mesmos argumentos que o gateway passou (sem um `undefined` a mais): o opus-mt é o de sempre.
    if (onProgress) this.opus.preload(src, tgt, onProgress);
    else this.opus.preload(src, tgt);
  }

  async translate(text: string, src: string | null, tgt: string, opts?: MtOptions): Promise<MtResult> {
    if (!this.bergamot.supports(src, tgt)) return this.opus.translate(text, src, tgt, opts);
    try {
      return await this.bergamot.translate(text, src, tgt, opts);
    } catch (e) {
      // Carregando ou atropelado pelo final: não é falha, e o opus-mt não pode começar a baixar por isso.
      if (ehMotorCarregando(e) || ehCancelamento(e)) throw e;
      return this.opus.translate(text, src, tgt, opts);
    }
  }

  aoFicarPronto(fn: (modelo: string) => void): () => void {
    const a = this.bergamot.aoFicarPronto(fn);
    const b = this.opus.aoFicarPronto(fn);
    return () => {
      a();
      b();
    };
  }

  /** Só o que NÃO vai ter reserva: a falha do Bergamot já virou a carga do opus-mt. */
  aoFalharCarga(fn: (modelo: string) => void): () => void {
    this.falhasDeCarga.add(fn);
    return () => this.falhasDeCarga.delete(fn);
  }

  liberar(): void {
    this.bergamot.liberar();
    this.opus.liberar();
  }
}
