import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNull, like, sql, sum } from 'drizzle-orm'
import { db } from '../db'
import { creditPurchases, creditSpends } from '../schema'
import type { SkuDeCredito } from '../../../src/core/creditos'
import type { UserId } from '../../lib/authContext'

/**
 * O RAZÃO DOS CRÉDITOS — a moeda comprada com dinheiro.
 *
 * DUAS REGRAS QUE VALEM MAIS QUE O CÓDIGO AQUI DENTRO:
 *
 * 1. **O saldo é derivado, nunca guardado.** `saldo = compras pagas − gastos`. Um campo
 *    `saldo` mutável parece mais simples até o primeiro reembolso, o primeiro estorno e o
 *    primeiro bug de concorrência — aí ele é a única coisa que não dá para reconstruir. É a
 *    mesma decisão de `seed_spends`, e é o que a spec economia-de-creditos exige.
 *
 * 2. **Crédito só entra confirmado.** Criar a cobrança grava `pendente`; quem promove para
 *    `pago` é o webhook, com o id do pagamento do provedor. Conceder no clique seria dar
 *    crédito para quem abandonou o checkout.
 */
/* O tipo era redeclarado aqui, cópia de `core/creditos.ts`: dois lugares para a mesma lista de
   SKUs é como um SKU novo entra num e não no outro. */
export type { SkuDeCredito }

export interface NovaCompra {
  sku: SkuDeCredito
  creditos: number
  valorCentavos: number
  providerPaymentId: string
}

