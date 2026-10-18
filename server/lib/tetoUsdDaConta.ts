/**
 * O TETO EM DÓLAR POR CONTA NOS PLANOS PAGOS — a trava de gasto que o convidado e o alívio já têm
 * (`FRANQUIA_DE_ALIVIO.tetoUsdMes`), agora para quem paga.
 *
 * POR QUE EXISTE. As cotas de horas, tokens e chamadas limitam o uso, não o dinheiro: um modelo mais
 * caro na cascata, um preço que sobe ou um mínimo faturado maior fazem a mesma hora custar mais. O
 * teto em US$ é o último degrau, em unidade de dinheiro, por conta e por mês.
 *
 * DESLIGADO POR PADRÃO. O dono ainda não escolheu o número (`docs/estrategia-comercial-e-custos-br.md`
 * traz o custo máximo por plano, não um teto nem uma margem de segurança). Enquanto a variável do plano
 * não existir, nada é contado, nada é recusado e não há escrita nova no banco. Para ligar:
 *
 *   TETO_USD_MES_ESSENCIAL=...   TETO_USD_MES_PREMIUM=...   TETO_USD_MES_AOVIVO=...
 *
 * (em US$ por conta e por mês; o custo máximo conservador de cada plano está em
 * `docs/estrategia-comercial-e-custos-br.md` §2 e o dono escolhe a folga em cima dele). Ligar no meio
 * do mês começa a contar daquele momento.
 *
 * Ao atingir o teto: 402 `teto_usd_da_conta` e a legenda segue no aparelho. O log leva só o plano e os
 * valores (campos da allowlist), nunca quem é a conta.
 */
import { PLANOS_DE_ASSINATURA } from '../../src/core/planos'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import type { UserId } from './authContext'
import { log } from './logger'

/** O gasto ESTIMADO da conta no mês, em MICRODÓLARES inteiros — só conta quando o plano tem teto. */
export const METRIC_CONTA_GASTO_MICRO_USD = 'conta_gasto_micro_usd'
export const CODIGO_TETO_USD_DA_CONTA = 'teto_usd_da_conta'

const janelaDoMes = (): string => new Date().toISOString().slice(0, 7)
const micro = (usd: number): number => Math.max(0, Math.round(usd * 1_000_000))

/** `TETO_USD_MES_<PLANO>` em US$; ausente, vazio, ≤ 0 ou inválido = `Infinity` (sem teto: desligado). */
export function tetoUsdMesDaConta(plano: string | undefined, env: NodeJS.ProcessEnv = process.env): number {
  if (!plano || !(PLANOS_DE_ASSINATURA as readonly string[]).includes(plano)) return Infinity
  const n = Number(env[`TETO_USD_MES_${plano.toUpperCase()}`])
  return Number.isFinite(n) && n > 0 ? n : Infinity
}

/** Soma o custo de uma chamada ENTREGUE no gasto do mês da conta. Best-effort; sem teto no plano, não faz nada. */
export async function registrarGastoDaConta(
  userId: string | undefined,
  plano: string | undefined,
  usd: number,
): Promise<void> {
  if (!userId || !(usd > 0) || !Number.isFinite(tetoUsdMesDaConta(plano))) return
  try {
    await usageCountersRepo.increment(userId as UserId, METRIC_CONTA_GASTO_MICRO_USD, janelaDoMes(), micro(usd))
  } catch (err) {
    log('error', { event: 'conta_gasto_registro_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
  }
}

export type VeredictoDoTetoDaConta = { ok: true } | { ok: false; gastoUsd: number; tetoUsd: number }

/**
 * A conta já gastou o teto do plano neste mês? Sem teto configurado, `{ ok: true }` sem tocar o banco.
 * A leitura que falha LANÇA (quem chama trata como contador indisponível: falha fechada, como as cotas).
 */
export async function conferirTetoUsdDaConta(
  userId: UserId,
  plano: string | undefined,
): Promise<VeredictoDoTetoDaConta> {
  const tetoUsd = tetoUsdMesDaConta(plano)
  if (!Number.isFinite(tetoUsd)) return { ok: true }
  const gasto = await usageCountersRepo.get(userId, METRIC_CONTA_GASTO_MICRO_USD, janelaDoMes())
  if (gasto < micro(tetoUsd)) return { ok: true }
  const gastoUsd = gasto / 1_000_000
  log('warn', { event: 'conta_teto_usd_atingido', plano, gastoUsd, tetoUsd, status: 402 })
  return { ok: false, gastoUsd, tetoUsd }
}
