/**
 * EVENTOS DE BILLING — o teste-e-marca da idempotência (E3) e, desde a auditoria de 2026-09-07
 * (A05), o ESTADO de cada evento.
 *
 * A doc do Asaas é explícita: entrega *at-least-once*, "implement idempotency using the event
 * identifier". Aqui a decisão e a marca são a MESMA instrução (INSERT com PK = id do evento,
 * `onConflictDoNothing`): quem perde a corrida não afeta linha nenhuma — a disciplina é a mesma
 * do `usageCounters.reserve`, e pelo mesmo motivo (P0-1: decidir e gravar separado deixa passar
 * duplicata sob concorrência). Evento repetido = 200 sem efeito, NUNCA uma segunda promoção.
 *
 * O `payload` fica guardado para que um evento `nao-aplicado` possa ser reprocessado por um
 * administrador com a lógica atual — antes, um pagamento que caía num `break` não tinha volta.
 *
 * GUARDADO REDUZIDO, NÃO BRUTO (GAP-017 / S26-13, 02/10/2026). O corpo do Asaas pode trazer dado
 * pessoal do pagador — nome, CPF, e-mail, telefone, os últimos dígitos e o token do cartão, o link
 * da fatura — e ele ficava aqui sem prazo. Reaplicar um evento só precisa de ids, evento, valor,
 * status e datas: `reduzirPayload` é uma lista de campos PERMITIDOS aplicada dentro de
 * `marcarSeNovo`, a única porta de escrita, para nenhum chamador conseguir gravar o corpo cru.
 */
import { and, eq } from 'drizzle-orm'

import { db } from '../db'
import { billingEvents } from '../schema'

export type EstadoDoEventoDeBilling = 'aplicado' | 'nao-aplicado' | 'ignorado'

/**
 * OS CAMPOS QUE FICAM. Lista de permitidos, e não de proibidos: um campo novo que o Asaas passe a
 * mandar (ou um que a doc não promete) fica de fora até alguém precisar dele e o pôr aqui.
 *
 * O critério é "o que `aplicarEvento` lê, mais o que explica o evento a quem o audita": os ids
 * (pagamento, assinatura, parcelamento e o nosso `externalReference`), o valor, o status, o meio e
 * as datas. Fora: `customer`, `description`, `creditCard`, links de fatura e recibo, e todo o resto.
 *
 * A MIGRAÇÃO 0047 REPETE ESTAS TRÊS LISTAS em SQL para limpar as linhas antigas — mudou aqui, mude
 * lá (o teste `billing-events-payload-minimo` compara os dois resultados).
 */
const CAMPOS_DO_EVENTO = ['id', 'event', 'dateCreated'] as const
const CAMPOS_DO_PAGAMENTO = [
  'id', 'subscription', 'installment', 'installmentNumber', 'externalReference',
  'value', 'netValue', 'status', 'billingType', 'deleted',
  'dueDate', 'originalDueDate', 'paymentDate', 'clientPaymentDate', 'confirmedDate', 'dateCreated',
] as const
const CAMPOS_DA_ASSINATURA = [
  'id', 'externalReference', 'value', 'status', 'cycle', 'billingType', 'deleted', 'nextDueDate', 'dateCreated',
] as const

/** Texto maior que isto não é id, status nem data — não entra. */
const TEXTO_MAXIMO = 200

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Só PRIMITIVOS das chaves permitidas: um objeto escondido numa chave permitida não atravessa. */
function soPermitidos(origem: unknown, campos: readonly string[]): Record<string, string | number | boolean> | null {
  if (!ehObjeto(origem)) return null
  const saida: Record<string, string | number | boolean> = {}
  for (const campo of campos) {
    const v = origem[campo]
    if (typeof v === 'string' ? v.length <= TEXTO_MAXIMO : typeof v === 'number' || typeof v === 'boolean') {
      saida[campo] = v as string | number | boolean
    }
  }
  return saida
}

