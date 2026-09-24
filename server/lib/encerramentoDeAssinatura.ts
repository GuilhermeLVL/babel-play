/**
 * ENCERRAR A ASSINATURA — o único caminho, usado por "Cancelar" e por "Excluir a conta".
 *
 * Fase 3 do plano de lançamento. Antes, três promessas não batiam com o código: o app anunciava
 * reembolso em 7 dias e não existia função de estorno; cancelar cortava o acesso na hora com a tela
 * dizendo "até o fim do período"; e excluir a conta apagava os dados deixando o Asaas cobrando.
 *
 * AS DUAS SAÍDAS:
 *  - PRIMEIRO pagamento confirmado há 7 dias ou menos → ARREPENDIMENTO (CDC art. 49; Decreto
 *    7.962/2013 art. 5º): cancela no Asaas, estorna o valor integral de cada parcela paga, revoga o
 *    acesso agora (reembolsado = sem período pago) e devolve um protocolo para a tela confirmar na
 *    hora. O estorno de cartão pelo Asaas é o que avisa a administradora do cartão (§3º).
 *  - Depois disso → cancela a RENOVAÇÃO; o período pago vale até o próximo vencimento que o
 *    próprio Asaas informa (Decreto 11.034/2022: cancelar é fácil e não confisca o que foi pago).
 *
 * O ESTORNO QUE FALHA NÃO SOME: o Asaas recusa estorno de boleto e, logo após um Pix, pode faltar
 * saldo (400). O pedido fica em `billing_events` como `nao-aplicado`, entra na fila do admin
 * (`GET /api/admin/billing/pendentes`) e é reaplicável (`ESTORNO_ARREPENDIMENTO` em
 * `billingEventos.ts`). A tela diz que o reembolso será manual, com prazo.
 *
 * IDEMPOTENTE: a marca é `arrependimento:<id do pagamento>`, gravada ANTES do estorno — repetir o
 * cancelamento nunca estorna duas vezes.
 */
import { billingEventsRepo } from '../db/repositories/billingEvents'
import { subscriptionsRepo } from '../db/repositories/subscriptions'
import {
  buscarAssinatura,
  cancelarAssinatura,
  type CobrancaListadaAsaas,
  estornarCobranca,
  listarCobrancasDaAssinatura,
} from './asaas'
import type { UserId } from './authContext'
import { log } from './logger'

const DIA = 86_400_000
/** O prazo do CDC art. 49, contado em dias corridos a partir do pagamento confirmado. */
export const DIAS_DE_ARREPENDIMENTO = 7
/** O prazo que a tela promete quando o estorno automático falha e vira manual. */
export const PRAZO_DO_REEMBOLSO_MANUAL_DIAS = 7

const PAGAS = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'])

export interface Arrependimento {
  /** Soma do que foi (ou será) devolvido, em reais. */
  valor: number
  /** `true` = o Asaas aceitou todos os estornos; `false` = ao menos um ficou para o admin. */
  estornado: boolean
  /** Identifica o pedido para o titular (o id da marca em `billing_events`). */
  protocolo: string
  registradoEm: number
  /** Só quando `estornado === false`: em quantos dias o reembolso manual sai. */
  prazoManualDias?: number
}

export interface ResultadoDoEncerramento {
  /** Não havia assinatura no provedor — nada a cancelar. */
  semAssinatura: boolean
  /** Até quando o plano vale (epoch ms); `null` = acabou agora (arrependimento) ou não se sabe. */
  valeAte: number | null
  arrependimento: Arrependimento | null
}

/** A data em que o pagamento contou como feito: a confirmação do cartão, senão o pagamento. */
function dataDoPagamento(c: CobrancaListadaAsaas): number | null {
  const d = c.confirmedDate ?? c.paymentDate ?? c.clientPaymentDate
  if (!d) return null
  // Meia-noite de Brasília do dia do pagamento: é o calendário de quem pagou que conta.
  const t = Date.parse(`${d}T00:00:00-03:00`)
  return Number.isFinite(t) ? t : null
}

/**
 * Está dentro dos 7 dias? Do dia do pagamento até o fim do 7º dia seguinte (o prazo do CDC conta
 * da contratação; a tolerância do dia inteiro favorece o consumidor, como a lei manda interpretar).
 */
export function dentroDoArrependimento(dataPagamento: number, agora: number): boolean {
  return agora < dataPagamento + (DIAS_DE_ARREPENDIMENTO + 1) * DIA
}

