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
  planoPagoMaisBarato,
  planoPeloPagamento,
} from '../../src/core/planos'
import { creditsRepo } from '../db/repositories/credits'
import { type Subscription, subscriptionsRepo } from '../db/repositories/subscriptions'
import {
  asaasConfigurado,
  type AssinaturaDetalhadaAsaas,
  buscarPagamento,
  conferirAssinatura,
  estornarCobranca,
  estornarParcelamento,
  type PagamentoAsaas,
} from './asaas'
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
/** O par dele para os eventos de ASSINATURA (`SUBSCRIPTION_DELETED`/`_INACTIVATED`). `null` = 404. */
export type VerificadorDeAssinatura = (id: string) => Promise<AssinaturaDetalhadaAsaas | null>

/**
 * `null` É AUSÊNCIA. A API do Asaas devolve os campos vazios como `null` (`"paymentDate": null`,
 * `"installmentNumber": null`), e o `.optional()` do zod recusa `null`: um pagamento confirmado que
 * trouxesse `"subscription": null` cairia em "corpo fora da forma", responderia 200 e sumiria SEM
 * nem ser registrado. Os nulos saem antes da validação, no evento e nos dois objetos que lemos.
 */
function semNulos(v: unknown): unknown {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return v
  const limpar = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== null))
  const ev = limpar(v as Record<string, unknown>)
  for (const parte of ['payment', 'subscription']) {
    const x = ev[parte]
    if (typeof x === 'object' && x !== null && !Array.isArray(x)) ev[parte] = limpar(x as Record<string, unknown>)
  }
  return ev
}

const formaDoEvento = z
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

export const eventoSchema = z.preprocess(semNulos, formaDoEvento)

