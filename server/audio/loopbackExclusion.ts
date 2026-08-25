/**
 * Exclusão mútua da captura de loopback por CONTADOR DE GERAÇÃO (correção de S-05).
 *
 * O problema (race confirmada por PoC na Fase 2): a versão antiga guardava `activeStop` (referência
 * à função de parada) e o zerava ANTES de um `await sleep(150)`. Durante esse respiro, uma nova
 * requisição via `activeStop === null`, pulava o takeover e criava uma captura paralela; quando a
 * requisição do await acordava, sobrescrevia `activeStop`, deixando a captura do meio ÓRFÃ — rodando
 * sem referência, nunca parada (medido: 6 capturas iniciadas, 4 encerradas → 2 órfãs).
 *
 * A correção: cada requisição reivindica um NÚMERO DE GERAÇÃO monotônico ANTES do respiro. Depois do
 * respiro, só assume a captura se ainda for a geração mais nova; caso uma requisição posterior tenha
 * chegado durante o respiro, esta ABORTA em vez de criar uma captura órfã. O estado sobrevive ao
 * `await` porque a comparação é por número, não por uma referência que foi zerada.
 *
 * Puro e sem dependência do módulo nativo WASAPI — testável de forma determinística.
 */
export class LoopbackExclusion {
  private generation = 0
  private active: { gen: number; stop: () => void } | null = null

  /**
   * Nova requisição reivindica a captura: incrementa a geração, PARA a captura anterior (takeover)
   * e libera o slot. Devolve o `gen` desta requisição e se havia uma anterior (→ precisa do respiro).
   */
  supersede(): { gen: number; superseded: boolean } {
    const gen = ++this.generation
    const prev = this.active
    this.active = null
    if (prev) {
      try { prev.stop() } catch { /* já morta */ }
    }
    return { gen, superseded: prev !== null }
  }

  /** Depois do respiro: este `gen` ainda é a geração mais nova? (false = uma requisição posterior o superou.) */
  stillOwner(gen: number): boolean {
    return gen === this.generation
  }

  /** Assume o slot ativo com a função de parada desta requisição — só se ainda for o dono. */
  activate(gen: number, stop: () => void): boolean {
    if (gen !== this.generation) return false
    this.active = { gen, stop }
    return true
  }

  /** Libera o slot no cleanup — só se este `gen` ainda o ocupa (não derruba uma captura mais nova). */
  deactivate(gen: number): void {
    if (this.active?.gen === gen) this.active = null
  }

  /** Geração atualmente ativa (para diagnóstico/teste); null quando nenhuma captura está ativa. */
  get currentGen(): number | null {
    return this.active?.gen ?? null
  }
}