export const creditsRepo = {
  /** Registra a INTENÇÃO de compra. Não concede nada — quem concede é `confirmarPagamento`. */
  async registrarCompra(userId: UserId, input: NovaCompra) {
    const agora = Date.now()
    const linha = {
      id: randomUUID(),
      createdAt: agora,
      updatedAt: agora,
      userId,
      deletedAt: null,
      sku: input.sku,
      creditos: input.creditos,
      valorCentavos: input.valorCentavos,
      provider: 'asaas',
      providerPaymentId: input.providerPaymentId,
      status: 'pendente',
      paidAt: null,
    }
    await db.insert(creditPurchases).values(linha)
    return linha
  },

  /**
   * O webhook confirmou o pagamento: a compra passa a valer.
   *
   * Idempotente por construção — o UPDATE filtra `status = 'pendente'`, então a reentrega do
   * mesmo evento (que o Asaas faz sempre que não recebe 200) não credita duas vezes. Devolve
   * `null` quando não havia compra pendente com aquele id: é o caso de um pagamento que não é
   * nosso, e o chamador precisa saber disso para não tratar como sucesso silencioso.
   */
  async confirmarPagamento(providerPaymentId: string) {
    const agora = Date.now()
    await db.update(creditPurchases)
      .set({ status: 'pago', paidAt: agora, updatedAt: agora })
      .where(and(
        eq(creditPurchases.providerPaymentId, providerPaymentId),
        eq(creditPurchases.status, 'pendente'),
        isNull(creditPurchases.deletedAt),
      ))
    const rows = await db.select().from(creditPurchases)
      .where(and(eq(creditPurchases.providerPaymentId, providerPaymentId), isNull(creditPurchases.deletedAt)))
      .limit(1)
    return rows[0] ?? null
  },

  /** Estorno: a compra deixa de conceder. Evento inverso, nunca DELETE. */
  async cancelarCompra(providerPaymentId: string) {
    const agora = Date.now()
    await db.update(creditPurchases)
      .set({ status: 'cancelado', updatedAt: agora })
      .where(and(eq(creditPurchases.providerPaymentId, providerPaymentId), isNull(creditPurchases.deletedAt)))
  },

  /** Só compras PAGAS entram no saldo — pendente e cancelada valem zero. */
  async totalComprado(userId: UserId): Promise<number> {
    const r = await db.select({ total: sum(creditPurchases.creditos) }).from(creditPurchases)
      .where(and(eq(creditPurchases.userId, userId), eq(creditPurchases.status, 'pago'), isNull(creditPurchases.deletedAt)))
    return Number(r[0]?.total ?? 0)
  },

  async totalGasto(userId: UserId): Promise<number> {
    const r = await db.select({ total: sum(creditSpends.amount) }).from(creditSpends)
      .where(and(eq(creditSpends.userId, userId), isNull(creditSpends.deletedAt)))
    return Number(r[0]?.total ?? 0)
  },

  /** O número que a tela mostra. Piso em zero pelo mesmo motivo do saldo de Seeds. */
  async saldo(userId: UserId): Promise<number> {
    const [comprado, gasto] = await Promise.all([this.totalComprado(userId), this.totalGasto(userId)])
    return Math.max(0, comprado - gasto)
  },

  /** Gasto idempotente por (usuário, spendId) — o gêmeo exato de `seedSpendsRepo.debitar`. */
  async debitar(userId: UserId, input: { spendId: string; amount: number; reason: string; ref?: string | null }) {
    const agora = Date.now()
    const row = {
      id: randomUUID(), createdAt: agora, updatedAt: agora, userId, deletedAt: null,
      spendId: input.spendId, amount: input.amount, reason: input.reason, ref: input.ref ?? null,
    }
    const r = await db.run(sql`
      INSERT INTO ${creditSpends} (id, created_at, updated_at, user_id, spend_id, amount, reason, ref)
      VALUES (${row.id}, ${row.createdAt}, ${row.updatedAt}, ${row.userId}, ${row.spendId}, ${row.amount}, ${row.reason}, ${row.ref})
      ON CONFLICT (user_id, spend_id) WHERE deleted_at IS NULL DO NOTHING
    `)
    const jaExistia = Number((r as { rowsAffected?: number }).rowsAffected ?? 0) === 0
    const rows = await db.select().from(creditSpends)
      .where(and(eq(creditSpends.spendId, input.spendId), eq(creditSpends.userId, userId), isNull(creditSpends.deletedAt)))
      .limit(1)
    if (!rows[0]) throw new Error('falha ao gravar gasto de créditos')
    return { linha: rows[0], jaExistia }
  },

  /**
   * CRÉDITO CONCEDIDO SEM PAGAMENTO NOVO — as casas da trilha do Passe.
   *
   * Reusa `credit_purchases` em vez de tabela nova, e o motivo é o mesmo da posse derivada do
   * razão: o saldo já é `compras pagas − gastos`, então uma concessão é uma compra que nasce
   * `pago` com valor zero. O `providerPaymentId` carrega o id da concessão
   * (`passe:t1:premium-7`), e o índice único dele é o que garante uma vez só — a mesma chave de
   * idempotência que protege o webhook.
   *
   * Se isto virasse tabela própria, o saldo passaria a somar de dois lugares, e saldo com duas
   * fontes é como as duas deixam de bater.
   */
  async registrarConcessao(userId: UserId, input: { concessaoId: string; creditos: number }) {
    const agora = Date.now()
    const r = await db.run(sql`
      INSERT INTO ${creditPurchases}
        (id, created_at, updated_at, user_id, sku, creditos, valor_centavos, provider, provider_payment_id, status, paid_at)
      VALUES
        (${randomUUID()}, ${agora}, ${agora}, ${userId}, 'concessao', ${input.creditos}, 0, 'interno', ${input.concessaoId}, 'pago', ${agora})
      ON CONFLICT (provider_payment_id) WHERE deleted_at IS NULL DO NOTHING
    `)
    return { jaExistia: Number((r as { rowsAffected?: number }).rowsAffected ?? 0) === 0 }
  },

  /** Este gasto já foi cobrado? Mesma razão do gêmeo de Seeds: o reenvio não pode pedir saldo. */
  async jaGastou(userId: UserId, spendId: string): Promise<boolean> {
    const r = await db.select({ id: creditSpends.id }).from(creditSpends)
      .where(and(eq(creditSpends.spendId, spendId), eq(creditSpends.userId, userId), isNull(creditSpends.deletedAt)))
      .limit(1)
    return r.length > 0
  },

  /**
   * OS ITENS PREMIUM COMPRADOS, derivados do log — como a posse da Loja já é.
   *
   * Nada comprado com dinheiro pode viver em `localStorage` (spec economia-de-creditos): a posse
   * do que se paga nasce e morre no servidor, e o cliente só espelha.
   */
  async itensPremium(userId: UserId): Promise<string[]> {
    const linhas = await db.select({ reason: creditSpends.reason }).from(creditSpends)
      .where(and(eq(creditSpends.userId, userId), isNull(creditSpends.deletedAt), like(creditSpends.reason, 'premium:%')))
    return [...new Set(linhas.map((l) => l.reason.slice('premium:'.length)).filter(Boolean))]
  },

  async comprasDoUsuario(userId: UserId, limite = 20) {
    return db.select().from(creditPurchases)
      .where(and(eq(creditPurchases.userId, userId), isNull(creditPurchases.deletedAt)))
      .orderBy(desc(creditPurchases.createdAt))
      .limit(limite)
  },
}
