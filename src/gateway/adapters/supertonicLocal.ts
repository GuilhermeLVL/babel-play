/**
 * O ADAPTADOR DA VOZ NO APARELHO (Supertonic 3) — o par, na thread principal, de `supertonicLocal.worker.ts`.
 *
 * Entra SÓ por `import()` (`lib/voz/vozNoAparelho.ts`), com a flag `voz_no_aparelho` ligada e o perfil permitindo: o
 * JS inicial não traz nada disto (teste `voz-no-aparelho-chunk`). Expõe:
 *   · `ClienteDoSupertonic`: o worker (baixar, carregar, sintetizar, apagar; `liberar()` = `terminate()`);
 *   · `adaptadorDoSupertonic`: o `AdaptadorDeVoz` `neural-local` que `registrarMotorDeVoz` recebe (a porta de
 *     `core/voz/portaDeVoz.ts`); `criar()` devolve um motor só (`lib/voz/motorNoAparelho.ts`).
 */
import { CAPACIDADES_DO_SUPERTONIC } from '../../core/voz/supertonic';
import { nativeTts } from '../../lib/tts';
import { criarMotorNoAparelho, type MotorNoAparelho, tocadorWebAudio } from '../../lib/voz/motorNoAparelho';
import type { AdaptadorDeVoz } from '../registroDeMotoresDeVoz';
import type { MensagemDaVoz, MensagemParaAVoz } from './supertonicLocal.worker';

type Pendente = {
  resolve: (m: Extract<MensagemDaVoz, { tipo: 'ok' }>) => void;
  reject: (e: Error & { cancelado?: boolean }) => void;
  aoProgresso?: (recebidos: number, total: number) => void;
};

/** Distribuição sem `id` de cada variante (o `Omit` de uma união perde a discriminação). */
type SemId<T> = T extends unknown ? Omit<T, 'id'> : never;

export class ClienteDoSupertonic {
  private worker: Worker | null = null;
  private seq = 0;
  private pendentes = new Map<number, Pendente>();
  private carga: Promise<string> | null = null;

  constructor(
    private readonly o: {
      threads: number;
      webgpu: boolean;
      criarWorker?: () => Worker;
    },
  ) {}

  /** Há um worker vivo (com memória presa)? */
  get vivo(): boolean {
    return this.worker !== null;
  }

  private w(): Worker {
    if (this.worker) return this.worker;
    const w = this.o.criarWorker
      ? this.o.criarWorker()
      : new Worker(new URL('./supertonicLocal.worker.ts', import.meta.url), {
          type: 'module',
          name: 'voz-no-aparelho',
        });
    w.onmessage = (e: MessageEvent<MensagemDaVoz>) => {
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

  private pedir(m: SemId<MensagemParaAVoz>, aoProgresso?: Pendente['aoProgresso']) {
    const id = ++this.seq;
    return new Promise<Extract<MensagemDaVoz, { tipo: 'ok' }>>((resolve, reject) => {
      this.pendentes.set(id, { resolve, reject, aoProgresso });
      this.w().postMessage({ ...m, id });
    });
  }

  async baixar(raiz: string, aoProgresso?: (recebidos: number, total: number) => void, sinal?: AbortSignal) {
    const cancelar = () => this.worker?.postMessage({ tipo: 'cancelar' } satisfies MensagemParaAVoz);
    sinal?.addEventListener('abort', cancelar, { once: true });
    try {
      await this.pedir({ tipo: 'baixar', raiz }, aoProgresso);
    } finally {
      sinal?.removeEventListener('abort', cancelar);
    }
  }

  carregar(): Promise<string> {
    this.carga ??= this.pedir({ tipo: 'carregar', threads: this.o.threads, webgpu: this.o.webgpu }).then(
      (r) => r.backend ?? 'wasm',
      (e) => {
        this.carga = null;
        throw e;
      },
    );
    return this.carga;
  }

  async sintetizar(texto: string, idioma: string, voz: string, velocidade: number) {
    await this.carregar();
    const r = await this.pedir({ tipo: 'sintetizar', texto, idioma, voz, velocidade });
    return { pcm: r.pcm!, taxa: r.taxa!, ms: r.ms ?? 0, backend: r.backend ?? '?' };
  }

  async apagar(): Promise<void> {
    await this.pedir({ tipo: 'apagar' });
    this.liberar();
  }

  /** Encerra o worker: as sessões e o heap do WASM voltam ao sistema. */
  liberar(motivo: Error = new Error('liberado')): void {
    this.worker?.terminate();
    this.worker = null;
    this.carga = null;
    for (const p of this.pendentes.values()) p.reject(motivo);
    this.pendentes.clear();
  }
}

/** Baixa o modelo num worker de vida curta (e o encerra ao fim, deu certo ou não). */
export async function baixarSupertonic(
  raiz: string,
  aoProgresso: (recebidos: number, total: number) => void,
  sinal: AbortSignal,
): Promise<void> {
  const c = new ClienteDoSupertonic({ threads: 1, webgpu: false });
  try {
    await c.baixar(raiz, aoProgresso, sinal);
  } finally {
    c.liberar();
  }
}

export async function apagarSupertonic(): Promise<void> {
  await new ClienteDoSupertonic({ threads: 1, webgpu: false }).apagar();
}

export interface OpcoesDoAdaptador {
  threads: number;
  webgpu: boolean;
  pronto: (idioma: string) => boolean;
  vozPadrao: () => string;
  contexto: () => AudioContext;
  soltarAposMs: number;
}

/** O motor `neural-local` para a porta. Um cliente e um motor por página. */
export function adaptadorDoSupertonic(o: OpcoesDoAdaptador): AdaptadorDeVoz & { cliente: ClienteDoSupertonic } {
  const cliente = new ClienteDoSupertonic({ threads: o.threads, webgpu: o.webgpu });
  let motor: MotorNoAparelho | null = null;
  return {
    id: 'neural-local',
    capacidades: CAPACIDADES_DO_SUPERTONIC,
    pronto: o.pronto,
    cliente,
    criar(op) {
      motor ??= criarMotorNoAparelho({
        sintetizador: cliente,
        tocador: tocadorWebAudio(o.contexto),
        reserva: op?.reserva ?? nativeTts,
        vozPadrao: o.vozPadrao,
        soltarAposMs: o.soltarAposMs,
      });
      motor.definirAoRecuar(op?.aoRecuar);
      return motor;
    },
  };
}
