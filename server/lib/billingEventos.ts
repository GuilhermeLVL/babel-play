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
  PARCELAS_DO_ANUAL,
  type PlanoDeAssinatura,
  planoPeloPagamento,
} from '../../src/core/planos'
import { creditsRepo } from '../db/repositories/credits'
import { type Subscription, subscriptionsRepo } from '../db/repositories/subscriptions'
import { asaasConfigurado, buscarPagamento, estornarCobranca, estornarParcelamento, type PagamentoAsaas } from './asaas'
import { asUserId, type UserId } from './authContext'
import { log } from './logger'

/**
 * O período que um pagamento confirmado concede: o ciclo mais cinco dias para a próxima cobrança
 * compensar. O ANUAL vale para as duas formas de pagar o ano — a assinatura `YEARLY` paga inteira e o
 * 12x (contado do vencimento da 1ª parcela).
 */
export const DIAS_DO_PERIODO_MENSAL = 35
export const DIAS_DO_PERIODO_ANUAL = 370

const DIA_MS = 86_400_000

/** O vencimento `AAAA-MM-DD` ao meio-dia UTC (longe da virada do dia em qualquer fuso do Brasil). */
const meioDiaDo = (iso: string | undefined): number => (iso ? Date.parse(`${iso}T12:00:00Z`) : NaN)

/**
 * O VENCIMENTO DA 1ª PARCELA, a partir de qualquer uma delas: as parcelas do Asaas vencem todo mês no
 * mesmo dia (sondagem de 29/09/2026), então a n-ésima vence n − 1 meses depois da primeira. É isso
 * que faz as 12 confirmações do cartão concederem o MESMO ano — sem a âncora, a 12ª parcela daria
 * onze meses a mais. No fim de mês (31 → 28/30) a conta volta um ou dois dias; o "nunca encurta"
 * abaixo segura a data maior.
 */
export function vencimentoDaPrimeiraParcela(dueDate: string | undefined, numero: number | undefined): number {
  const venc = meioDiaDo(dueDate)
  if (!Number.isFinite(venc)) return NaN
  const n = Number.isInteger(numero) && (numero as number) > 1 ? (numero as number) : 1
  const d = new Date(venc)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (n - 1), d.getUTCDate(), 12)
}

/**
 * A assinatura concede AGORA um período pago à frente? O mesmo critério de `subConcede`
 * (entitlements), repetido aqui só para a regra de não encurtar.
 */
function periodoPagoAFrente(sub: Subscription | null, agora: number): number | null {
  if (!sub || sub.currentPeriodEnd == null || sub.currentPeriodEnd <= agora) return null
  if (sub.status === 'active' || sub.status === 'past_due' || sub.status === 'canceled') return sub.currentPeriodEnd
  return null
}

/**
 * UM PAGAMENTO NUNCA ENCURTA O QUE JÁ FOI PAGO (C5). Com o anual e o 12x, a mesma conta pode
 * receber a confirmação de uma cobrança menor depois de uma maior: a mensalidade de uma assinatura
 * antiga que o Asaas ainda cobrou, ou a parcela 12 do cartão chegando depois do anual. Gravar o
 * período do pagamento mais recente derrubaria o ano pago para um mês. Vale o fim MAIOR, com o ciclo
 * que o concedeu.
 */