export type EventoAsaas = z.infer<typeof formaDoEvento>
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
  /* O conferidor dos eventos de ASSINATURA, com o mesmo padrão do de pagamento. É o último parâmetro
     para não mudar a chamada de quem já passava os outros. */
  verificarAssinatura: VerificadorDeAssinatura | undefined = asaasConfigurado() ? conferirAssinatura : undefined,
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
      /* A intenção gravada pode ter nome antigo (linha de antes da 0041): lida como o atual. Sem
         intenção de plano pago (a linha não existe, ou é a do admin), o padrão é o plano pago MAIS
         BARATO da matriz: ele só vale quando o evento também veio sem valor, e sem saber quanto entrou
         não se concede o mais caro. */
      const planoGravado = atual ? normalizarPlano(atual.plan) : null
      const planoDaIntencao: PlanoDeAssinatura = ehPlanoPago(planoGravado) ? planoGravado : planoPagoMaisBarato()
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
    /**
     * DAQUI PARA BAIXO, OS EVENTOS QUE TIRAM ALGUMA COISA DE ALGUÉM — e por isso nenhum deles vale só
     * pelo payload quando há API para perguntar (auditoria de cobrança de 02/10/2026). O GAP-011
     * fechou a CONCESSÃO forjada; o atraso, o estorno e a assinatura removida continuavam aplicados
     * com o que o corpo dizia, e um token de webhook vazado derrubava o plano de qualquer conta com
     * um POST. A regra é a mesma do pagamento confirmado: a API confirma, ou o evento fica
     * `nao-aplicado` (fila do admin) e nada cai; API fora do ar sobe como exceção → 500 → o Asaas
     * reentrega.
     */
    case 'PAYMENT_OVERDUE': {
      const p = await conferirPagamento(ev, userId, verificar, STATUS_DE_ATRASO, STATUS_DE_PAGO)
      if ('estado' in p) return p
      /* Cobrança AVULSA vencida é checkout de créditos abandonado (vence em 3 dias): não é parcela do
         plano, e marcar `past_due` por causa dela punha o assinante em dia em "pagamento atrasado". */
      if (!p.assinatura && !p.parcelamento) {
        return { estado: 'ignorado', motivo: `cobrança avulsa ${p.id ?? '?'} vencida: não é parcela do plano` }
      }
      const atual = await subscriptionsRepo.getActive(p.userId)
      if (!atual) return { estado: 'ignorado', motivo: 'atraso sem assinatura registrada: nada a marcar' }
      const divergencia = divergenciaDaLinha(atual, p)
      if (divergencia) return { estado: 'nao-aplicado', motivo: `atraso não aplicado — ${divergencia}` }
      // A graça de `subConcede` mantém o acesso até `currentPeriodEnd`; o Asaas cobra o pagador.
      await subscriptionsRepo.upsert(p.userId, { status: 'past_due' })
      return { estado: 'aplicado', motivo: null }
    }
    case 'PAYMENT_REFUNDED':
      return aplicarDinheiroDevolvido(ev, userId, verificar, STATUS_DE_ESTORNO, 'estorno')
    /**
     * CHARGEBACK — o titular do cartão contestou a compra na operadora. `REQUESTED` = o dinheiro foi
     * retido e está em disputa; `DISPUTE` = nós contestamos, e ele segue retido. Nos dois o efeito é
     * o do estorno: não há período pago, o acesso termina agora (e a compra de créditos deixa de
     * conceder). Antes caíam no `default`: quem contestava ficava com o ano de acesso E com o
     * dinheiro de volta. Se a disputa for perdida, o Asaas manda `PAYMENT_REFUNDED` — o mesmo
     * efeito, de novo, sem dano.
     */
    case 'PAYMENT_CHARGEBACK_REQUESTED':
    case 'PAYMENT_CHARGEBACK_DISPUTE':
      return aplicarDinheiroDevolvido(ev, userId, verificar, STATUS_DE_CHARGEBACK, 'chargeback')
    case 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL':
      /* A disputa foi ganha por NÓS e o dinheiro está voltando: este evento não derruba nada. Também
         não DEVOLVE o acesso sozinho — ele foi cortado quando o chargeback chegou, e reativar a conta
         de quem contestou é decisão de gente (rota admin de assinatura). Fica auditado e no log. */
      log('warn', { event: 'billing_chargeback_revertido', error: `${ev.payment?.id ?? '?'}`, requestId })
      return {
        estado: 'ignorado',
        motivo: `chargeback revertido a nosso favor (pagamento ${ev.payment?.id ?? '?'}): nada a derrubar; o acesso cortado na disputa não volta sozinho`,
      }
    case 'PAYMENT_DELETED': {
      /* A cobrança foi REMOVIDA no Asaas (pelo painel, ou junto com a assinatura/parcelamento).
         - Compra de créditos: a compra deixa de conceder — pendente, ela nunca mais poderá ser paga.
         - Fatura de assinatura ou parcela: o plano NÃO se decide por aqui. Uma fatura em aberto
           removida nunca concedeu nada; o que encerra o plano é o evento da assinatura (ou o estorno,
           se ela estava paga). Fica `ignorado` com o porquê, e não mais "evento-nao-tratado". */
      const id = ev.payment?.id
      let avulsa = !ev.payment?.subscription && !ev.payment?.installment
      if (verificar) {
        if (!id) {
          return { estado: 'nao-aplicado', motivo: 'cobrança removida sem id de pagamento para conferir no Asaas' }
        }
        const real = await verificar(id)
        // 404 também confirma: a cobrança não existe lá. Existindo, tem de estar marcada como removida.
        if (real && !real.deleted) {
          return {
            estado: 'nao-aplicado',
            motivo: `pagamento ${id} não está removido no Asaas (status ${real.status}) — evento não confere`,
          }
        }
        if (real) avulsa = !real.subscription && !real.installment
      }
      if (!avulsa || !id) {
        return {
          estado: 'ignorado',
          motivo: 'cobrança de assinatura/parcelamento removida: o plano segue os eventos da assinatura e do pagamento',
        }
      }
      await creditsRepo.cancelarCompra(id)
      return { estado: 'aplicado', motivo: null }
    }
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
    /**
     * A ASSINATURA DEIXOU DE RENOVAR — removida (`DELETED`) ou inativada (`INACTIVATED`, que caía no
     * `default`). O efeito é o do botão Cancelar fora dos 7 dias: `canceled` SEM mexer no
     * `currentPeriodEnd`, então o que já foi pago vale até o fim (entitlements.subConcede).
     *
     * A CONFERÊNCIA, nesta ordem:
     *  1. É A ASSINATURA REGISTRADA? Quem prova de quem ela é somos nós (`providerSubscriptionId`,
     *     gravado por `/assinar`), não o `externalReference` do corpo. A remoção de uma assinatura
     *     ANTIGA da mesma conta não cancela a atual (nem o 12x): é `ignorado`, com o porquê.
     *  2. ELA PAROU MESMO? A API tem de dizer removida, inativa/expirada — ou 404, que para o id que
     *     NÓS registramos só pode ser "não existe mais". Se ela segue ativa lá, o evento não confere:
     *     `nao-aplicado`, e ninguém perde a renovação.
     */
    case 'SUBSCRIPTION_DELETED':
    case 'SUBSCRIPTION_INACTIVATED': {
      const subId = ev.subscription?.id
      const atual = await subscriptionsRepo.getActive(userId)
      if (!atual) {
        return { estado: 'ignorado', motivo: 'assinatura encerrada no Asaas sem assinatura registrada aqui' }
      }
      const registrada = Boolean(subId && atual.providerSubscriptionId === subId)
      if (!registrada && (atual.providerSubscriptionId || atual.providerInstallmentId)) {
        const aRegistrada = atual.providerSubscriptionId ?? `parcelamento ${atual.providerInstallmentId}`
        return {
          estado: 'ignorado',
          motivo: `assinatura ${subId ?? '?'} encerrada no Asaas não é a registrada (${aRegistrada}): a atual segue como está`,
        }
      }
      if (verificarAssinatura) {
        if (!subId) return { estado: 'nao-aplicado', motivo: 'evento de assinatura sem id para conferir no Asaas' }
        const real = await verificarAssinatura(subId)
        if (!real) {
          /* 404. Para a assinatura registrada, confirma. Para uma linha SEM id do provedor (plano
             concedido pelo admin), não prova nada — qualquer id inventado dá 404. */
          if (!registrada) {
            return {
              estado: 'nao-aplicado',
              motivo: `assinatura ${subId} não encontrada no Asaas (evento não confere)`,
            }
          }
        } else {
          if (real.externalReference ? real.externalReference !== String(userId) : !registrada) {
            return {
              estado: 'nao-aplicado',
              motivo: `assinatura ${subId} não pertence a esta conta no Asaas (evento não confere)`,
            }
          }
          const parou = real.deleted === true || real.status === 'INACTIVE' || real.status === 'EXPIRED'
          if (!parou) {
            return {
              estado: 'nao-aplicado',
              motivo: `assinatura ${subId} segue ${real.status ?? 'de pé'} no Asaas (não removida nem inativa)`,
            }
          }
        }
      }
      await subscriptionsRepo.upsert(userId, { status: 'canceled' })
      return { estado: 'aplicado', motivo: null }
    }
    default:
      // Evento que não tratamos: auditado pela tabela, sem efeito — nunca pendente.
      return { estado: 'ignorado', motivo: `evento-nao-tratado: ${ev.event}` }
  }
}

