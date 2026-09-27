/**
 * O REEMBOLSO DO CORTE DO CATÁLOGO NO EXPRESS (recompensas v2) — o que `POST
 * /api/metrics/seeds/reembolso` faz, fora da rota.
 *
 * Mora aqui, e não em `routes/metrics.ts`, porque mexe nas DUAS moedas: as Seeds dos itens que
 * saíram voltam pelo razão de Seeds, e os Créditos pagos por item premium que saiu sem equivalente
 * livre na vitrine voltam pelo razão de Créditos. A rota de métricas é a que sorteia o baú, e o
 * baú não pode tocar em Créditos (ECA Digital art. 20; `tests/eca-art20-*`).
 *
 * As duas devoluções são idempotentes pela chave do razão: `reembolso:<reason>` no índice único de
 * `seed_credits` e `reembolso-creditos:<id do gasto>` no de `credit_purchases`.
 */
import { reembolsosDevidos, resolverPremium } from '../../src/core/reembolso'
import { creditsRepo } from '../db/repositories/credits'
import { economiaRepo } from '../db/repositories/economia'
import { seedSpendsRepo } from '../db/repositories/seedSpends'
import type { UserId } from './authContext'

export interface ResultadoDoReembolso {
  /** Seeds creditadas NESTE pedido. */
  creditado: number
  /** Seeds já devolvidas no total (este pedido e os anteriores). */
  reembolsado: number
  /** Créditos devolvidos NESTE pedido. */
  creditosDevolvidos: number
}

export async function reembolsarCorteDoCatalogo(userId: UserId): Promise<ResultadoDoReembolso> {
  const [gastos, ja] = await Promise.all([seedSpendsRepo.gastos(userId), economiaRepo.reembolsos(userId)])
  let creditado = 0
  for (const d of reembolsosDevidos(gastos, new Set(ja.map((r) => r.creditoId)))) {
    const { jaExistia } = await economiaRepo.creditar(userId, { creditoId: d.creditoId, amount: d.seeds, xp: 0, reason: d.creditoId })
    if (!jaExistia) creditado += d.seeds
  }
  let creditosDevolvidos = 0
  for (const r of resolverPremium(await creditsRepo.comprasPremium(userId)).reembolsos) {
    const { jaExistia } = await creditsRepo.registrarConcessao(userId, { concessaoId: r.concessaoId, creditos: r.creditos })
    if (!jaExistia) creditosDevolvidos += r.creditos
  }
  const reembolsado = (await economiaRepo.reembolsos(userId)).reduce((n, r) => n + r.amount, 0)
  return { creditado, reembolsado, creditosDevolvidos }
}