function periodoQueVale(
  atual: Subscription | null,
  fim: number,
  ciclo: CicloDeCobranca,
  agora = Date.now(),
): { fim: number; ciclo: CicloDeCobranca; manteve: boolean } {
  const jaPago = periodoPagoAFrente(atual, agora)
  if (jaPago !== null && jaPago > fim) {
    return { fim: jaPago, ciclo: atual?.ciclo === 'anual' ? 'anual' : 'mensal', manteve: true }
  }
  return { fim, ciclo, manteve: false }
}

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
        /* C5 — a PARCELA do 12x: `installment` presente e `subscription` ausente é o discriminador
           do ramo do parcelamento (sondagem de 29/09/2026). Sem estes campos no schema, o zod os
           descartaria e a parcela cairia no ramo da compra avulsa. */
        installment: z.string().optional(),
        installmentNumber: z.number().optional(),
        billingType: z.string().optional(),
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
      let vParcelamento = ev.payment?.installment
      let vNumero = ev.payment?.installmentNumber
      let vTipo = ev.payment?.billingType
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
        // O parcelamento também vem da API: o payload não decide se é parcela nem de quê.
        vParcelamento = real.installment
        vNumero = real.installmentNumber
        vTipo = real.billingType
        if (real.externalReference) userIdEfetivo = asUserId(real.externalReference)
      }

      /* PARCELA DO 12x (C5): `installment` presente e `subscription` ausente. Vem ANTES da compra
         avulsa, que também não tem `subscription` — sem esta ordem, a parcela do ano viraria
         "avulso desconhecido" e o pagante ficaria sem o plano. */
      if (!vSub && vParcelamento) {
        return aplicarParcela(userIdEfetivo, {
          parcelamento: vParcelamento,
          numero: vNumero,
          tipo: vTipo,
          valor: vValor,
          vencimento: vVenc,
          requestId,
        })
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
         inteiro (`YEARLY`). Sem `dueDate`, conta de hoje. E nunca encurta o que já foi pago. */
      const vencimento = meioDiaDo(vVenc)
      const base = Number.isFinite(vencimento) ? vencimento : Date.now()
      const dias = ciclo === 'anual' ? DIAS_DO_PERIODO_ANUAL : DIAS_DO_PERIODO_MENSAL
      const vale = periodoQueVale(atual, base + dias * DIA_MS, ciclo)
      if (vale.manteve) {
        const nota = 'periodo-mantido: o pago antes vale até mais tarde'
        log('warn', { event: 'billing_periodo_mantido', error: nota, requestId })
        motivo = motivo ? `${motivo}; ${nota}` : nota
      }
      await subscriptionsRepo.upsert(userIdEfetivo, {
        plan: plano,
        status: 'active',
        ciclo: vale.ciclo,
        currentPeriodEnd: vale.fim,
        cancelAtPeriodEnd: 0,
      })
      return { estado: 'aplicado', motivo }
    }
    case 'PAYMENT_OVERDUE':
      // A graça de `subConcede` mantém o acesso até `currentPeriodEnd`; o Asaas cobra o pagador.
      await subscriptionsRepo.upsert(userId, { status: 'past_due' })
      return { estado: 'aplicado', motivo: null }
    case 'PAYMENT_REFUNDED':
      /* Estorno de compra avulsa: a compra deixa de conceder crédito (evento inverso). A parcela do
         12x também não tem `subscription` — mas tem `installment`, e o estorno dela é do PLANO. */
      if (!ev.payment?.subscription && !ev.payment?.installment && ev.payment?.id) {
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
         estorno de novo; falhando outra vez, continua pendente com o motivo novo. O do 12x estorna o
         PARCELAMENTO inteiro (`installment`), numa chamada só. */
      const pagamentoId = ev.payment?.id
      const parcelamentoId = ev.payment?.installment
      if (!pagamentoId && !parcelamentoId) return { estado: 'nao-aplicado', motivo: 'estorno sem id de pagamento' }
      try {
        const descricao = 'Arrependimento em 7 dias (CDC art. 49) — reprocessado'
        if (parcelamentoId) await estornarParcelamento(parcelamentoId, descricao)
        else await estornarCobranca(pagamentoId as string, descricao)
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

/**
 * O EFEITO DE UMA PARCELA DO 12x CONFIRMADA (C5) — o ano inteiro, no vencimento da 1ª parcela.
 *
 * As três conferências, na ordem:
 *  1. A PARCELA É DO ANUAL: o valor é uma das parcelas que o Asaas cobra de `precoAnualBrl` em
 *     `PARCELAS_DO_ANUAL` vezes (R$ 14,91, ou R$ 14,99 na última). Qualquer outro valor não paga plano
 *     nenhum — R$ 14,91 como mensalidade seria o Premium pela terça parte.
 *  2. NO CARTÃO: o 12x só é criado com `CREDIT_CARD` (`criarParcelamento`), e só nele o ano inteiro
 *     é compromisso da operadora. Uma parcela de carnê (Pix/boleto) que confirme aqui não é nossa —
 *     fica pendente para o admin, em vez de dar o ano por uma parcela.
 *  3. O PARCELAMENTO É O REGISTRADO: se não for, o pagante recebe o que pagou e a divergência fica
 *     escrita (a mesma regra da assinatura divergente).
 *
 * IDEMPOTENTE POR CONSTRUÇÃO, além da marca do evento: as 12 confirmações ancoram no vencimento da
 * 1ª parcela (`vencimentoDaPrimeiraParcela`) e dão o MESMO fim; e o período nunca encurta.
 */
async function aplicarParcela(
  userId: UserId,
  p: {
    parcelamento: string
    numero: number | undefined
    tipo: string | undefined
    valor: number | undefined
    vencimento: string | undefined
    requestId: string | undefined
  },
): Promise<ResultadoDoEvento> {
  const pago = planoPeloPagamento(p.valor, { parcelas: PARCELAS_DO_ANUAL })
  if (!pago) {
    return {
      estado: 'nao-aplicado',
      motivo: `parcela-desconhecida: R$ ${p.valor} do parcelamento ${p.parcelamento} não é parcela do anual`,
    }
  }
  if (p.tipo && p.tipo !== 'CREDIT_CARD') {
    return {
      estado: 'nao-aplicado',
      motivo: `parcelamento ${p.parcelamento} fora do cartão (${p.tipo}): o 12x só concede o ano no cartão`,
    }
  }

  const atual = await subscriptionsRepo.getActive(userId)
  let motivo: string | null = null
  if (atual?.providerInstallmentId && atual.providerInstallmentId !== p.parcelamento) {
    motivo = `parcelamento-divergente: pago ${p.parcelamento}, registrado ${atual.providerInstallmentId}`
    log('warn', { event: 'billing_parcelamento_divergente', error: motivo, requestId: p.requestId })
  }

  const primeira = vencimentoDaPrimeiraParcela(p.vencimento, p.numero)
  const base = Number.isFinite(primeira) ? primeira : Date.now()
  const vale = periodoQueVale(atual, base + DIAS_DO_PERIODO_ANUAL * DIA_MS, 'anual')
  await subscriptionsRepo.upsert(userId, {
    plan: pago.plano,
    status: 'active',
    ciclo: vale.ciclo,
    provider: 'asaas',
    meio: 'parcelamento',
    providerInstallmentId: p.parcelamento,
    currentPeriodEnd: vale.fim,
    cancelAtPeriodEnd: 0,
  })
  return { estado: 'aplicado', motivo }
}