/**
 * O payload como ele é guardado: `{ id, event, dateCreated, payment?, subscription? }`, cada parte
 * só com os campos permitidos. `null` quando a entrada não é um objeto. Vale também para os eventos
 * INTERNOS (o estorno do arrependimento), que já nascem nesta forma.
 */
export function reduzirPayload(bruto: unknown): Record<string, unknown> | null {
  const evento = soPermitidos(bruto, CAMPOS_DO_EVENTO)
  if (!evento || !ehObjeto(bruto)) return null
  const pagamento = soPermitidos(bruto.payment, CAMPOS_DO_PAGAMENTO)
  const assinatura = soPermitidos(bruto.subscription, CAMPOS_DA_ASSINATURA)
  return {
    ...evento,
    ...(pagamento ? { payment: pagamento } : {}),
    ...(assinatura ? { subscription: assinatura } : {}),
  }
}

export const billingEventsRepo = {
  /** @returns `true` se o evento é NOVO (e foi marcado); `false` se já tinha sido processado. */
  async marcarSeNovo(
    id: string, provider: string, event: string, userId: string | null, providerRef: string | null,
    payload: unknown = null,
  ): Promise<boolean> {
    // GAP-017: só os campos permitidos chegam ao banco, venha o payload de onde vier.
    const reduzido = payload == null ? null : reduzirPayload(payload)
    const r = await db
      .insert(billingEvents)
      .values({
        id, createdAt: Date.now(), provider, event, userId, providerRef,
        // Nasce `aplicado` por compatibilidade com as linhas antigas; o resultado real vem logo depois.
        estado: 'aplicado', motivo: null,
        payload: reduzido ? JSON.stringify(reduzido) : null,
      })
      .onConflictDoNothing({ target: billingEvents.id })
    return r.rowsAffected > 0
  },

  /** Grava o que aconteceu com o evento. Chamado sempre, inclusive quando aplicou sem ressalva. */
  async registrarResultado(id: string, estado: EstadoDoEventoDeBilling, motivo: string | null): Promise<void> {
    await db.update(billingEvents).set({ estado, motivo }).where(eq(billingEvents.id, id))
  },

  async ler(id: string) {
    const rows = await db.select().from(billingEvents).where(eq(billingEvents.id, id)).limit(1)
    return rows[0]
  },

  /** Os que deveriam ter tido efeito e não tiveram — a fila de revisão do administrador. */
  async listarPendentes() {
    return db.select({
      id: billingEvents.id, createdAt: billingEvents.createdAt, provider: billingEvents.provider,
      event: billingEvents.event, userId: billingEvents.userId, providerRef: billingEvents.providerRef,
      motivo: billingEvents.motivo,
    }).from(billingEvents).where(eq(billingEvents.estado, 'nao-aplicado')).orderBy(billingEvents.createdAt)
  },

  /**
   * Os estornos de arrependimento deste titular que o Asaas recusou e continuam na fila do admin.
   * A exclusão da conta apaga as linhas do titular (inclusive estas): sem esta consulta, o reembolso
   * manual pendente se perderia junto.
   */
  async estornosPendentesDoUsuario(userId: string) {
    return db.select({ id: billingEvents.id }).from(billingEvents).where(and(
      eq(billingEvents.userId, userId), eq(billingEvents.estado, 'nao-aplicado'),
      eq(billingEvents.event, 'ESTORNO_ARREPENDIMENTO'),
    ))
  },

  /**
   * DESFAZ a marca quando o efeito falhou DEPOIS dela. A marca vem antes do efeito (é o que
   * impede promoção dupla sob entrega concorrente), mas isso cria a janela inversa: marcado e
   * banco caiu no meio → a reentrega do Asaas seria tratada como repetida e a promoção se
   * perderia PARA SEMPRE. Desmarcar + responder 500 devolve o evento à fila de reentrega.
   */
  async desmarcar(id: string): Promise<void> {
    await db.delete(billingEvents).where(eq(billingEvents.id, id))
  },
}
