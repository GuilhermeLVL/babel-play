/**
 * O ASSISTENTE AO VIVO NO SERVIDOR — QUEM PODE pedir uma ajuda de nuvem (expressões, termo, "Como respondo?", correção
 * da fala) e o TETO DO DIA (`assistenteDia` em `src/core/planos.ts`; spec `docs/specs/2026-10-25-assistente-ao-vivo.md`).
 *
 * O MOLDE É O DA IA DE ESTUDO (`iaDeEstudo.ts`): contador PRÓPRIO em `usage_counters` (`METRIC_ASSISTENTE_DIA`, janela
 * do dia LOCAL), reservado ANTES do provedor na mesma instrução que decide (`usageCountersRepo.reserve`), e devolvido
 * só quando NENHUM provedor respondeu. A resposta malformada foi cobrada e CONSOME o uso: senão um texto que manda o
 * modelo quebrar o JSON daria chamadas sem fim. Os tokens de cada chamada saem da `tokensMes` do plano, pela reserva de
 * LLM do núcleo — o teto do dia é o uso justo, não o custo.
 *
 * QUEM NÃO TEM: plano com `assistenteDia: 0` (o Grátis e o convidado) recebe `sem_plano` — o assistente de nuvem é só
 * dos pagos (decisão do dono, 25/10/2026). O self-host (`null`) não conta nada.
 *
 * FALHA FECHADA: contador que não responde lança `ContadorIndisponivel` (o núcleo responde 503); o estorno é
 * best-effort (só loga) — falhar nele erra a favor do dono.
 */
import { definicaoDoPlano, type PlanoEfetivo } from '../../src/core/planos'
import { usageCountersRepo } from '../db/repositories/usageCounters'
import type { UserId } from './authContext'
import { log } from './logger'
import { ContadorIndisponivel, janelaDoDia, METRIC_ASSISTENTE_DIA } from './usageQuota'

export { METRIC_ASSISTENTE_DIA }

/** Por que não: o plano não tem o assistente, ou o teto de hoje acabou. */
export type MotivoSemAssistente = 'sem_plano' | 'teto_do_dia'

/** A reserva feita: o que sobra hoje (`null` sem teto) e ONDE foi contada (para o estorno voltar à mesma janela). */
export interface ReservaDoAssistente {
  ok: true
  restanteHoje: number | null
  janela: string | null
}

export type ResultadoDaReservaDoAssistente = ReservaDoAssistente | { ok: false; motivo: MotivoSemAssistente }

/** RESERVA uma chamada do assistente ANTES do provedor. `plano` é o EFETIVO (o do teste conta como o plano dele). */
export async function reservarUsoDoAssistente(
  userId: UserId,
  plano: PlanoEfetivo,
): Promise<ResultadoDaReservaDoAssistente> {
  const teto = definicaoDoPlano(plano).quotas.assistenteDia
  if (teto === null) return { ok: true, restanteHoje: null, janela: null }
  if (!(teto > 0)) return { ok: false, motivo: 'sem_plano' }
  try {
    const janela = await janelaDoDia(userId)
    if (!(await usageCountersRepo.reserve(userId, METRIC_ASSISTENTE_DIA, janela, teto, 1)))
      return { ok: false, motivo: 'teto_do_dia' }
    /* Só exibição (a decisão já foi a do `reserve`). */
    const usadas = await usageCountersRepo.get(userId, METRIC_ASSISTENTE_DIA, janela)
    return { ok: true, restanteHoje: Math.max(0, teto - usadas), janela }
  } catch (err) {
    log('error', { event: 'assistente_contador_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
    throw new ContadorIndisponivel(err)
  }
}

/** DEVOLVE a reserva. Só quando NENHUM provedor respondeu. Best-effort: só loga. */
export async function estornarUsoDoAssistente(userId: UserId, reserva: ReservaDoAssistente): Promise<void> {
  if (!reserva.janela) return
  try {
    await usageCountersRepo.refund(userId, METRIC_ASSISTENTE_DIA, reserva.janela, 1)
  } catch (err) {
    log('warn', { event: 'assistente_estorno_falhou', error: String((err as Error)?.message ?? err).slice(0, 120) })
  }
}
