/**
 * O CONTADOR POR NÍVEL DE SERVIÇO (change `planos-v3-e-rota-inteligente`, etapa 3).
 *
 * A nuvem ao vivo tem horas próprias, SOMADAS às da nuvem por trechos: a métrica `stt_live_seconds`
 * fica ao lado de `stt_seconds` na mesma tabela `usage_counters` (o nome da métrica é texto; nenhum
 * esquema muda). A reserva e o estorno dizem o NÍVEL, e um nunca mexe no contador do outro.
 *
 * Nenhum plano tem horas ao vivo nesta etapa, então o teto vem da env (`PREMIUM_MONTHLY_STT_LIVE_SECONDS`)
 * — o mesmo override que o operador usa.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { asUserId, type UserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

type Quota = typeof import('../../server/lib/usageQuota')

let h: EphemeralDb
let quota: Quota
let subs: { upsert: (u: UserId, d: Record<string, unknown>) => Promise<unknown> }
let repo: {
  get: (u: UserId, metrica: string, janela: string) => Promise<number>
  reserve: (...a: unknown[]) => Promise<boolean>
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  quota = (await h.load('../../server/lib/usageQuota')) as Quota
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as {
    subscriptionsRepo: typeof subs
  })
  ;({ usageCountersRepo: repo } = (await h.load('../../server/db/repositories/usageCounters')) as {
    usageCountersRepo: typeof repo
  })
})
afterAll(async () => {
  await h.cleanup()
})
beforeEach(() => {
  process.env.AUTH_REQUIRED = '1'
  process.env.PREMIUM_MONTHLY_STT_LIVE_SECONDS = '60'
})
afterEach(() => {
  delete process.env.AUTH_REQUIRED
  delete process.env.PREMIUM_MONTHLY_STT_LIVE_SECONDS
})

async function assinante(id: string): Promise<UserId> {
  const u = asUserId(id)
  await subs.upsert(u, { plan: 'premium', status: 'active' })
  return u
}

const usados = async (u: UserId) => ({
  trechos: await repo.get(u, quota.METRIC_STT_SEGUNDOS, quota.currentWindow()),
  aovivo: await repo.get(u, quota.METRIC_STT_AO_VIVO_SEGUNDOS, quota.currentWindow()),
})

describe('a métrica', () => {
  it('é `stt_live_seconds`, ao lado de `stt_seconds`', () => {
    expect(quota.METRIC_STT_AO_VIVO_SEGUNDOS).toBe('stt_live_seconds')
    expect(quota.METRIC_STT_SEGUNDOS).toBe('stt_seconds')
  })

  it('o teto ao vivo sai da matriz e a env sobrepõe', () => {
    delete process.env.PREMIUM_MONTHLY_STT_LIVE_SECONDS
    expect(quota.capSegundosAoVivoParaPlano('free')).toBe(0)
    expect(quota.capSegundosAoVivoParaPlano('selfhost')).toBe(Infinity)
    process.env.PREMIUM_MONTHLY_STT_LIVE_SECONDS = '90'
    expect(quota.capSegundosAoVivoParaPlano('premium')).toBe(90)
  })
})

describe('reserva e estorno com o nível', () => {
  it('30 s ao vivo reservados e o provedor falha: os 30 s voltam ao contador ao vivo, e o de trechos não muda', async () => {
    const u = await assinante('nv-estorno')
    expect(await quota.reservarSegundosDeStt(u, 12, 'plano')).toMatchObject({ cabe: true })
    const antes = await usados(u)
    expect(antes).toEqual({ trechos: 12, aovivo: 0 })

    const r = await quota.reservarSegundosDeStt(u, 30, 'plano', 'aovivo')
    expect(r).toEqual({ cabe: true, dia: null })
    expect(await usados(u)).toEqual({ trechos: 12, aovivo: 30 })

    await quota.estornarSegundosDeStt(u, 30, 'plano', null, 'aovivo')
    expect(await usados(u)).toEqual({ trechos: 12, aovivo: 0 })
  })

  it('a reserva por trechos é a de sempre: não toca o contador ao vivo', async () => {
    const u = await assinante('nv-trechos')
    const r = await quota.reservarSegundosDeStt(u, 20)
    expect(r.cabe).toBe(true)
    expect(await usados(u)).toEqual({ trechos: 20, aovivo: 0 })
    await quota.estornarSegundosDeStt(u, 20, 'plano', r.cabe ? r.dia : null)
    expect(await usados(u)).toEqual({ trechos: 0, aovivo: 0 })
  })

  it('o ao vivo não gasta o uso justo do dia, que é da nuvem por trechos', async () => {
    const u = await assinante('nv-dia')
    await quota.reservarSegundosDeStt(u, 30, 'plano', 'aovivo')
    expect(await repo.get(u, quota.METRIC_STT_SEGUNDOS_DIA, await quota.janelaDoDia(u))).toBe(0)
  })

  it('as horas se somam: acabar o ao vivo não fecha os trechos, e vice-versa', async () => {
    const u = await assinante('nv-soma')
    expect((await quota.reservarSegundosDeStt(u, 60, 'plano', 'aovivo')).cabe).toBe(true)
    expect(await quota.reservarSegundosDeStt(u, 1, 'plano', 'aovivo')).toEqual({ cabe: false, recusa: 'mes' })
    expect((await quota.reservarSegundosDeStt(u, 30, 'plano', 'trechos')).cabe).toBe(true)
  })

  it('10 blocos de 30 s SIMULTÂNEOS contra 60 s de teto: exatamente 2 passam', async () => {
    const u = await assinante('nv-corrida')
    const r = await Promise.all(Array.from({ length: 10 }, () => quota.reservarSegundosDeStt(u, 30, 'plano', 'aovivo')))
    expect(r.filter((x) => x.cabe)).toHaveLength(2)
    expect(await usados(u)).toEqual({ trechos: 0, aovivo: 60 })
  })

  it('plano sem horas ao vivo recusa pelo mês, sem contar nada', async () => {
    delete process.env.PREMIUM_MONTHLY_STT_LIVE_SECONDS
    const u = await assinante('nv-sem-ao-vivo')
    expect(await quota.reservarSegundosDeStt(u, 30, 'plano', 'aovivo')).toEqual({ cabe: false, recusa: 'mes' })
    expect(await usados(u)).toEqual({ trechos: 0, aovivo: 0 })
  })

  it('a nuvem de alívio do Grátis não tem ao vivo', async () => {
    const u = asUserId('nv-alivio')
    expect(await quota.reservarSegundosDeStt(u, 30, 'alivio', 'aovivo')).toEqual({ cabe: false, recusa: 'mes' })
    expect(await repo.get(u, quota.METRIC_ALIVIO_STT_SEGUNDOS, quota.currentWindow())).toBe(0)
  })

  it('falha FECHADA também no ao vivo: contador fora do ar lança, não libera', async () => {
    const u = await assinante('nv-fechada')
    const boom = vi.spyOn(repo, 'reserve').mockRejectedValue(new Error('banco indisponível'))
    try {
      await expect(quota.reservarSegundosDeStt(u, 30, 'plano', 'aovivo')).rejects.toBeInstanceOf(
        quota.ContadorIndisponivel,
      )
    } finally {
      boom.mockRestore()
    }
  })
})
