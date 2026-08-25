/**
 * Contador de orçamento de nuvem por sessão (lift da lógica de budget do
 * `translation/router.ts`). Puro. Quando esgota, o gateway pula bindings de
 * nuvem e degrada para local — nunca falha em silêncio.
 */
import type { Budget } from './profile'

export class BudgetLedger {
  private requests = 0
  private tokens = 0

  constructor(private budget: Budget) {}

  /** true quando qualquer teto (requests OU tokens) foi atingido. */
  get exhausted(): boolean {
    const { maxCloudRequests, maxTokens } = this.budget
    if (maxCloudRequests >= 0 && this.requests >= maxCloudRequests) return true
    if (maxTokens >= 0 && this.tokens >= maxTokens) return true
    return false
  }

  /** Registra o uso de UMA chamada de nuvem. */
  record(inputTokens: number, outputTokens: number): void {
    this.requests += 1
    this.tokens += Math.max(0, inputTokens) + Math.max(0, outputTokens)
  }

  setBudget(budget: Budget): void {
    this.budget = budget
  }

  reset(): void {
    this.requests = 0
    this.tokens = 0
  }

  get spent(): { requests: number; tokens: number } {
    return { requests: this.requests, tokens: this.tokens }
  }
}