/** Fim do dia do próximo vencimento, em Brasília. */
function fimDoDia(iso: string | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(`${iso}T23:59:59-03:00`)
  return Number.isFinite(t) ? t : null
}

async function estornarUma(userId: UserId, c: CobrancaListadaAsaas, requestId?: string): Promise<boolean> {
  const marca = `arrependimento:${c.id}`
  const payload = {
    id: marca,
    event: 'ESTORNO_ARREPENDIMENTO',
    payment: { id: c.id, externalReference: String(userId), value: c.value },
  }
  const novo = await billingEventsRepo.marcarSeNovo(marca, 'asaas', 'ESTORNO_ARREPENDIMENTO', userId, c.id, payload)
  if (!novo) {
    // Já pedido antes: vale o que ficou registrado (aplicado, ou pendente na fila do admin).
    const linha = await billingEventsRepo.ler(marca)
    return linha?.estado === 'aplicado'
  }
  try {
    await estornarCobranca(c.id, 'Arrependimento em 7 dias (CDC art. 49)')
    await billingEventsRepo.registrarResultado(marca, 'aplicado', null)
    return true
  } catch (err) {
    const motivo = `estorno do arrependimento falhou no Asaas: ${String(err).slice(0, 220)}`
    await billingEventsRepo.registrarResultado(marca, 'nao-aplicado', motivo)
    log('error', { event: 'billing_estorno_falhou', error: motivo, requestId })
    return false
  }
}

/**
 * Encerra a assinatura do usuário. LANÇA se o Asaas não confirmar o cancelamento (ou não listar
 * as cobranças): quem chama responde 502 e — na exclusão de conta — NÃO apaga nada.
 */
export async function encerrarAssinatura(
  userId: UserId,
  opts: { requestId?: string; agora?: number } = {},
): Promise<ResultadoDoEncerramento> {
  const agora = opts.agora ?? Date.now()
  const sub = await subscriptionsRepo.getActive(userId)
  if (!sub?.providerSubscriptionId) return { semAssinatura: true, valeAte: null, arrependimento: null }
  const assinaturaId = sub.providerSubscriptionId

  const cobrancas = await listarCobrancasDaAssinatura(assinaturaId)
  const pagas = cobrancas
    .filter((c) => PAGAS.has(c.status))
    .map((c) => ({ c, em: dataDoPagamento(c) }))
    .filter((x): x is { c: CobrancaListadaAsaas; em: number } => x.em !== null)
    .sort((a, b) => a.em - b.em)
  const primeira = pagas[0]

  if (primeira && dentroDoArrependimento(primeira.em, agora)) {
    await cancelarAssinatura(assinaturaId)
    let todos = true
    let valor = 0
    for (const { c } of pagas) {
      valor += c.value
      if (!(await estornarUma(userId, c, opts.requestId))) todos = false
    }
    await subscriptionsRepo.upsert(userId, { status: 'canceled', cancelAtPeriodEnd: 0, currentPeriodEnd: agora })
    log('info', {
      event: todos ? 'billing_arrependimento_estornado' : 'billing_arrependimento_manual',
      requestId: opts.requestId,
    })
    return {
      semAssinatura: false,
      valeAte: null,
      arrependimento: {
        valor: Math.round(valor * 100) / 100,
        estornado: todos,
        protocolo: `arrependimento:${primeira.c.id}`,
        registradoEm: agora,
        ...(todos ? {} : { prazoManualDias: PRAZO_DO_REEMBOLSO_MANUAL_DIAS }),
      },
    }
  }

  // Fora dos 7 dias: o fim do período vem do Asaas ANTES de cancelar (depois a assinatura some).
  let fim: number | null = null
  try {
    fim = fimDoDia((await buscarAssinatura(assinaturaId)).nextDueDate)
  } catch (err) {
    log('warn', {
      event: 'billing_fim_do_periodo_indisponivel',
      error: String(err).slice(0, 160),
      requestId: opts.requestId,
    })
  }
  await cancelarAssinatura(assinaturaId)
  const valeAte = fim ?? sub.currentPeriodEnd ?? null
  await subscriptionsRepo.upsert(userId, { status: 'canceled', cancelAtPeriodEnd: 1, currentPeriodEnd: valeAte })
  return { semAssinatura: false, valeAte, arrependimento: null }
}
