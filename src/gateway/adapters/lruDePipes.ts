/**
 * CACHE DE PIPELINES COM TETO — os N mais recentes, e o que sai é DESCARTADO de verdade.
 *
 * Por que existe (plano "Grátis sem travar", A7): o `mtWorker` guardava num `Map` sem fim cada
 * opus-mt que carregou — ~113 MB de pesos cada, mais a sessão do ORT. Trocar de par de idiomas numa
 * sessão longa empilhava modelos no heap do worker até a aba morrer (no iOS, perto de 0,5–1,5 GB). A
 * conversa usa DOIS sentidos; um terceiro modelo despeja o menos usado.
 *
 * Descartar = `await pipe.dispose()`: no transformers.js ele solta as sessões do ORT (`release()`).
 * O heap do WASM não encolhe, mas a memória solta é REUSADA pela próxima sessão em vez de o heap
 * crescer. Por isso `abrirEspaco()` existe: despejar ANTES de carregar o próximo, e o pico nunca
 * soma três modelos.
 *
 * Nunca no meio do uso: uma tradução RESERVA o pipe (`reservar`) e o solta no fim (`reserva.soltar`).
 * Um reservado não sai; se todos estiverem em uso a capacidade estoura por um instante e o despejo
 * acontece no `soltar`. Puro (sem transformers.js), para testar sem worker.
 */

interface Descartavel {
  dispose?: () => unknown;
}

interface Entrada<T> {
  valor: T;
  emUso: number;
}

/** Um uso em andamento: o pipe, e quem o devolve (uma vez só). */
export interface ReservaDePipe<T> {
  valor: T;
  soltar: () => Promise<void>;
}

async function descartar(valor: unknown): Promise<void> {
  try {
    await (valor as Descartavel | null)?.dispose?.();
  } catch {
    /* sessão já solta ou pipe sem dispose: o que importa é soltar a referência */
  }
}

export class LruDePipes<T> {
  /** Ordem de inserção do `Map` = ordem de uso: o primeiro é o menos recente. */
  private entradas = new Map<string, Entrada<T>>();

  /**
   * @param capacidade quantos ficam (2: os dois sentidos da conversa).
   * @param aoDescarregar avisado com a chave de cada um que saiu (o adapter esquece que estava pronto).
   */
  constructor(
    private readonly capacidade = 2,
    private readonly aoDescarregar?: (chave: string) => void,
  ) {}

  get tamanho(): number {
    return this.entradas.size;
  }

  /** As chaves, da menos à mais recente (diagnóstico e testes). */
  chaves(): string[] {
    return [...this.entradas.keys()];
  }

  tem(chave: string): boolean {
    return this.entradas.has(chave);
  }

  /** O pipe, se estiver; a consulta conta como uso (vai para o fim da fila). */
  obter(chave: string): T | undefined {
    return this.tocar(chave)?.valor;
  }

  /**
   * Como `obter`, e marca EM USO até o `soltar` da reserva: não sai do cache enquanto isso. Se ele
   * saiu enquanto reservado (`limpar`), o `soltar` é quem o descarta.
   */
  reservar(chave: string): ReservaDePipe<T> | undefined {
    const e = this.tocar(chave);
    if (!e) return undefined;
    e.emUso += 1;
    let solto = false;
    return {
      valor: e.valor,
      soltar: async () => {
        if (solto) return;
        solto = true;
        e.emUso = Math.max(0, e.emUso - 1);
        if (this.entradas.get(chave) !== e) {
          if (e.emUso === 0) await descartar(e.valor); // já fora do cache: era o último uso
          return;
        }
        await this.despejarAte(this.capacidade); // passou do teto enquanto estava em uso
      },
    };
  }

  /** Guarda como o mais recente e despeja o excedente (esperando o `dispose` de quem sai). */
  async guardar(chave: string, valor: T): Promise<void> {
    const antes = this.entradas.get(chave);
    if (antes?.valor === valor) {
      this.tocar(chave);
    } else {
      this.entradas.delete(chave);
      this.entradas.set(chave, { valor, emUso: 0 });
      // Outro valor na mesma chave: o anterior sai (em uso, quem o descarta é o `soltar`).
      if (antes && antes.emUso === 0) await descartar(antes.valor);
    }
    await this.despejarAte(this.capacidade, chave);
  }

  /** Abre lugar para UMA carga nova: despeja até sobrar uma vaga (o pico não soma três modelos). */
  async abrirEspaco(): Promise<void> {
    await this.despejarAte(this.capacidade - 1);
  }

  /** Descarta tudo (diagnóstico). O que está em uso sai do cache já e é descartado no `soltar`. */
  async limpar(): Promise<void> {
    const todas = [...this.entradas];
    this.entradas.clear();
    for (const [chave, e] of todas) {
      this.aoDescarregar?.(chave);
      if (e.emUso === 0) await descartar(e.valor);
    }
  }

  private tocar(chave: string): Entrada<T> | undefined {
    const e = this.entradas.get(chave);
    if (!e) return undefined;
    this.entradas.delete(chave);
    this.entradas.set(chave, e);
    return e;
  }

  /** Despeja os menos recentes LIVRES até `limite`; `poupar` nunca sai (o que acabou de entrar). */
  private async despejarAte(limite: number, poupar?: string): Promise<void> {
    while (this.entradas.size > Math.max(0, limite)) {
      const vitima = [...this.entradas].find(([chave, e]) => e.emUso === 0 && chave !== poupar);
      if (!vitima) return; // todos em uso: estoura por um instante, o `soltar` termina o serviço
      const [chave, e] = vitima;
      this.entradas.delete(chave);
      this.aoDescarregar?.(chave);
      await descartar(e.valor);
    }
  }
}
