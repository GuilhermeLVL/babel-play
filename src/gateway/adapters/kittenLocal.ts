/**
 * O ADAPTADOR DA VOZ NATURAL NO APARELHO (Kitten TTS 2) — o par, na thread principal, de `kittenLocal.worker.ts`.
 *
 * Entra SÓ por `import()` (`lib/voz/vozKitten.ts`), com a flag `voz_kitten` ligada e a raiz dos pesos configurada. Expõe
 * o cliente do worker (baixar, carregar, sintetizar, apagar; `liberar()` = `terminate()`) e o motor como `TtsEngine`
 * (`lib/voz/motorNoAparelho.ts`: fila com prioridade, pré-busca, cache, cancelamento, reserva sem silêncio).
 */
import type { IdiomaDeVoz } from '../../core/leitura/prepararTextoParaVoz';
import {
  CAPACIDADES_DO_KITTEN,
  idiomaDoKitten,
  type VarianteDoKitten,
  velocidadeDoKitten,
  vozDoKitten,
} from '../../core/voz/kitten';
import { nativeTts } from '../../lib/tts';
import { criarMotorNoAparelho, type MotorNoAparelho, tocadorWebAudio } from '../../lib/voz/motorNoAparelho';
import type { AdaptadorDeVoz } from '../registroDeMotoresDeVoz';
import type { MensagemDoKitten, MensagemParaOKitten } from './kittenLocal.worker';

type Ok = Extract<MensagemDoKitten, { tipo: 'ok' }>;
type Pendente = {
  resolve: (m: Ok) => void;
  reject: (e: Error & { cancelado?: boolean }) => void;
  aoProgresso?: (recebidos: number, total: number) => void;
};
type SemId<T> = T extends unknown ? Omit<T, 'id'> : never;

export class ClienteDoKitten {
  private worker: Worker | null = null;
  private seq = 0;
  private pendentes = new Map<number, Pendente>();
  private cargas = new Map<IdiomaDeVoz, Promise<string>>();

  constructor(
    private readonly o: {
      variante: VarianteDoKitten;
      threads: number;
      webgpu: boolean;
      criarWorker?: () => Worker;
    },
  ) {}

  get vivo(): boolean {
    return this.worker !== null;
  }

  private w(): Worker {
    if (this.worker) return this.worker;
    const w = this.o.criarWorker
      ? this.o.criarWorker()
      : new Worker(new URL('./kittenLocal.worker.ts', import.meta.url), { type: 'module', name: 'voz-kitten' });
    w.onmessage = (e: MessageEvent<MensagemDoKitten>) => {
      const m = e.data;
      const p = this.pendentes.get(m.id);
      if (!p) return;
      if (m.tipo === 'progresso') return p.aoProgresso?.(m.recebidos, m.total);
      this.pendentes.delete(m.id);
      if (m.tipo === 'ok') p.resolve(m);
      else p.reject(Object.assign(new Error(m.mensagem), { cancelado: m.cancelado }));
    };
    w.onerror = (e) => {
      e.preventDefault?.();
      this.liberar(new Error(`worker da voz caiu: ${e.message ?? ''}`));
    };
    this.worker = w;
    return w;
  }

  private pedir(m: SemId<MensagemParaOKitten>, aoProgresso?: Pendente['aoProgresso']) {
    const id = ++this.seq;
    return new Promise<Ok>((resolve, reject) => {
      this.pendentes.set(id, { resolve, reject, aoProgresso });
      this.w().postMessage({ ...m, id });
    });
  }

  async baixar(
    raiz: string,
    idioma: IdiomaDeVoz,
    aoProgresso?: (recebidos: number, total: number) => void,
    sinal?: AbortSignal,
  ) {
    const cancelar = () => this.worker?.postMessage({ tipo: 'cancelar' } satisfies MensagemParaOKitten);
    sinal?.addEventListener('abort', cancelar, { once: true });
    try {
      await this.pedir({ tipo: 'baixar', raiz, variante: this.o.variante, idioma }, aoProgresso);
    } finally {
      sinal?.removeEventListener('abort', cancelar);
    }
  }

