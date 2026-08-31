/**
 * COBRANÇA (E3) — Asaas: assinar, cancelar, e o webhook que é a fonte da verdade do plano.
 *
 * O DESENHO EM UMA FRASE: o cliente só INICIA (`/assinar` devolve o link de pagamento do Asaas);
 * quem PROMOVE o plano é exclusivamente o webhook, quando o dinheiro de fato entra. Nenhuma
 * resposta ao cliente muda `subscriptions` — senão bastaria chamar a rota para virar Pro.
 *
 * O webhook chega SEM JWT (o Asaas não tem a sessão de ninguém): é montado FORA do authMiddleware
 * e autenticado pelo header `asaas-access-token`, comparado ao nosso segredo. O usuário do evento
 * vem do `externalReference` que NÓS gravamos ao criar a assinatura.
 *
 * Idempotência: entrega *at-least-once* → `billingEventsRepo.marcarSeNovo` (INSERT com PK do
 * evento) decide e marca numa instrução. Evento repetido = 200 sem efeito.
 */
import { Router, json } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { PLAN_MATRIX, ehPlanoDeAssinatura, type PlanoDeAssinatura } from '../../src/core/planos'
import { subscriptionsRepo } from '../db/repositories/subscriptions'
import { billingEventsRepo } from '../db/repositories/billingEvents'
import { asUserId } from '../lib/authContext'
import { asaasConfigurado, cancelarAssinatura, criarAssinatura, criarCliente, primeiraCobranca } from '../lib/asaas'
import { parseOr400 } from '../validation'
import { erroDeRota } from '../lib/erroDeRota'
import { log } from '../lib/logger'

/* ------------------------------------------------------------------ rotas do usuário (atrás do auth) */

export const billingRouter = Router()

const assinarSchema = z.object({
  plano: z.string(),
  /** Nome e CPF/CNPJ vão DIRETO ao Asaas (obrigação regulatória é dele); não guardamos CPF. */
  nome: z.string().min(2).max(120),
  cpfCnpj: z.string().regex(/^\d{11}$|^\d{14}$/, 'CPF (11 dígitos) ou CNPJ (14), só números'),
  email: z.string().email().max(200).optional(),
}).strip()

billingRouter.post('/assinar', async (req, res) => {
  const dados = parseOr400(assinarSchema, req.body, res)
  if (!dados) return
  if (!asaasConfigurado()) {
    res.status(501).json({ error: 'cobrança não configurada no servidor (ASAAS_API_KEY ausente)' })
    return
  }
  const plano = dados.plano
  if (!ehPlanoDeAssinatura(plano) || PLAN_MATRIX[plano].precoMensalBrl === null) {
    res.status(400).json({ error: 'este plano não é vendável' })
    return
  }
  const preco = PLAN_MATRIX[plano].precoMensalBrl

  try {
    // Reusa o cliente Asaas já criado numa tentativa anterior — recomeçar o checkout não duplica.
    const atual = await subscriptionsRepo.getActive(req.userId)
    const clienteId =
      atual?.providerCustomerId ?? (await criarCliente(req.userId, dados.nome, dados.cpfCnpj, dados.email)).id

    const assinatura = await criarAssinatura(req.userId, clienteId, preco, `Babel Play ${PLAN_MATRIX[plano].rotulo}`)
    /* Guarda os ids do provedor JÁ, mas NÃO muda plan/status: a promoção é do webhook, quando o
       pagamento confirmar. `plan` aqui registra a INTENÇÃO para o webhook saber o que conceder. */
    await subscriptionsRepo.upsert(req.userId, {
      provider: 'asaas',
      providerCustomerId: clienteId,
      providerSubscriptionId: assinatura.id,
      plan: plano,
      status: (atual?.status as import('../db/repositories/subscriptions').SubStatus | undefined) ?? 'trialing',
    })

    const cobranca = await primeiraCobranca(assinatura.id)
    log('info', { event: 'billing_assinatura_criada', route: '/api/billing/assinar', requestId: req.requestId })
    res.json({ linkDePagamento: cobranca?.invoiceUrl ?? null, assinatura: assinatura.id })
  } catch (err) {
    res.status(502).json({ error: `falha ao criar assinatura: ${erroDeRota(err, { event: 'billing_error' })}` })
  }
})

/** O que a tela de Planos mostra: existe assinatura? em que estado? até quando vale? */
billingRouter.get('/status', async (req, res) => {
  const sub = await subscriptionsRepo.getActive(req.userId)
  res.json({
    configurado: asaasConfigurado(),
    assinatura: sub
      ? { plano: sub.plan, status: sub.status, valeAte: sub.currentPeriodEnd, provedor: sub.provider }
      : null,
  })
})

billingRouter.post('/cancelar', async (req, res) => {
  const atual = await subscriptionsRepo.getActive(req.userId)
  if (!atual?.providerSubscriptionId) {
    res.status(404).json({ error: 'nenhuma assinatura ativa para cancelar' })
    return
  }
  try {
    await cancelarAssinatura(atual.providerSubscriptionId)
    /* Cancelou = para de RENOVAR; o que já foi pago vale até o fim do período (a graça de
       `subConcede` em entitlements.ts cuida do resto). Rebaixar na hora puniria quem pagou. */
    await subscriptionsRepo.upsert(req.userId, { status: 'canceled', cancelAtPeriodEnd: 1 })
    log('info', { event: 'billing_cancelada', route: '/api/billing/cancelar', requestId: req.requestId })
    res.json({ ok: true, valeAte: atual.currentPeriodEnd })
  } catch (err) {
    res.status(502).json({ error: `falha ao cancelar: ${erroDeRota(err, { event: 'billing_error' })}` })
  }
})

