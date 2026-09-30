/**
 * A PODA DAS JANELAS DIÁRIAS de `usage_counters` (C9, item 9.3 da change `planos-v2`).
 *
 * O uso justo do dia (Premium: 2 h de nuvem por dia) conta em janelas `AAAA-MM-DD`, uma linha por
 * pessoa, por métrica e por DIA — sem poda, a tabela ganha uma linha por pessoa ativa a cada dia, para
 * sempre, e nenhuma delas volta a ser lida depois que o dia passa. A poda diária apaga as janelas
 * diárias com mais de três dias (hoje, ontem e anteontem cobrem qualquer fuso e o estorno que chega
 * atrasado) e NÃO toca as janelas do mês nem as outras métricas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let repo: any
let cota: any

const AGORA = Date.UTC(2026, 9, 10, 12, 0, 0) // 10/10/2026, meio-dia UTC

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ usageCountersRepo: repo } = await h.load('../../server/db/repositories/usageCounters'))
  cota = await h.load('../../server/lib/usageQuota')
})
afterAll(async () => {
  await h.cleanup()
})

describe('podarJanelasDiarias', () => {
  it('apaga as janelas diárias antigas e guarda as recentes, o mês e as outras métricas', async () => {
    const u = asUserId('premium-1')
    const diarias = [cota.METRIC_STT_SEGUNDOS_DIA, cota.METRIC_LLM_TOKENS_DIA, cota.METRIC_TTS_CARACTERES_DIA]
    for (const m of diarias)
      for (const dia of ['2026-09-30', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
        await repo.increment(u, m, dia, 5)
    await repo.increment(u, cota.METRIC_STT_SEGUNDOS, '2026-09', 100)
    await repo.increment(u, cota.METRIC_STT_SEGUNDOS, '2026-10', 100)

    await cota.podarJanelasDiarias(AGORA)

    for (const m of diarias) {
      expect(await repo.get(u, m, '2026-09-30'), m).toBe(0)
      expect(await repo.get(u, m, '2026-10-07'), m).toBe(0)
      // Anteontem, ontem, hoje e amanhã (o fuso +14 já está no dia seguinte) ficam.
      for (const dia of ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
        expect(await repo.get(u, m, dia), `${m} ${dia}`).toBe(5)
    }
    expect(await repo.get(u, cota.METRIC_STT_SEGUNDOS, '2026-09')).toBe(100)
    expect(await repo.get(u, cota.METRIC_STT_SEGUNDOS, '2026-10')).toBe(100)
  })

  it('a poda agendada roda e devolve como desligar', async () => {
    const u = asUserId('premium-2')
    await repo.increment(u, cota.METRIC_STT_SEGUNDOS_DIA, '2000-01-01', 5)
    const desligar = cota.agendarPodaDasJanelasDiarias({ atrasoInicialMs: 0 })
    await new Promise((r) => setTimeout(r, 200))
    desligar()
    expect(await repo.get(u, cota.METRIC_STT_SEGUNDOS_DIA, '2000-01-01')).toBe(0)
  })
})