  carregar(idioma: IdiomaDeVoz): Promise<string> {
    let c = this.cargas.get(idioma);
    if (!c) {
      c = this.pedir({
        tipo: 'carregar',
        variante: this.o.variante,
        idioma,
        threads: this.o.threads,
        webgpu: this.o.webgpu,
      }).then(
        (r) => r.backend ?? 'wasm',
        (e) => {
          this.cargas.delete(idioma);
          throw e;
        },
      );
      this.cargas.set(idioma, c);
    }
    return c;
  }

  async sintetizar(texto: string, idioma: string, voz: string, velocidade: number) {
    const base = idiomaDoKitten(idioma);
    if (!base) throw new Error(`idioma fora do motor: ${idioma}`);
    await this.carregar(base);
    const r = await this.pedir({ tipo: 'sintetizar', variante: this.o.variante, texto, idioma: base, voz, velocidade });
    return { pcm: r.pcm!, taxa: r.taxa!, ms: r.ms ?? 0, backend: r.backend ?? '?' };
  }

  async apagar(): Promise<void> {
    await this.pedir({ tipo: 'apagar' });
    this.liberar();
  }

  liberar(motivo: Error = new Error('liberado')): void {
    this.worker?.terminate();
    this.worker = null;
    this.cargas.clear();
    for (const p of this.pendentes.values()) p.reject(motivo);
    this.pendentes.clear();
  }
}

/** Baixa os arquivos de um idioma num worker de vida curta (e o encerra ao fim). */
export async function baixarKitten(
  raiz: string,
  variante: VarianteDoKitten,
  idioma: IdiomaDeVoz,
  aoProgresso: (recebidos: number, total: number) => void,
  sinal: AbortSignal,
): Promise<void> {
  const c = new ClienteDoKitten({ variante, threads: 1, webgpu: false });
  try {
    await c.baixar(raiz, idioma, aoProgresso, sinal);
  } finally {
    c.liberar();
  }
}

export async function apagarKitten(variante: VarianteDoKitten): Promise<void> {
  await new ClienteDoKitten({ variante, threads: 1, webgpu: false }).apagar();
}

export interface OpcoesDoAdaptadorKitten {
  variante: VarianteDoKitten;
  threads: number;
  webgpu: boolean;
  pronto: (idioma: string) => boolean;
  /** A voz escolhida pela pessoa para o idioma (chave do pacote), ou `''` para a padrão. */
  vozDoIdioma: (idioma: IdiomaDeVoz) => string;
  contexto: () => AudioContext;
  soltarAposMs: number;
}

/** O motor `neural-local` do Kitten para a porta. Um cliente e um motor por página. */
export function adaptadorDoKitten(
  o: OpcoesDoAdaptadorKitten,
): AdaptadorDeVoz & { cliente: ClienteDoKitten; motor: () => MotorNoAparelho } {
  const cliente = new ClienteDoKitten({ variante: o.variante, threads: o.threads, webgpu: o.webgpu });
  let motor: MotorNoAparelho | null = null;
  const fabricar = (reserva = nativeTts) => {
    motor ??= criarMotorNoAparelho({
      sintetizador: cliente,
      tocador: tocadorWebAudio(o.contexto),
      reserva,
      soltarAposMs: o.soltarAposMs,
      resolver: (opts) => {
        const idioma = idiomaDoKitten(opts.lang);
        /* `voiceName` só vale se for uma voz do Kitten (o nome de uma voz do sistema não serve aqui) */
        const voz = idioma ? vozDoKitten(o.variante, idioma, opts.voiceName || o.vozDoIdioma(idioma)).chave : '';
        return { idioma, voz, velocidade: velocidadeDoKitten(opts.rate ?? 1) };
      },
    });
    return motor;
  };
  return {
    id: 'neural-local',
    capacidades: CAPACIDADES_DO_KITTEN,
    pronto: o.pronto,
    cliente,
    motor: () => fabricar(),
    criar(op) {
      const m = fabricar(op?.reserva ?? nativeTts);
      m.definirAoRecuar(op?.aoRecuar);
      return m;
    },
  };
}