/* ------------------------------------------------------------------ webhook (FORA do auth) */

const eventoSchema = z.object({
  id: z.string().min(4).max(80),
  event: z.string().min(3).max(60),
  payment: z.object({
    id: z.string().optional(),
    subscription: z.string().optional(),
    externalReference: z.string().optional(),
    dueDate: z.string().optional(),
  }).optional(),
  subscription: z.object({
    id: z.string().optional(),
    externalReference: z.string().optional(),
  }).optional(),
}).passthrough()

/** Comparação em tempo constante — igualdade de string vaza o tamanho do prefixo certo. */
function tokenConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const asaasWebhookRouter = Router()
asaasWebhookRouter.use(json({ limit: '100kb' }))

asaasWebhookRouter.post('/', async (req, res) => {
  const segredo = process.env.ASAAS_WEBHOOK_TOKEN
  if (!segredo) {
    // Sem segredo configurado o webhook NÃO processa nada: aceitar evento sem autenticar seria
    // deixar qualquer POST da internet promover plano.
    res.status(501).json({ error: 'webhook não configurado (ASAAS_WEBHOOK_TOKEN ausente)' })
    return
  }
  if (!tokenConfere(req.header('asaas-access-token'), segredo)) {
    log('warn', { event: 'billing_webhook_token_invalido', route: '/api/billing/webhook/asaas' })
    res.status(401).json({ error: 'token inválido' })
    return
  }

  const parsed = eventoSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    // 200 de propósito: corpo estranho não é motivo para o Asaas ficar reentregando para sempre.
    res.status(200).json({ ok: false, motivo: 'corpo fora da forma' })
    return
  }
  const ev = parsed.data
  const referencia = ev.payment?.externalReference ?? ev.subscription?.externalReference ?? null
  const providerRef = ev.payment?.id ?? ev.subscription?.id ?? null

  // Idempotência ANTES de qualquer efeito: decidir e marcar são a mesma instrução.
  const novo = await billingEventsRepo.marcarSeNovo(ev.id, 'asaas', ev.event, referencia, providerRef)
  if (!novo) {
    res.status(200).json({ ok: true, repetido: true })
    return
  }

  if (!referencia) {
    // Evento sem usuário (ex.: cobrança avulsa criada no painel) — auditado, sem efeito.
    log('warn', { event: 'billing_webhook_sem_referencia', error: ev.event })
    res.status(200).json({ ok: true, semUsuario: true })
    return
  }
  const userId = asUserId(referencia)

  try {
    switch (ev.event) {
      /* CONFIRMED = pagamento compensou; RECEIVED = dinheiro disponível. Qualquer um dos dois
         concede o plano — a distinção é de caixa, não de direito do assinante. O plano concedido é
         a INTENÇÃO gravada por `/assinar`; +35 dias cobre o ciclo mensal com folga de vencimento,
         e o próximo pagamento re-estica a janela. */
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED': {
        const atual = await subscriptionsRepo.getActive(userId)
        const plano: PlanoDeAssinatura =
          atual && ehPlanoDeAssinatura(atual.plan) && PLAN_MATRIX[atual.plan].precoMensalBrl !== null
            ? atual.plan
            : 'essencial'
        await subscriptionsRepo.upsert(userId, {
          plan: plano,
          status: 'active',
          currentPeriodEnd: Date.now() + 35 * 86_400_000,
          cancelAtPeriodEnd: 0,
        })
        break
      }
      case 'PAYMENT_OVERDUE':
        // A graça de `subConcede` mantém o acesso até `currentPeriodEnd`; o Asaas cobra o pagador.
        await subscriptionsRepo.upsert(userId, { status: 'past_due' })
        break
      case 'PAYMENT_REFUNDED':
      case 'SUBSCRIPTION_DELETED':
        await subscriptionsRepo.upsert(userId, { status: 'canceled' })
        break
      default:
        // Evento que não tratamos: auditado pela tabela, sem efeito — e 200, para não reentregar.
        break
    }
    log('info', { event: 'billing_webhook_ok', provider: 'asaas', error: ev.event })
    res.status(200).json({ ok: true })
  } catch (err) {
    /* FALHA NOSSA depois da marca: desmarca e responde 500, para o Asaas REENTREGAR — senão a
       promoção do assinante se perderia para sempre (o evento repetido seria "já processado").
       Se nem desmarcar der, loga ALTO: é o único caso em que um pagamento pode ficar sem efeito. */
    try {
      await billingEventsRepo.desmarcar(ev.id)
    } catch {
      log('error', { event: 'billing_webhook_marca_presa', provider: 'asaas', error: ev.id })
    }
    res.status(500).json({ error: erroDeRota(err, { event: 'billing_webhook_error' }) })
  }
})
