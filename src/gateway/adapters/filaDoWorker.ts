/**
 * FILA SERIAL DOS WORKERS DE STT E MT — uma tarefa por vez, o FINAL na frente.
 *
 * Os dois workers tinham `self.onmessage = async (…) => { … await asr(…) … }`. Isso NÃO é uma fila:
 * a segunda mensagem começa enquanto a primeira espera dentro do `generate`, e os dois decodes
 * andam INTERCALADOS token a token. Medido na auditoria de latência (2026-09-26): em 20 de 22 falas
 * o decode final do Whisper small dividiu o worker com um PARCIAL da mesma fala, e esperou por ele
 * 0,92 s (p50) / 1,71 s (p95) — 36% do tempo entre o fim da fala e a legenda. O parcial ainda
 * devolvia o mesmo texto do final, e era jogado fora.
 *
 * As regras aqui:
 *  - SERIAL: uma tarefa executa por vez; a próxima só começa quando a anterior termina;
 *  - PRIORIDADE: um `final` passa na frente de qualquer `parcial` que esteja esperando (entre os
 *    finais, a ordem de chegada — as falas não se embaralham);
 *  - DESCARTE: um `final` que chega DESCARTA os parciais que esperam e pede ao parcial EM VOO que
 *    pare (ele é best-effort, e o final é a leitura autoritativa);
 *  - toda tarefa termina de UM jeito só: executada, ou descartada (`aoDescartar`). Nenhum pedido fica
 *    sem resposta — um pendente órfão no adapter deixaria o worker "ocupado" para sempre, e com ele
 *    todos os parciais seguintes.
 *
 * Parar no meio: o `generate` do transformers.js não aceita sinal de aborto, mas aceita
 * `logits_processor` (o `stopping_criteria` é engolido pelo `generate` do Whisper na 4.2.0). Então o
 * sinal de cancelamento vira um processador de logits que força o fim da sequência no próximo passo
 * (`processadorDeCancelamento`) — o decode termina limpo, no próprio laço, liberando o cache da GPU.
 */

export type Prioridade = 'final' | 'parcial';

/** O sinal que a tarefa em voo consulta para saber se deve parar. */
export interface SinalDeCancelamento {
  readonly cancelado: boolean;
}

export interface TarefaDaFila {
  id: string;
  prioridade: Prioridade;
  /** O trabalho. Recebe o sinal: se ele virar `cancelado`, termine o quanto antes. */
  executar: (sinal: SinalDeCancelamento) => Promise<void>;
  /** Chamado quando a tarefa sai da fila SEM executar (descartada ou cancelada antes de começar). */
  aoDescartar?: () => void;
}

interface EmFila {
  tarefa: TarefaDaFila;
  sinal: { cancelado: boolean };
  concluir: () => void;
}

export class FilaSerial {
  private espera: EmFila[] = [];
  private emVoo: EmFila | null = null;

  /** Quantas tarefas existem (esperando + em voo). */
  get tamanho(): number {
    return this.espera.length + (this.emVoo ? 1 : 0);
  }

  /** Id da tarefa em execução agora (para diagnóstico e testes). */
  get idEmVoo(): string | null {
    return this.emVoo?.tarefa.id ?? null;
  }

  /**
   * Põe a tarefa na fila. A promessa resolve quando ela terminou — executada ou descartada. Nunca
   * rejeita: o erro é problema da própria tarefa (ela responde ao chamador por mensagem).
   */
  enfileirar(tarefa: TarefaDaFila): Promise<void> {
    return new Promise<void>((concluir) => {
      const item: EmFila = { tarefa, sinal: { cancelado: false }, concluir };
      if (tarefa.prioridade === 'final') {
        this.descartarParciais();
        // Depois do último final que espera, antes de qualquer parcial.
        const i = this.espera.findIndex((e) => e.tarefa.prioridade === 'parcial');
        if (i === -1) this.espera.push(item);
        else this.espera.splice(i, 0, item);
      } else {
        this.espera.push(item);
      }
      this.bombear();
    });
  }

  /**
   * Cancela UMA tarefa pelo id: se espera, sai da fila (descartada); se está em voo, o sinal vira
   * `cancelado` e ela termina sozinha. `false` = não havia tarefa com esse id.
   */
  cancelar(id: string): boolean {
    if (this.emVoo?.tarefa.id === id) {
      this.emVoo.sinal.cancelado = true;
      return true;
    }
    const i = this.espera.findIndex((e) => e.tarefa.id === id);
    if (i === -1) return false;
    const [item] = this.espera.splice(i, 1);
    this.descartar(item);
    return true;
  }

  /** Descarta os parciais que esperam e pede ao parcial em voo que pare. */
  descartarParciais(): void {
    if (this.emVoo?.tarefa.prioridade === 'parcial') this.emVoo.sinal.cancelado = true;
    const ficam: EmFila[] = [];
    for (const item of this.espera) {
      if (item.tarefa.prioridade === 'parcial') this.descartar(item);
      else ficam.push(item);
    }
    this.espera = ficam;
  }

  private descartar(item: EmFila): void {
    try {
      item.tarefa.aoDescartar?.();
    } finally {
      item.concluir();
    }
  }

  private bombear(): void {
    if (this.emVoo) return;
    const proximo = this.espera.shift();
    if (!proximo) return;
    this.emVoo = proximo;
    void Promise.resolve()
      .then(() => proximo.tarefa.executar(proximo.sinal))
      .catch(() => {
        /* a tarefa responde o próprio erro; a fila só não pode parar por causa dele */
      })
      .finally(() => {
        this.emVoo = null;
        proximo.concluir();
        this.bombear();
      });
  }
}

/** Os logits como o transformers.js os entrega aos processadores: `[lote, vocabulário]`. */
interface LogitsDoPasso {
  data: Float32Array | Float64Array | number[];
  dims: number[];
}

/**
 * Processador de logits que, com o sinal cancelado, só deixa o token de fim de sequência vivo — o
 * `generate` para no passo seguinte pelo próprio critério de EOS. Sem sinal cancelado, não toca em
 * nada. `eos` pode vir como número ou lista (o `generation_config.eos_token_id` aceita os dois).
 */
export function processadorDeCancelamento(
  sinal: SinalDeCancelamento,
  eos: number | number[] | null | undefined,
): ((ids: unknown, logits: LogitsDoPasso) => LogitsDoPasso) | null {
  const fim = Array.isArray(eos) ? eos[0] : eos;
  if (typeof fim !== 'number') return null;
  return (_ids, logits) => {
    if (!sinal.cancelado) return logits;
    const vocab = logits.dims[logits.dims.length - 1];
    const dados = logits.data;
    for (let base = 0; base + vocab <= dados.length; base += vocab) {
      for (let k = 0; k < vocab; k++) dados[base + k] = -Infinity;
      dados[base + fim] = 0;
    }
    return logits;
  };
}
