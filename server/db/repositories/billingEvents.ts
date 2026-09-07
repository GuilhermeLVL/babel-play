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
 * O `payload` bruto fica guardado para que um evento `nao-aplicado` possa ser reprocessado por
 * um administrador com a lógica atual — antes, um pagamento que caía num `break` não tinha volta.
 */
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { billingEvents } from '../schema'

export type EstadoDoEventoDeBilling = 'aplicado' | 'nao-aplicado' | 'ignorado'

export const billingEventsRepo = {
  /** @returns `true` se o evento é NOVO (e foi marcado); `false` se já tinha sido processado. */
  async marcarSeNovo(
    id: string, provider: string, event: string, userId: string | null, providerRef: string | null,
    payload: unknown = null,
  ): Promise<boolean> {
    const r = await db
      .insert(billingEvents)
      .values({
        id, createdAt: Date.now(), provider, event, userId, providerRef,
        // Nasce `aplicado` por compatibilidade com as linhas antigas; o resultado real vem logo depois.
        estado: 'aplicado', motivo: null,
        payload: payload == null ? null : JSON.stringify(payload),
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
   * DESFAZ a marca quando o efeito falhou DEPOIS dela. A marca vem antes do efeito (é o que
   * impede promoção dupla sob entrega concorrente), mas isso cria a janela inversa: marcado e
   * banco caiu no meio → a reentrega do Asaas seria tratada como repetida e a promoção se
   * perderia PARA SEMPRE. Desmarcar + responder 500 devolve o evento à fila de reentrega.
   */
  async desmarcar(id: string): Promise<void> {
    await db.delete(billingEvents).where(eq(billingEvents.id, id))
  },
}
