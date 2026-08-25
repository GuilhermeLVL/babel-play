/**
 * QUOTA de fair-use da IA gerenciada. É controle de USO (não de segurança) — o entitlement já
 * autorizou o acesso. Por isso DEGRADA ABERTO: qualquer erro ao resolver plano/contador → permite
 * (nunca bloquear um pagante por falha de contador). Só a chave gerenciada conta; BYOK/local nem chegam aqui.
 */
import type { UserId } from './authContext'
import { getPlanForUser } from './entitlements'
import type { Plan } from '../db/repositories/subscriptions'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import { log } from './logger'

export const METRIC_MANAGED = 'managed_calls'

/** Janela mensal 'YYYY-MM' (Date é permitido — módulo Node normal). */
function currentWindow(): string {
  return new Date().toISOString().slice(0, 7)
}

/** Teto mensal por plano. selfhost ∞; pro do env (default 1000); demais 0 (free já barrado por entitlement). */
export function capForPlan(plan: Plan): number {
  if (plan === 'selfhost') return Infinity
  if (plan === 'pro') {
    const n = Number(process.env.PRO_MONTHLY_MANAGED_CALLS)
    return Number.isFinite(n) && n > 0 ? n : 1000
  }
  return 0
}

/**
 * RESERVA uma chamada gerenciada — chame ANTES de falar com o provedor.
 *
 * Substitui o par `isWithinQuota()` + `recordManagedCall()`, que era um read-modify-write:
 * entre ler o contador e gravá-lo havia um `await fetch` ao provedor (dezenas a milhares de
 * ms), então N requisições simultâneas liam `used = 0` e TODAS passavam. Medido na auditoria:
 * 20 chamadas aceitas contra um teto de 5, todas cobradas (docs/audit/03-findings.md P0-1).
 *
 * Decidir e contabilizar agora são a MESMA instrução (`usageCountersRepo.reserve`), então o
 * teto vale sob concorrência. Se a chamada ao provedor falhar depois, use `refundManagedCall`.
 *
 * Erro → true (degrada ABERTO): fair-use nunca bloqueia pagante por falha de infra.
 */
export async function reserveManagedCall(userId: UserId): Promise<boolean> {
  try {
    const cap = capForPlan(await getPlanForUser(userId))
    return await usageCountersRepo.reserve(userId, METRIC_MANAGED, currentWindow(), cap)
  } catch (err) {
    // Rastreabilidade (P2-4): degradar aberto é a política, mas em SILÊNCIO não é. Sem esta
    // linha, uma falha do banco desligava o teto de gasto sem deixar nenhum rastro.
    log('error', {
      event: 'quota_reserve_failed_open',
      error: String((err as Error)?.message || err).slice(0, 120),
    })
    return true // fair-use: nunca bloquear por falha de infra
  }
}

/**
 * ESTORNA uma reserva que não virou chamada (o provedor recusou ou caiu). Sem isto, uma
 * indisponibilidade do provedor consumiria a quota do usuário sem entregar nada.
 * Erro só loga — o estorno é best-effort e não deve afetar a resposta.
 */
export async function refundManagedCall(userId: UserId): Promise<void> {
  try {
    await usageCountersRepo.refund(userId, METRIC_MANAGED, currentWindow())
  } catch (err) {
    /*
     * F5-04: era `console.warn`, ou seja, texto solto que ninguém agrega. E este evento é de
     * DINHEIRO: estorno que falha deixa uma reserva consumida sem a chamada correspondente, e o
     * usuário paga por algo que não aconteceu. Pelo logger ele vira linha JSON com allowlist e
     * chega a qualquer sink externo registrado.
     */
    log('warn', { event: 'quota_refund_failed', error: String(err).slice(0, 120) })
  }
}
