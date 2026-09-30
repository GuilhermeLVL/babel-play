/**
 * ENTITLEMENTS server-side (SaaS Fatia 1) — a AUTORIDADE do plano. O cliente
 * (`src/lib/entitlements.ts`) vira só um hint de UI; a decisão real acontece aqui e (na Fatia 1b)
 * nos proxies de IA. Espelha o shape do cliente + acrescenta `managedCloudLlm` (que o cliente não tem).
 *
 * Fonte do plano (ordem): (1) `subscriptions` (fonte da verdade; o billing escreve aqui); (2) default por
 * MODO — público → 'free' (conta nova sem assinatura), local/self-host → 'selfhost'. NÃO honramos
 * `settings.ui.plan` (gravável pelo cliente = escalada A01); para conceder 'premium' sem billing, use a rota admin.
 *
 * Sem `Date.now()` proibido aqui — é módulo Node normal (não script de workflow).
 */
import { definicaoDoPlano, type EntitlementsDoPlano, normalizarPlano, type PlanoEfetivo } from '../../src/core/planos'
import { type Subscription, subscriptionsRepo } from '../db/repositories/subscriptions'
import { authRequired } from './auth'
import type { UserId } from './authContext'
import { ehConvidadoNoContexto, memoDoRequest } from './contextoDeConvidado'
import { log } from './logger'

/* O shape é o da MATRIZ, mais o plano: um entitlement novo (`traducaoNuance`, `vozNatural` na matriz
   v2) chega ao servidor, ao `/api/me/entitlements` e ao `hasEntitlement` sem mais uma lista à mão. */
export interface Entitlements extends EntitlementsDoPlano {
  plan: PlanoEfetivo
}

/**
 * A assinatura CONCEDE o plano? Só com LASTRO de pagamento: `active` (webhook confirmou) sempre, e
 * `past_due` na graça (já pagou o período corrente). `trialing` NÃO concede (GAP-001): é o estado
 * que `POST /api/billing/assinar` grava ao INICIAR o checkout, antes de qualquer pagamento — tratá-lo
 * como concessão deixava qualquer conta virar o plano pedido só por clicar em assinar, sem pagar
 * (provado em openspec/audits/2026-09-13-pre-deploy/evidencias/poc-billing.txt). Nada legítimo produz
 * `trialing` como direito: o webhook e a rota admin gravam `active`.
 *
 * `canceled` com `currentPeriodEnd` no FUTURO também concede (Fase 3 do lançamento, Decreto
 * 11.034/2022): cancelar para a RENOVAÇÃO, e o mês que já foi pago continua valendo até o fim. Antes
 * o cancelamento cortava o acesso na hora enquanto a tela prometia "você continua até o fim do
 * período". Quem zera o período é o arrependimento (reembolso = sem período pago) e o estorno.
 */
function subConcede(sub: Subscription): boolean {
  if (sub.status === 'active') return true
  const periodoPagoAFrente = sub.currentPeriodEnd != null && sub.currentPeriodEnd > Date.now()
  if ((sub.status === 'past_due' || sub.status === 'canceled') && periodoPagoAFrente) return true
  return false // 'trialing' (não pago), cancelada sem período à frente ou graça expirada → free
}

/** O plano EFETIVO do usuário, resolvido no servidor. */
export async function getPlanForUser(userId: UserId): Promise<PlanoEfetivo> {
  // 0) Self-host/local (AUTH_REQUIRED desligada): a IA gerenciada usa a chave do PRÓPRIO usuário
  //    (o GROQ_API_KEY do .env dele) — não há custo nosso, nada a gatear. Sempre 'selfhost'.
  if (!authRequired()) return 'selfhost'

  // 0b) Fase 7 — usuário ANÔNIMO do Supabase (JWT com `is_anonymous`): `convidado`, antes de olhar
  //     assinatura (anônimo não assina: o billing responde `exige_conta`). Ver `contextoDeConvidado.ts`.
  if (ehConvidadoNoContexto(userId)) return 'convidado'

  // 1) Assinatura é a ÚNICA fonte autoritativa do plano em modo público: concede o plano dela, ou
  //    'free' se não concede mais. Lida UMA vez por request (`memoDoRequest`): várias camadas do
  //    mesmo request perguntam o plano, e a mesma linha era lida 3x por STT/MT.
  const sub = await memoDoRequest(userId, 'assinatura', () => subscriptionsRepo.getActive(userId))
  if (sub) {
    /* O NOME ANTIGO É LIDO COMO O ATUAL (matriz v2, ADR 0011): uma linha `essencial`/`pro` que a
       migração 0041 não reescreveu — ou que um processo velho gravou durante o deploy — é
       `premium`, e o assinante antigo não perde o acesso por causa de um nome. */
    const plano = normalizarPlano(sub.plan)
    if (subConcede(sub) && plano) return plano
    /* Plano fora da matriz degrada para `free` — o seguro — mas agora DEIXA RASTRO. Antes a
       degradação era silenciosa: uma linha corrompida no banco viraria "usuário free" sem que
       ninguém jamais soubesse o porquê. */
    if (!plano) {
      log('warn', { event: 'plano_desconhecido', error: String(sub.plan).slice(0, 40) })
      return 'free'
    }
    return 'free' // assinatura não concede mais (cancelada / graça expirada)
  }

  // 2) Público sem assinatura → free. NÃO honramos settings.ui.plan: é gravável pelo cliente
  //    (PUT /api/settings) e concedê-lo seria escalada de privilégio/gasto (OWASP A01). Para conceder
  //    'premium' sem billing, use a rota admin (semeia subscriptions).
  return 'free'
}

/**
 * Deriva os entitlements de um plano — LENDO A MATRIZ, não um booleano.
 *
 * A versão anterior era `const paid = pro || selfhost` ligando as 4 flags de uma vez. Cada plano
 * declara cada entitlement na matriz — um booleano único não consegue expressar, por exemplo, a
 * nuvem do convidado sem a Tradução Nuance do Premium.
 */
export function getEntitlements(plan: PlanoEfetivo): Entitlements {
  const def = definicaoDoPlano(plan)
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
