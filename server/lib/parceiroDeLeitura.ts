/**
 * O PARCEIRO DE LEITURA NO SERVIDOR — QUEM PODE pedir (o plano, `parceiroDia` em `src/core/planos.ts`), o TETO DO DIA e
 * a SUBCOTA DE TOKENS do mês (`parceiroTokensMes`, 20% da `tokensMes`). L4 de Livros & Leitura.
 *
 * O MOLDE É O DO ASSISTENTE AO VIVO (`assistenteAoVivo.ts`): contadores PRÓPRIOS em `usage_counters`, reservados ANTES
 * do provedor na mesma instrução que decide (`usageCountersRepo.reserve`), e devolvidos só quando NENHUM provedor
 * respondeu (a resposta malformada foi cobrada e consome). A resposta que sai do cache compartilhado não passa por aqui:
 * o núcleo pergunta `temParceiro` antes do cache e só reserva depois de errar nele.
 *
 * FALHA FECHADA: contador que não responde lança `ContadorIndisponivel` (o núcleo responde 503); o estorno é
 * best-effort (só loga) — falhar nele erra a favor do dono.
 */
import { definicaoDoPlano, type PlanoEfetivo } from '../../src/core/planos'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import type { UserId } from './authContext'
import { log } from './logger'
import {
  ContadorIndisponivel,
  currentWindow,
  janelaDoDia,
  METRIC_PARCEIRO_DIA,
  METRIC_PARCEIRO_TOKENS_MES,
} from './usageQuota'

export { METRIC_PARCEIRO_DIA, METRIC_PARCEIRO_TOKENS_MES }

/** O plano tem o parceiro? (`0` = não; `null` = sem teto.) Não conta nada. */
export function temParceiro(plano: PlanoEfetivo): boolean {
  const teto = definicaoDoPlano(plano).quotas.parceiroDia
  return teto === null || teto > 0
}

export interface ReservaDoParceiro {
  ok: true
  /** O que sobra hoje (`null` sem teto). */
  restanteHoje: number | null
  janela: string | null
}

export type ResultadoDaReservaDoParceiro = ReservaDoParceiro | { ok: false; motivo: 'sem_plano' | 'teto_do_dia' }

function falhou(err: unknown): never {
  log('error', { event: 'parceiro_contador_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
  throw new ContadorIndisponivel(err)
}

/** RESERVA um pedido do dia ANTES do provedor. `plano` é o EFETIVO (o do teste conta como o plano dele). */
export async function reservarUsoDoParceiro(
  userId: UserId,
  plano: PlanoEfetivo,
): Promise<ResultadoDaReservaDoParceiro> {
  const teto = definicaoDoPlano(plano).quotas.parceiroDia
  if (teto === null) return { ok: true, restanteHoje: null, janela: null }
  if (!(teto > 0)) return { ok: false, motivo: 'sem_plano' }
  try {
    const janela = await janelaDoDia(userId)
    if (!(await usageCountersRepo.reserve(userId, METRIC_PARCEIRO_DIA, janela, teto, 1)))
      return { ok: false, motivo: 'teto_do_dia' }
    const usadas = await usageCountersRepo.get(userId, METRIC_PARCEIRO_DIA, janela)
    return { ok: true, restanteHoje: Math.max(0, teto - usadas), janela }
  } catch (err) {
    falhou(err)
  }
}

/** Quanto sobra hoje, sem reservar (a resposta do cache diz isto). `null` = sem teto. */
export async function restanteDoParceiroHoje(userId: UserId, plano: PlanoEfetivo): Promise<number | null> {
  const teto = definicaoDoPlano(plano).quotas.parceiroDia
  if (teto === null) return null
  try {
    return Math.max(0, teto - (await usageCountersRepo.get(userId, METRIC_PARCEIRO_DIA, await janelaDoDia(userId))))
  } catch (err) {
    falhou(err)
  }
}

/** DEVOLVE a reserva do dia. Só quando NENHUM provedor respondeu. Best-effort: só loga. */
export async function estornarUsoDoParceiro(userId: UserId, reserva: ReservaDoParceiro): Promise<void> {
  if (!reserva.janela) return
  try {
    await usageCountersRepo.refund(userId, METRIC_PARCEIRO_DIA, reserva.janela, 1)
  } catch (err) {
    log('warn', { event: 'parceiro_estorno_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
  }
}

export interface ReservaDeTokensDoParceiro {
  /** `null` = sem teto (self-host): nada foi contado. */
  janela: string | null
  reservados: number
}

/** RESERVA a estimativa de tokens na subcota do mês. `null` = a subcota acabou (ou o plano não tem). */
export async function reservarTokensDoParceiro(
  userId: UserId,
  plano: PlanoEfetivo,
  estimativa: number,
): Promise<ReservaDeTokensDoParceiro | null> {
  const teto = definicaoDoPlano(plano).quotas.parceiroTokensMes
  if (teto === null) return { janela: null, reservados: 0 }
  if (!(teto > 0)) return null
  try {
    const janela = currentWindow()
    if (!(await usageCountersRepo.reserve(userId, METRIC_PARCEIRO_TOKENS_MES, janela, teto, estimativa))) return null
    return { janela, reservados: estimativa }
  } catch (err) {
    falhou(err)
  }
}

/** ACERTA a subcota pelo real (`0` = nenhum provedor respondeu: devolve tudo). Best-effort: só loga. */
export async function acertarTokensDoParceiro(
  userId: UserId,
  reserva: ReservaDeTokensDoParceiro,
  tokensReais: number,
): Promise<void> {
  if (!reserva.janela) return
  const diferenca = Math.max(0, Math.round(tokensReais)) - reserva.reservados
  try {
    if (diferenca < 0) await usageCountersRepo.refund(userId, METRIC_PARCEIRO_TOKENS_MES, reserva.janela, -diferenca)
    else if (diferenca > 0)
      await usageCountersRepo.increment(userId, METRIC_PARCEIRO_TOKENS_MES, reserva.janela, diferenca)
  } catch (err) {
    log('warn', { event: 'parceiro_estorno_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
  }
}
