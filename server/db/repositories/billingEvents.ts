/**
 * EVENTOS DE BILLING — o teste-e-marca da idempotência (E3).
 *
 * A doc do Asaas é explícita: entrega *at-least-once*, "implement idempotency using the event
 * identifier". Aqui a decisão e a marca são a MESMA instrução (INSERT com PK = id do evento,
 * `onConflictDoNothing`): quem perde a corrida não afeta linha nenhuma — a disciplina é a mesma
 * do `usageCounters.reserve`, e pelo mesmo motivo (P0-1: decidir e gravar separado deixa passar
 * duplicata sob concorrência). Evento repetido = 200 sem efeito, NUNCA uma segunda promoção.
 */
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { billingEvents } from '../schema'

export const billingEventsRepo = {
  /** @returns `true` se o evento é NOVO (e foi marcado); `false` se já tinha sido processado. */
  async marcarSeNovo(id: string, provider: string, event: string, userId: string | null, providerRef: string | null): Promise<boolean> {
    const r = await db
      .insert(billingEvents)
      .values({ id, createdAt: Date.now(), provider, event, userId, providerRef })
      .onConflictDoNothing({ target: billingEvents.id })
    return r.rowsAffected > 0
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