/* Os status da API que CONFIRMAM cada evento (docs.asaas.com, status de cobrança). */
const STATUS_DE_PAGO = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'])
const STATUS_DE_ATRASO = new Set(['OVERDUE'])
const STATUS_DE_ESTORNO = new Set(['REFUNDED'])
/* `AWAITING_CHARGEBACK_REVERSAL` fica FORA de propósito: é a disputa já ganha por nós. Um
   `CHARGEBACK_REQUESTED` reprocessado depois disso não pode derrubar ninguém. `REFUNDED` entra: é a
   disputa perdida, e o dinheiro voltou do mesmo jeito. */
const STATUS_DE_CHARGEBACK = new Set(['CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'REFUNDED'])

/** O pagamento do evento, já trocado pelo que a API diz dele quando há verificador. */
interface PagamentoConferido {
  id: string | undefined
  assinatura: string | undefined
  parcelamento: string | undefined
  /** O dono: o `externalReference` da API quando ela o traz; senão, o do payload. */
  userId: UserId
}

/**
 * CONFERE NA API o pagamento de um evento que TIRA alguma coisa. Devolve o pagamento como a API o
 * conhece — assinatura, parcelamento e DONO saem dela, não do corpo — ou o resultado que encerra o
 * evento sem efeito:
 *  - sem id, inexistente lá, ou com um status que não é o que o evento afirma → `nao-aplicado`;
 *  - com um status de `inofensivos` → `ignorado` (o atraso que chegou depois de a fatura ser paga
 *    não é fraude nem pendência: é ordem de entrega).
 * Sem verificador (self-host, webhook sem `ASAAS_API_KEY`) vale o payload, como sempre valeu.
 */
async function conferirPagamento(
  ev: EventoAsaas,
  userId: UserId,
  verificar: VerificadorDePagamento | undefined,
  confirmam: ReadonlySet<string>,
  inofensivos?: ReadonlySet<string>,
): Promise<PagamentoConferido | ResultadoDoEvento> {
  const id = ev.payment?.id
  if (!verificar) {
    return { id, assinatura: ev.payment?.subscription, parcelamento: ev.payment?.installment, userId }
  }
  if (!id) return { estado: 'nao-aplicado', motivo: `${ev.event} sem id de pagamento para conferir no Asaas` }
  const real = await verificar(id)
  if (!real) return { estado: 'nao-aplicado', motivo: `pagamento ${id} não encontrado no Asaas (evento não confere)` }
  if (!confirmam.has(real.status)) {
    if (inofensivos?.has(real.status)) {
      return { estado: 'ignorado', motivo: `pagamento ${id} já está ${real.status} no Asaas: ${ev.event} superado` }
    }
    return {
      estado: 'nao-aplicado',
      motivo: `pagamento ${id} com status ${real.status} no Asaas (${ev.event} não confere)`,
    }
  }
  return {
    id,
    assinatura: real.subscription || undefined,
    parcelamento: real.installment || undefined,
    userId: real.externalReference ? asUserId(real.externalReference) : userId,
  }
}

/**
 * O pagamento é do fluxo que a linha REGISTRA? Uma linha com id do provedor só é derrubada por um
 * pagamento da assinatura ou do parcelamento que ela guarda: o estorno (ou o atraso) de uma
 * assinatura ANTIGA da mesma conta não pode levar o plano atual junto. Linha sem id nenhum (plano
 * concedido pelo admin, ou de antes de os ids existirem) não tem com o que comparar e segue a regra
 * antiga. Devolve o motivo da divergência, ou `null` quando confere.
 */
function divergenciaDaLinha(atual: Subscription, p: PagamentoConferido): string | null {
  if (!atual.providerSubscriptionId && !atual.providerInstallmentId) return null
  if (p.assinatura && p.assinatura === atual.providerSubscriptionId) return null
  if (p.parcelamento && p.parcelamento === atual.providerInstallmentId) return null
  const pago = p.assinatura ? `assinatura ${p.assinatura}` : `parcelamento ${p.parcelamento}`
  const registrado = [
    atual.providerSubscriptionId ? `assinatura ${atual.providerSubscriptionId}` : '',
    atual.providerInstallmentId ? `parcelamento ${atual.providerInstallmentId}` : '',
  ]
    .filter(Boolean)
    .join(' / ')
  return `cobrança-divergente: pagamento ${p.id ?? '?'} é de ${pago}, registrado ${registrado}`
}

/**
 * O DINHEIRO VOLTOU (estorno) OU ESTÁ RETIDO (chargeback) — o efeito é um só.
 *  - Compra avulsa: a compra deixa de conceder crédito (evento inverso). A parcela do 12x também
 *    não tem `subscription` — mas tem `installment`, e o estorno dela é do PLANO.
 *  - Parcela de assinatura ou do 12x: não há período pago, então o acesso termina AGORA. Sem zerar
 *    `currentPeriodEnd`, o "cancelado mantém até o fim do período" (entitlements) deixaria quem foi
 *    reembolsado com o mês de graça.
 */
async function aplicarDinheiroDevolvido(
  ev: EventoAsaas,
  userId: UserId,
  verificar: VerificadorDePagamento | undefined,
  confirmam: ReadonlySet<string>,
  oQue: 'estorno' | 'chargeback',
): Promise<ResultadoDoEvento> {
  const p = await conferirPagamento(ev, userId, verificar, confirmam)
  if ('estado' in p) return p
  if (!p.assinatura && !p.parcelamento && p.id) {
    await creditsRepo.cancelarCompra(p.id)
    return { estado: 'aplicado', motivo: null }
  }
  const atual = await subscriptionsRepo.getActive(p.userId)
  if (!atual) return { estado: 'ignorado', motivo: `${oQue} sem assinatura registrada: nada a revogar` }
  const divergencia = divergenciaDaLinha(atual, p)
  if (divergencia) return { estado: 'nao-aplicado', motivo: `${oQue} não aplicado — ${divergencia}` }
  await subscriptionsRepo.upsert(p.userId, { status: 'canceled', currentPeriodEnd: Date.now(), cancelAtPeriodEnd: 0 })
  return { estado: 'aplicado', motivo: null }
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
