/**
 * O EFEITO DE UM EVENTO DE COBRANÇA — separado da rota para poder ser REAPLICADO.
 *
 * Por que existe (auditoria de 2026-09-07, achado A05): o webhook respondia 200 e caía num
 * `break` silencioso em dois casos — pagamento confirmado cuja assinatura divergia da registrada,
 * e cobrança avulsa que não casava com compra nenhuma. O Asaas trata 200 como entregue e não
 * reenvia; a marca de idempotência já tinha sido gravada; o pagante ficava sem o plano e ninguém
 * tinha como reprocessar. Aqui todo evento termina com um ESTADO e um MOTIVO, e a mesma função
 * serve ao webhook e à rota administrativa de reprocessamento.
 *
 * Estados: `aplicado` (teve efeito, com `motivo` quando houve divergência a registrar),
 * `nao-aplicado` (deveria ter tido efeito e não teve — fica pendente para um administrador),
 * `ignorado` (evento sem usuário ou que este servidor não trata — auditado, nunca pendente).
 */
import { z } from 'zod'

import { ehPlanoDeAssinatura, PLAN_MATRIX, type PlanoDeAssinatura,planoPeloPreco } from '../../src/core/planos'
import { creditsRepo } from '../db/repositories/credits'
import { subscriptionsRepo } from '../db/repositories/subscriptions'
import { asUserId } from './authContext'
import { log } from './logger'

export const eventoSchema = z.object({
  id: z.string().min(4).max(80),
  event: z.string().min(3).max(60),
  payment: z.object({
    id: z.string().optional(),
    subscription: z.string().optional(),
    externalReference: z.string().optional(),
    dueDate: z.string().optional(),
    /* O VALOR PAGO. Entrou em 01/09: sem ele, o webhook não tinha como saber se a parcela que
       confirmou era a do plano que ele estava prestes a conceder. */
    value: z.number().optional(),
  }).optional(),
  subscription: z.object({
    id: z.string().optional(),
    externalReference: z.string().optional(),
  }).optional(),
}).passthrough()

export type EventoAsaas = z.infer<typeof eventoSchema>
export type EstadoDoEvento = 'aplicado' | 'nao-aplicado' | 'ignorado'

export interface ResultadoDoEvento {
  estado: EstadoDoEvento
  motivo: string | null
  /** Evento sem `externalReference`: auditado, sem efeito (contrato antigo da resposta). */
  semUsuario?: boolean
}

export function referenciaDoEvento(ev: EventoAsaas): string | null {
  return ev.payment?.externalReference ?? ev.subscription?.externalReference ?? null
}

export function providerRefDoEvento(ev: EventoAsaas): string | null {
  return ev.payment?.id ?? ev.subscription?.id ?? null
}

/**
 * Aplica o evento. NÃO decide idempotência (isso é da marca em `billing_events`, antes daqui) e
 * NÃO engole falha: exceção sobe para o chamador desmarcar e responder 500, como sempre.
 */
