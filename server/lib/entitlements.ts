/**
 * ENTITLEMENTS server-side (SaaS Fatia 1) — a AUTORIDADE do plano. O cliente
 * (`src/lib/entitlements.ts`) vira só um hint de UI; a decisão real acontece aqui e (na Fatia 1b)
 * nos proxies de IA. Espelha o shape do cliente + acrescenta `managedCloudLlm` (que o cliente não tem).
 *
 * Fonte do plano (ordem): (1) `subscriptions` (fonte da verdade; o billing escreve aqui); (2) default por
 * MODO — público → 'free' (conta nova sem assinatura), local/self-host → 'selfhost'. NÃO honramos
 * `settings.ui.plan` (gravável pelo cliente = escalada A01); para conceder 'pro' sem billing, use a rota admin.
 *
 * Sem `Date.now()` proibido aqui — é módulo Node normal (não script de workflow).
 */
import { ehPlanoDeAssinatura,PLAN_MATRIX } from '../../src/core/planos'
import { type Plan, type Subscription,subscriptionsRepo } from '../db/repositories/subscriptions'
import { authRequired } from './auth'
import type { UserId } from './authContext'
import { log } from './logger'

export interface Entitlements {
  plan: Plan
  youtubeImport: boolean
  managedCloudStt: boolean
  managedCloudLlm: boolean
  largerModels: boolean
}

/* O guard deriva da matriz. A lista duplicada que vivia aqui era o pior dos cinco pontos: uma
   assinatura `essencial` VÁLIDA teria caído para `free` em silêncio se alguém esquecesse esta
   linha ao adicionar o plano. */
const isPlan = ehPlanoDeAssinatura

/** A assinatura CONCEDE o plano? active/trialing sempre; past_due só na graça (até o fim do período). */
function subConcede(sub: Subscription): boolean {
  if (sub.status === 'active' || sub.status === 'trialing') return true
  if (sub.status === 'past_due' && sub.currentPeriodEnd != null && sub.currentPeriodEnd > Date.now()) return true
  return false // 'canceled' ou graça expirada → cai para free
}

/** O plano EFETIVO do usuário, resolvido no servidor. */
export async function getPlanForUser(userId: UserId): Promise<Plan> {
  // 0) Self-host/local (AUTH_REQUIRED desligada): a IA gerenciada usa a chave do PRÓPRIO usuário
  //    (o GROQ_API_KEY do .env dele) — não há custo nosso, nada a gatear. Sempre 'selfhost'.
  if (!authRequired()) return 'selfhost'

  // 1) Assinatura é a ÚNICA fonte autoritativa do plano em modo público: concede o plano dela, ou
  //    'free' se não concede mais.
  const sub = await subscriptionsRepo.getActive(userId)
  if (sub) {
    if (subConcede(sub) && isPlan(sub.plan)) return sub.plan
    /* Plano fora da matriz degrada para `free` — o seguro — mas agora DEIXA RASTRO. Antes a
       degradação era silenciosa: uma linha corrompida no banco viraria "usuário free" sem que
       ninguém jamais soubesse o porquê. */
    if (!isPlan(sub.plan)) {
      log('warn', { event: 'plano_desconhecido', error: String(sub.plan).slice(0, 40) })
      return 'free'
    }
    return 'free' // assinatura não concede mais (cancelada / graça expirada)
  }

  // 2) Público sem assinatura → free. NÃO honramos settings.ui.plan: é gravável pelo cliente
  //    (PUT /api/settings) e concedê-lo seria escalada de privilégio/gasto (OWASP A01). Para conceder
  //    'pro' sem billing, use a rota admin (semeia subscriptions).
  return 'free'
}

/**
 * Deriva os entitlements de um plano — LENDO A MATRIZ, não um booleano.
 *
 * A versão anterior era `const paid = pro || selfhost` ligando as 4 flags de uma vez. O plano
 * Essencial quebra essa simetria de propósito: tradução de nuvem SIM, STT de nuvem NÃO — é o que
 * o torna barato. Um booleano único não consegue expressar isso.
 */
export function getEntitlements(plan: Plan): Entitlements {
  const def = PLAN_MATRIX[plan]
  return { plan, ...def.entitlements }
}

/** Os entitlements EFETIVOS do usuário (plano resolvido no servidor). */
export async function getEntitlementsForUser(userId: UserId): Promise<Entitlements> {
  return getEntitlements(await getPlanForUser(userId))
}

/**
 * Conveniência para o enforcement nos proxies (Fatia 1b): o usuário tem o entitlement `key`?
 * Deriva o plano NO SERVIDOR — o cliente nunca decide. BYOK/local não passam por aqui (só o ramo
 * da chave gerenciada chama esta checagem).
 */
export async function hasEntitlement(userId: UserId, key: keyof Omit<Entitlements, 'plan'>): Promise<boolean> {
  return (await getEntitlementsForUser(userId))[key]
}
