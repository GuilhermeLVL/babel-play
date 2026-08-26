/**
 * Run-loop do AI Gateway — puro/isomórfico. Resolve a cadeia de bindings do
 * perfil ativo e executa a chamada com a robustez do desktop (circuit breaker +
 * retry) generalizada para TODAS as capacidades, mais o gate de consentimento e
 * o orçamento de nuvem. Nunca retorna vazio silencioso: se toda a cadeia falha,
 * lança `NoRouteError` com a causa do último binding.
 *
 * A resolução binding→adapter e a chamada específica de cada capacidade ficam na
 * camada de navegador/servidor (`src/gateway`, `server/ai`): elas passam um
 * `attempt(binding)` — assim o núcleo não referencia tipos de DOM (MediaStream,
 * AbortSignal) nem SDKs.
 */
import { BreakerRegistry, withRetry, withTimeout } from '../robustness'
import type { Capability, CapabilityBinding, Profile } from './profile'
import type { BudgetLedger } from './budget'

/**
 * A-01: teto de tempo POR TENTATIVA, por capacidade. STT/LLM/VLM toleram mais (áudio longo,
 * geração longa); MT/TTS/embed devem ser rápidos. Override por chamada via `RunOptions.timeoutMs`.
 */
const DEFAULT_TIMEOUT_MS: Record<Capability, number> = {
  stt: 30_000,
  llm: 45_000,
  vlm: 45_000,
  mt: 6_000,   // legenda ao vivo: 15 s por tentativa era o dobro do que a pessoa espera olhando
  tts: 15_000,
  embed: 20_000,
}

export class NoRouteError extends Error {
  constructor(
    readonly capability: Capability,
    readonly reason?: unknown
  ) {
    super(`sem rota disponível para a capacidade "${capability}"`)
    this.name = 'NoRouteError'
  }
}

export interface RunOptions {
  /** Marca se um binding usa nuvem (exige consentimento + conta no orçamento). */
  isCloud?: (binding: CapabilityBinding) => boolean
  /** Tentativas por binding (default 2). */
  retries?: number
  /** Teto de tempo por tentativa (ms). Default por capacidade em `DEFAULT_TIMEOUT_MS`. */
  timeoutMs?: number
}

export class AiGateway {
  constructor(
    private profile: Profile,
    private breakers: BreakerRegistry,
    private ledger: BudgetLedger,
    /** Consentimento de nuvem da sessão: bindings de nuvem são pulados se `false`. */
    private cloudConsent: () => boolean
  ) {}

  setProfile(profile: Profile): void {
    this.profile = profile
    this.ledger.setBudget(profile.budget)
  }

  getProfile(): Profile {
    return this.profile
  }

  /**
   * Executa `attempt` contra a cadeia de bindings de `cap`, do primário ao
   * último fallback. Pula bindings de nuvem sem consentimento, com orçamento
   * esgotado, ou com breaker aberto. Cada tentativa passa por retry+breaker.
   */
  async run<R>(
    cap: Capability,
    attempt: (binding: CapabilityBinding) => Promise<R>,
    opts: RunOptions = {}
  ): Promise<R> {
    const chain = this.profile.bindings[cap] ?? []
    let reason: unknown = new Error(`nenhum binding para "${cap}" no perfil "${this.profile.id}"`)

    for (const binding of chain) {
      const cloud = opts.isCloud?.(binding) ?? false
      if (cloud && (this.profile.economyMode || !this.cloudConsent())) continue
      if (cloud && this.ledger.exhausted) continue

      const breaker = this.breakers.get(binding.adapterId)
      if (breaker.isOpen) continue

      const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS[cap] ?? 30_000
      try {
        const result = await breaker.run(() =>
          // MT: UMA tentativa (o parâmetro é TENTATIVAS, não re-tentativas) — numa legenda ao vivo,
          // tentar de novo o MESMO tradutor que acabou de falhar só atrasa o próximo da cascata.
          // Com 0 aqui, `withRetry` não executava nada e rejeitava com undefined: toda tradução
          // morria antes de chamar o motor (medido na hospedada, 2026-08-26).
          withRetry(opts.retries ?? (cap === 'mt' ? 1 : 2), 400, () =>
            // A-01: sem este teto, um `attempt` pendurado congelava a cascata — o retry nunca
            // disparava, o breaker nunca abria, o próximo binding nunca era tentado. `withTimeout`
            // já existia em robustness.ts e não tinha nenhum call site.
            withTimeout(binding.adapterId, timeoutMs, attempt(binding))
          )
        )
        return result
      } catch (e) {
        reason = e
      }
    }

    throw new NoRouteError(cap, reason)
  }
}
