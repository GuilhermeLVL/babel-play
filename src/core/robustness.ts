/**
 * Harness de robustez do orquestrador: timeout por nó, retry com backoff e
 * circuit breaker por provider. Falhas degradam o turno (fallback/skip) em vez
 * de abortá-lo — os nós decidem o fallback; o harness fornece os mecanismos.
 */

export class NodeTimeoutError extends Error {
  constructor(node: string, ms: number) {
    super(`nó "${node}" excedeu ${ms} ms`);
    this.name = 'NodeTimeoutError';
  }
}

/**
 * CANCELADA POR QUEM PEDIU — não é falha do provider.
 *
 * Existe por causa da legenda ao vivo: a tradução de um PARCIAL fica velha quando o final da mesma
 * fala chega, e o tradutor local a interrompe para o final passar na frente (auditoria de latência
 * 2026-09-26). Tratar isso como erro abriria o disjuntor de um tradutor que funciona e mandaria o
 * texto velho ao PRÓXIMO da cascata (um de rede). Então: não conta no disjuntor, não re-tenta e
 * encerra a cascata.
 */
export class ChamadaCancelada extends Error {
  constructor(motivo = 'chamada cancelada') {
    super(motivo);
    this.name = 'ChamadaCancelada';
  }
}

/** Pelo nome, e não por `instanceof`: o erro atravessa a fronteira do Web Worker e de bundles. */
export function ehCancelamento(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === 'ChamadaCancelada';
}

/**
 * O MOTOR AINDA NÃO ESTÁ PRONTO (modelo local baixando/compilando) — um PULO, não uma falha.
 *
 * Existe por causa do Quest emulado (2026-09-28): o opus-mt lançava "ainda carregando" a cada final
 * e a cada parcial enquanto o modelo baixava, e cada lançamento contava no disjuntor — três abriam o
 * disjuntor por 30 s. O modelo ficava pronto aos 29,3 s e os finais seguiam pulando o tradutor até
 * ~57 s: primeira tradução real aos 54,6 s, as 5–6 primeiras falas com `NoRouteError`. Então: não
 * conta no disjuntor (nem zera a contagem — pulo não é sucesso), não re-tenta, e a cascata PASSA ao
 * próximo motor, como antes.
 */
export class MotorAindaCarregando extends Error {
  constructor(
    readonly motor: string,
    motivo = `${motor} ainda carregando`,
  ) {
    super(motivo);
    this.name = 'MotorAindaCarregando';
  }
}

/** Pelo nome, como `ehCancelamento`: o erro atravessa worker e bundles. */
export function ehMotorCarregando(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === 'MotorAindaCarregando';
}

/** Executa com teto de tempo; no estouro rejeita com NodeTimeoutError. */
export function withTimeout<T>(node: string, ms: number, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new NodeTimeoutError(node, ms)), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Retry com backoff exponencial (para operações idempotentes). */
export async function withRetry<T>(attempts: number, baseDelayMs: number, work: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await work();
    } catch (e) {
      lastError = e;
      if (ehCancelamento(e)) break; // quem pediu desistiu: tentar de novo seria trabalho jogado fora
      if (ehMotorCarregando(e)) break; // o modelo não fica pronto em 400 ms: a cascata segue
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}

/**
 * Circuit breaker por provider: após `threshold` falhas consecutivas, abre por
 * `cooldownMs` — chamadas nesse período falham imediatamente (o nó cai no
 * fallback sem esperar timeout), evitando martelar um provider fora do ar.
 */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(
    readonly id: string,
    private threshold = 3,
    private cooldownMs = 30_000,
  ) {}

  get isOpen(): boolean {
    return Date.now() < this.openUntil;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.isOpen) {
      throw new Error(`circuit breaker "${this.id}" aberto (cooldown)`);
    }
    try {
      const result = await work();
      this.failures = 0;
      return result;
    } catch (e) {
      if (ehCancelamento(e)) throw e; // cancelamento não é falha do provider
      if (ehMotorCarregando(e)) throw e; // carregando é pulo: nem conta, nem zera a contagem
      this.failures += 1;
      if (this.failures >= this.threshold) {
        this.openUntil = Date.now() + this.cooldownMs;
        console.log(
          `[orchestration] circuit breaker "${this.id}" ABERTO por ${this.cooldownMs / 1000}s ` +
            `(${this.failures} falhas consecutivas)`,
        );
        this.failures = 0;
      }
      throw e;
    }
  }

  /** Fecha o disjuntor e zera a contagem (o motor local acabou de ficar pronto: vale tentar já). */
  reiniciar(): void {
    this.failures = 0;
    this.openUntil = 0;
  }
}

/** Registro de breakers por provider (compartilhado entre nós). */
export class BreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  get(id: string): CircuitBreaker {
    let b = this.breakers.get(id);
    if (!b) {
      b = new CircuitBreaker(id);
      this.breakers.set(id, b);
    }
    return b;
  }

  /** Fecha o disjuntor de `id` (se existir): quem sabe que o motor voltou chama isto. */
  reiniciar(id: string): void {
    this.breakers.get(id)?.reiniciar();
  }
}
