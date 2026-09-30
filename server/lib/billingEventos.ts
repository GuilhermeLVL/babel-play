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

import {
  type CicloDeCobranca,
  ehPlanoPago,
  normalizarPlano,
  type PlanoDeAssinatura,
  planoPeloPagamento,
} from '../../src/core/planos'
import { creditsRepo } from '../db/repositories/credits'
import { subscriptionsRepo } from '../db/repositories/subscriptions'
import { asaasConfigurado, buscarPagamento, estornarCobranca, type PagamentoAsaas } from './asaas'
import { asUserId } from './authContext'
import { log } from './logger'

/** O período que um pagamento confirmado concede: o ciclo mais cinco dias para a próxima cobrança compensar. */
export const DIAS_DO_PERIODO_MENSAL = 35
export const DIAS_DO_PERIODO_ANUAL = 370

/** GAP-011: confere um pagamento contra a fonte autoritativa (a API do Asaas). Injetável p/ teste. */
export type VerificadorDePagamento = (id: string) => Promise<PagamentoAsaas | null>

export const eventoSchema = z
  .object({
    id: z.string().min(4).max(80),
    event: z.string().min(3).max(60),
    payment: z
      .object({
        id: z.string().optional(),
        subscription: z.string().optional(),
        externalReference: z.string().optional(),
        dueDate: z.string().optional(),
        /* O VALOR PAGO. Entrou em 01/09: sem ele, o webhook não tinha como saber se a parcela que
       confirmou era a do plano que ele estava prestes a conceder. */
        value: z.number().optional(),
      })
      .optional(),
    subscription: z
      .object({
        id: z.string().optional(),
        externalReference: z.string().optional(),
      })
      .optional(),
  })
  .passthrough()

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
export async function aplicarEvento(
  ev: EventoAsaas,
  requestId?: string,
  /* GAP-011: por padrão confere na API do Asaas quando configurada; os testes injetam um stub, e sem
     `ASAAS_API_KEY` (self-host, ou o webhook desligado) fica `undefined` e cai no comportamento antigo. */
  verificar: VerificadorDePagamento | undefined = asaasConfigurado() ? buscarPagamento : undefined,
  /* Eventos INTERNOS (os que o nosso servidor grava, como o estorno do arrependimento) só são
     aplicados quando quem chama é o próprio servidor — a rota admin de reprocessamento. O webhook
     chama com `false`: um token vazado não pode disparar estornos. */
  interno = false,
): Promise<ResultadoDoEvento> {
  if (ev.event.startsWith('ESTORNO_') && !interno) {
    log('warn', { event: 'billing_evento_interno_no_webhook', error: ev.event, requestId })
    return { estado: 'ignorado', motivo: `evento interno não aceito pelo webhook: ${ev.event}` }
  }
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
       * GAP-011: CONFERE o pagamento na API do Asaas antes de qualquer efeito. O payload do webhook
       * chega autenticado só por um token estático — se ele vazar, `value`/`status`/`subscription`
       * são atacáveis. A API (nossa `ASAAS_API_KEY`) é a verdade: `value`, `status`, `subscription`,
       * `dueDate` e o dono (`externalReference`) passam a vir dela, não do atacante. Sem verificador
       * (self-host / webhook desligado / testes), cai no comportamento anterior baseado no payload.
       */
      const vId = ev.payment?.id
      let vValor = ev.payment?.value
      let vSub = ev.payment?.subscription
      let vVenc = ev.payment?.dueDate
      let userIdEfetivo = userId
      if (verificar && vId) {
        const real = await verificar(vId)
        if (!real) {
          return { estado: 'nao-aplicado', motivo: `pagamento ${vId} não encontrado no Asaas (evento não confere)` }
        }
        if (real.status !== 'CONFIRMED' && real.status !== 'RECEIVED') {
          return {
            estado: 'nao-aplicado',
            motivo: `pagamento ${vId} com status ${real.status} no Asaas (não confirmado)`,
          }
        }
        vValor = real.value
        vSub = real.subscription
        vVenc = real.dueDate ?? vVenc
        if (real.externalReference) userIdEfetivo = asUserId(real.externalReference)
      }

      /**
       * ASSINATURA OU COMPRA AVULSA? `subscription` é o discriminador do provedor: presente = parcela
       * de assinatura; ausente = cobrança avulsa (créditos, passe). Sem esta pergunta, uma compra de
       * R$ 9,90 em moeda daria um plano de R$ 9,90/mês de graça.
       */
      if (!vSub && vId) {
        const compra = await creditsRepo.confirmarPagamento(vId)
        if (compra) {
          log('info', { event: 'billing_credito_confirmado', requestId })
          return { estado: 'aplicado', motivo: null }
        }
        // Avulso que não é compra nossa: NÃO promove plano nenhum — e fica pendente, não some.
        return { estado: 'nao-aplicado', motivo: `avulso-desconhecido: pagamento ${vId} sem compra registrada` }
      }

      const atual = await subscriptionsRepo.getActive(userIdEfetivo)
      /* O PLANO E O CICLO SAEM DO VALOR (matriz v2): R$ 19,90 é o Premium mensal, R$ 179 o anual, e
         os preços antigos (Essencial R$ 19,90, Pro R$ 39,90) continuam pagando o Premium mensal — a
         assinatura recorrente de antes não perde o plano no mês seguinte. O ramo do parcelamento
         (`parcelas`, a parcela do 12x) é do C5. */
      const pago = planoPeloPagamento(vValor)
      const planoPago = pago?.plano ?? null
      /* A intenção gravada pode ter nome antigo (linha de antes da 0041): lida como o atual. */
      const planoGravado = atual ? normalizarPlano(atual.plan) : null
      const planoDaIntencao: PlanoDeAssinatura = planoGravado && ehPlanoPago(planoGravado) ? planoGravado : 'premium'
      const cicloDaIntencao: CicloDeCobranca = atual?.ciclo === 'anual' ? 'anual' : 'mensal'

      /**
       * A ASSINATURA QUE PAGOU TEM DE SER A QUE ESTÁ REGISTRADA — `POST /api/billing/assinar`
       * grava a intenção e é DE GRAÇA, então uma parcela de assinatura antiga não pode confirmar
       * a intenção mais recente. Se o VALOR PAGO casa com um plano, o pagante recebe o que pagou e a
       * divergência fica escrita; sem valor, o evento fica pendente para revisão humana.
       */
      let motivo: string | null = null
      if (atual?.providerSubscriptionId && vSub && atual.providerSubscriptionId !== vSub) {
        const divergencia = `assinatura-divergente: pago ${vSub}, registrado ${atual.providerSubscriptionId}`
        if (!planoPago) {
          return { estado: 'nao-aplicado', motivo: `${divergencia}; evento sem valor para deduzir o plano` }
        }
        log('warn', { event: 'billing_assinatura_divergente', error: divergencia, requestId })
        motivo = divergencia
      }

      /**
       * O PLANO SAI DO VALOR PAGO, não da intenção (fecha a escalada assinar-pro-pagar-essencial).
       * Sem valor no evento, cai na intenção: recusar toda promoção por falta de um campo trocaria
       * uma escalada por uma negação de serviço a quem pagou.
       */
      const plano: PlanoDeAssinatura = planoPago ?? planoDaIntencao
      const ciclo: CicloDeCobranca = pago?.ciclo ?? cicloDaIntencao
      if (pago && (pago.plano !== planoDaIntencao || pago.ciclo !== cicloDaIntencao)) {
        const nota = `plano-divergente: pago ${pago.plano} ${pago.ciclo} (R$ ${vValor}), intenção ${planoDaIntencao} ${cicloDaIntencao} — vale o pago`
        log('warn', { event: 'billing_plano_divergente', error: nota, requestId })
        motivo = motivo ? `${motivo}; ${nota}` : nota
      }

      /* A validade sai do VENCIMENTO da parcela paga quando ele vem, com cinco dias de folga para a
         próxima cobrança compensar: um mês e cinco dias no mensal, um ano e cinco dias no anual pago
         inteiro. Sem `dueDate`, conta de hoje. (O 12x, que paga o ano em parcelas, é do C5.) */
      const vencimento = vVenc ? Date.parse(`${vVenc}T12:00:00Z`) : NaN
      const base = Number.isFinite(vencimento) ? vencimento : Date.now()
      const dias = ciclo === 'anual' ? DIAS_DO_PERIODO_ANUAL : DIAS_DO_PERIODO_MENSAL
      await subscriptionsRepo.upsert(userIdEfetivo, {
        plan: plano,
        status: 'active',
        ciclo,
        currentPeriodEnd: base + dias * 86_400_000,
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
      /* Estorno de parcela: o dinheiro voltou, então não há período pago — o acesso termina AGORA.
         Sem zerar `currentPeriodEnd`, o "cancelado mantém até o fim do período" (entitlements)
         deixaria quem foi reembolsado com o mês de graça. */
      await subscriptionsRepo.upsert(userId, { status: 'canceled', currentPeriodEnd: Date.now(), cancelAtPeriodEnd: 0 })
      return { estado: 'aplicado', motivo: null }
    case 'ESTORNO_ARREPENDIMENTO': {
      /* REAPLICAÇÃO de um arrependimento cujo estorno o Asaas recusou (fila do admin). Tenta o
         estorno de novo; falhando outra vez, continua pendente com o motivo novo. */
      const pagamentoId = ev.payment?.id
      if (!pagamentoId) return { estado: 'nao-aplicado', motivo: 'estorno sem id de pagamento' }
      try {
        await estornarCobranca(pagamentoId, 'Arrependimento em 7 dias (CDC art. 49) — reprocessado')
      } catch (err) {
        return { estado: 'nao-aplicado', motivo: `estorno falhou de novo: ${String(err).slice(0, 200)}` }
      }
      await subscriptionsRepo.upsert(userId, { status: 'canceled', currentPeriodEnd: Date.now(), cancelAtPeriodEnd: 0 })
      return { estado: 'aplicado', motivo: 'estorno reprocessado' }
    }
    case 'SUBSCRIPTION_DELETED':
      await subscriptionsRepo.upsert(userId, { status: 'canceled' })
      return { estado: 'aplicado', motivo: null }
    default:
      // Evento que não tratamos: auditado pela tabela, sem efeito — nunca pendente.
      return { estado: 'ignorado', motivo: `evento-nao-tratado: ${ev.event}` }
  }
}