export async function aplicarEvento(ev: EventoAsaas, requestId?: string): Promise<ResultadoDoEvento> {
  const referencia = referenciaDoEvento(ev)
  if (!referencia) {
    // Evento sem usuário (ex.: cobrança avulsa criada no painel) — auditado, sem efeito.
    log('warn', { event: 'billing_webhook_sem_referencia', error: ev.event, requestId })
    return { estado: 'ignorado', motivo: 'sem-referencia-de-usuario', semUsuario: true }
  }
  const userId = asUserId(referencia)

  switch (ev.event) {
    /* CONFIRMED = pagamento compensou; RECEIVED = dinheiro disponível. Qualquer um dos dois
       concede o plano — a distinção é de caixa, não de direito do assinante. */
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED': {
      /**
       * ASSINATURA OU COMPRA AVULSA? `payment.subscription` é o discriminador do próprio provedor:
       * presente = parcela de uma assinatura; ausente = cobrança avulsa (créditos, passe). Sem
       * esta pergunta, uma compra de R$ 9,90 em moeda daria um plano de R$ 9,90/mês de graça.
       */
      if (!ev.payment?.subscription && ev.payment?.id) {
        const compra = await creditsRepo.confirmarPagamento(ev.payment.id)
        if (compra) {
          log('info', { event: 'billing_credito_confirmado', requestId })
          return { estado: 'aplicado', motivo: null }
        }
        // Avulso que não é compra nossa: NÃO promove plano nenhum — e fica pendente, não some.
        return { estado: 'nao-aplicado', motivo: `avulso-desconhecido: pagamento ${ev.payment.id} sem compra registrada` }
      }

      const atual = await subscriptionsRepo.getActive(userId)
      const planoPago = planoPeloPreco(ev.payment?.value)
      const planoDaIntencao: PlanoDeAssinatura =
        atual && ehPlanoDeAssinatura(atual.plan) && PLAN_MATRIX[atual.plan].precoMensalBrl !== null
          ? atual.plan
          : 'essencial'

      /**
       * A ASSINATURA QUE PAGOU TEM DE SER A QUE ESTÁ REGISTRADA — `POST /api/billing/assinar`
       * grava a intenção e é DE GRAÇA, então uma parcela de assinatura antiga não pode confirmar
       * a intenção mais recente. Antes isto era um `break` mudo. Agora: se o VALOR PAGO casa com
       * um plano, o pagante recebe exatamente o que pagou (o dinheiro entrou para este usuário)
       * e a divergência fica escrita; sem valor no evento, não há como saber o que foi pago e o
       * evento fica pendente para revisão humana.
       */
      let motivo: string | null = null
      if (atual?.providerSubscriptionId && ev.payment?.subscription
          && atual.providerSubscriptionId !== ev.payment.subscription) {
        const divergencia = `assinatura-divergente: pago ${ev.payment.subscription}, registrado ${atual.providerSubscriptionId}`
        if (!planoPago) {
          return { estado: 'nao-aplicado', motivo: `${divergencia}; evento sem valor para deduzir o plano` }
        }
        log('warn', { event: 'billing_assinatura_divergente', error: divergencia, requestId })
        motivo = divergencia
      }

      /**
       * O PLANO SAI DO VALOR PAGO, não da intenção (fecha a escalada assinar-pro-pagar-essencial).
       * Sem valor no evento, cai na intenção: é o comportamento anterior, e recusar toda promoção
       * por falta de um campo opcional trocaria uma escalada por uma negação de serviço a quem pagou.
       */
      const plano: PlanoDeAssinatura = planoPago ?? planoDaIntencao
      if (planoPago && planoPago !== planoDaIntencao) {
        const nota = `plano-divergente: pago ${planoPago} (R$ ${ev.payment?.value}), intenção ${planoDaIntencao} — vale o pago`
        log('warn', { event: 'billing_plano_divergente', error: nota, requestId })
        motivo = motivo ? `${motivo}; ${nota}` : nota
      }

      /* A validade sai do VENCIMENTO da parcela paga quando ele vem, com cinco dias de folga
         para a próxima cobrança compensar. Sem `dueDate`, o mês redondo de antes. */
      const vencimento = ev.payment?.dueDate ? Date.parse(`${ev.payment.dueDate}T12:00:00Z`) : NaN
      const base = Number.isFinite(vencimento) ? vencimento : Date.now()
      await subscriptionsRepo.upsert(userId, {
        plan: plano,
        status: 'active',
        currentPeriodEnd: base + 35 * 86_400_000,
        cancelAtPeriodEnd: 0,
      })
      return { estado: 'aplicado', motivo }
    }
    case 'PAYMENT_OVERDUE':
      // A graça de `subConcede` mantém o acesso até `currentPeriodEnd`; o Asaas cobra o pagador.
      await subscriptionsRepo.upsert(userId, { status: 'past_due' })
      return { estado: 'aplicado', motivo: null }
    case 'PAYMENT_REFUNDED':
      // Estorno de compra avulsa: a compra deixa de conceder crédito (evento inverso).
      if (!ev.payment?.subscription && ev.payment?.id) {
        await creditsRepo.cancelarCompra(ev.payment.id)
        return { estado: 'aplicado', motivo: null }
      }
      // Estorno de assinatura cancela o plano, como antes.
      await subscriptionsRepo.upsert(userId, { status: 'canceled' })
      return { estado: 'aplicado', motivo: null }
    case 'SUBSCRIPTION_DELETED':
      await subscriptionsRepo.upsert(userId, { status: 'canceled' })
      return { estado: 'aplicado', motivo: null }
    default:
      // Evento que não tratamos: auditado pela tabela, sem efeito — nunca pendente.
      return { estado: 'ignorado', motivo: `evento-nao-tratado: ${ev.event}` }
  }
}
