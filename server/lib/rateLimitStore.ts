/**
 * Rate-limit POR TENANT e COMPARTILHADO entre réplicas (auditoria P1-2 e P1-3).
 *
 * O default do `express-rate-limit` tem dois problemas para um SaaS multi-tenant:
 *
 *  P1-2 — `keyGenerator` por IP. Atrás de proxy reverso todo tráfego chega com o mesmo IP,
 *         então os tenants dividem um contador só: medido, um usuário que dispara 70 chamadas
 *         faz OUTRO, que não consumiu nada, receber 429. É DoS cross-tenant trivial.
 *
 *  P1-3 — `MemoryStore` vive no heap do processo. Medido: a réplica 1 limitava e a MESMA
 *         sonda do MESMO usuário passava na réplica 2 — teto efetivo = 60/min × nº de réplicas.
 *
 * A contagem vai para `usage_counters` (metric='ratelimit'), reaproveitando o
 * `unique(user_id, metric, window)` que já existe — sem tabela nem migração nova. A `window`
 * é o balde de tempo; `incrementAndGet` conta e lê numa instrução só.
 */
import type { Request } from 'express'
import { ipKeyGenerator } from 'express-rate-limit'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import { asUserId } from './authContext'

export const METRIC_RATELIMIT = 'ratelimit'

/**
 * A chave do balde: o TENANT, não o IP. Cai no IP só onde não há usuário resolvido
 * (rota fora do authMiddleware) — `ipKeyGenerator` normaliza IPv6 por prefixo /64.
 */
export function chaveDoRequest(req: Request): string {
  const userId = (req as Request & { userId?: string }).userId
  if (userId) return `u:${userId}`
  return `ip:${ipKeyGenerator(req.ip ?? '')}`
}

interface StoreOptions { windowMs: number }

/**
 * Store do express-rate-limit sobre o banco. `localKeys: false` avisa a lib que o contador
 * NÃO é local ao processo — é o que desliga o aviso de dupla contagem e documenta a intenção.
 */
export function createDbRateLimitStore() {
  let windowMs = 60_000
  let podarEm = 0

  /** Id do balde de tempo. Prefixo `rl:` para não colidir com as janelas 'YYYY-MM' da quota. */
  const balde = (t = Date.now()) => `rl:${Math.floor(t / windowMs)}`

  /** Poda baldes vencidos de vez em quando — sem isto a tabela cresceria sem teto. */
  async function podarSePreciso(): Promise<void> {
    const agora = Date.now()
    if (agora < podarEm) return
    podarEm = agora + 5 * windowMs
    // Mantém o balde atual e o anterior; apaga o resto.
    try { await usageCountersRepo.prune(METRIC_RATELIMIT, balde(agora - windowMs)) } catch { /* poda é best-effort */ }
  }

  return {
    localKeys: false,

    init(opts: StoreOptions) {
      if (opts?.windowMs) windowMs = opts.windowMs
    },

    async increment(key: string) {
      const w = balde()
      const totalHits = await usageCountersRepo.incrementAndGet(asUserId(key), METRIC_RATELIMIT, w)
      void podarSePreciso()
      // Fim do balde atual = início do próximo.
      const resetTime = new Date((Math.floor(Date.now() / windowMs) + 1) * windowMs)
      return { totalHits, resetTime }
    },

    async decrement(key: string) {
      // Só faz sentido dentro do balde corrente; `refund` já tem piso em zero.
      await usageCountersRepo.refund(asUserId(key), METRIC_RATELIMIT, balde())
    },

    async resetKey(key: string) {
      await usageCountersRepo.reset(asUserId(key), METRIC_RATELIMIT, balde())
    },
  }
}
