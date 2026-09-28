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
import { reembolsosDevidos, reembolsosDoPasse, resolverPremium } from '../../src/core/reembolso'
import { creditsRepo } from '../db/repositories/credits'
import { economiaRepo } from '../db/repositories/economia'
import { estadoDaContaRepo } from '../db/repositories/estadoDaConta'
import { seedSpendsRepo } from '../db/repositories/seedSpends'
import type { UserId } from './authContext'

export interface ResultadoDoReembolso {
  /** Seeds creditadas NESTE pedido. */
  creditado: number
  /** Seeds já devolvidas no total (este pedido e os anteriores). */
  reembolsado: number
  /** Créditos devolvidos NESTE pedido. */
  creditosDevolvidos: number
  /**
   * O aviso do corte ("Suas Seeds voltaram: +N") ainda não foi dado NESTA CONTA e este pedido
   * creditou Seeds — a tela anuncia `creditado`. `true` uma vez só por conta: a marca é gravada no
   * mesmo pedido que responde `true` (`estado_da_conta.aviso_reembolso_em`, conferida dentro do
   * UPDATE), então duas abas ou dois aparelhos não avisam duas vezes.
   */
  avisoPendente: boolean
}

export async function reembolsarCorteDoCatalogo(userId: UserId): Promise<ResultadoDoReembolso> {
  const [gastos, ja] = await Promise.all([seedSpendsRepo.gastos(userId), economiaRepo.reembolsos(userId)])
  let creditado = 0
  for (const d of reembolsosDevidos(gastos, new Set(ja.map((r) => r.creditoId)))) {
    const { jaExistia } = await economiaRepo.creditar(userId, { creditoId: d.creditoId, amount: d.seeds, xp: 0, reason: d.creditoId })
    if (!jaExistia) creditado += d.seeds
  }
  let creditosDevolvidos = 0
  const passe = await creditsRepo.passeComprado(userId)
  const devolucoes = [
    ...resolverPremium(await creditsRepo.comprasPremium(userId)).reembolsos,
    /* O Passe da T1 que saiu: o que faltava da promessa, se alguém o tiver comprado. */
    ...reembolsosDoPasse(passe.compras, passe.concedido),
  ]
  for (const r of devolucoes) {
    const { jaExistia } = await creditsRepo.registrarConcessao(userId, { concessaoId: r.concessaoId, creditos: r.creditos })
    if (!jaExistia) creditosDevolvidos += r.creditos
  }
  const reembolsado = (await economiaRepo.reembolsos(userId)).reduce((n, r) => n + r.amount, 0)
  const avisoPendente = creditado > 0 && (await estadoDaContaRepo.marcarAvisoDeReembolso(userId, Date.now()))
  return { creditado, reembolsado, creditosDevolvidos, avisoPendente }
}
