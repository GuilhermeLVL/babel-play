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
/** Segundos de áudio FATURÁVEIS enviados ao STT de nuvem. A unidade em que o provedor cobra. */
export const METRIC_STT_SEGUNDOS = 'stt_seconds'
/** Tokens (entrada + saída) gastos no LLM gerenciado. Só contabiliza; não é teto. */
export const METRIC_LLM_TOKENS = 'llm_tokens'

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

/**
 * Teto MENSAL DE SEGUNDOS de áudio no STT gerenciado. selfhost ∞; pro do env (default 36.000 s =
 * 10 horas); demais 0 (o free já é barrado antes, pelo entitlement).
 *
 * POR QUE ESTE TETO EXISTE, ao lado do de chamadas. O de chamadas é fair-use; este é o de DINHEIRO.
 * A Groq cobra STT por hora de áudio, então o gasto de um usuário depende de quanto tempo ele fala,
 * não de quantas vezes. Sem um teto nesta unidade, alguém com a captura aberta 24 h/dia custa duas
 * ordens de grandeza mais que o assinante típico — e o contador de chamadas nem pisca.
 *
 * 10 h/mês foi escolhido por medição, não por gosto: é o perfil do "usuário pesado" da conta em
 * docs/auditoria/eval-producao-v1.md, e a US$ 0,04/hora custa ~US$ 0,67/mês com o mínimo faturado.
 */
export function capSegundosParaPlano(plan: Plan): number {
  if (plan === 'selfhost') return Infinity
  if (plan === 'pro') {
    const n = Number(process.env.PRO_MONTHLY_STT_SECONDS)
    return Number.isFinite(n) && n > 0 ? n : 36_000
  }
  return 0
}

/**
 * RESERVA `segundos` de áudio ANTES de mandar ao provedor — mesma disciplina de
 * `reserveManagedCall`: decidir e contabilizar na MESMA instrução, senão o teto não vale sob
 * concorrência.
 *
 * Degrada ABERTO como o resto do fair-use: falha de infra não bloqueia pagante, mas deixa rastro.
 */
export async function reservarSegundosDeStt(userId: UserId, segundos: number): Promise<boolean> {
  try {
    const cap = capSegundosParaPlano(await getPlanForUser(userId))
    return await usageCountersRepo.reserve(userId, METRIC_STT_SEGUNDOS, currentWindow(), cap, segundos)
  } catch (err) {
    log('error', {
      event: 'quota_seconds_failed_open',
      error: String((err as Error)?.message || err).slice(0, 120),
    })
    return true
  }
}

/** Estorna segundos reservados que não viraram transcrição (o provedor recusou ou caiu). */
export async function estornarSegundosDeStt(userId: UserId, segundos: number): Promise<void> {
  try {
    await usageCountersRepo.refund(userId, METRIC_STT_SEGUNDOS, currentWindow(), segundos)
  } catch (err) {
    log('warn', { event: 'quota_seconds_refund_failed', error: String(err).slice(0, 120) })
  }
}

/**
 * Registra tokens gastos no LLM gerenciado. É CONTABILIDADE, não teto: os tokens só se conhecem
 * DEPOIS da resposta, então não há como reservá-los antes — e recusar depois de já ter pago ao
 * provedor não devolveria dinheiro nenhum. O teto de custo do LLM é o de chamadas.
 *
 * Sem este número não existe preço: os `gpt-oss` são modelos de raciocínio e os tokens de
 * pensamento contam como SAÍDA, a parte cara. Medido no gold set: 96 tokens de saída por fala no
 * esforço padrão contra 31 no `low` — uma diferença de 3× na conta que o campo `usage` já
 * informava e que era descartado.
 */
export async function registrarTokensDeLlm(userId: UserId, tokens: number): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) return
  try {
    await usageCountersRepo.increment(userId, METRIC_LLM_TOKENS, currentWindow(), Math.round(tokens))
  } catch (err) {
    log('warn', { event: 'llm_tokens_record_failed', error: String(err).slice(0, 120) })
  }
}
