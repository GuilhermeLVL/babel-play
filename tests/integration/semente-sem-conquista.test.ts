/**
 * "PRIMEIRA PALAVRA" SÓ DEPOIS DA PRIMEIRA PALAVRA DE VERDADE (achado 7 do funil, 29/09).
 *
 * Num banco recém-criado (self-host, sem login), o app mostrava a conquista "Primeira palavra"
 * (+10 Seeds, +15 XP) logo depois do onboarding, sem a pessoa ter fichado nada. A causa: a semente
 * de demonstração (`server/db/seed.ts`) punha três cartões no caderno do dono local, e a condição
 * da conquista (`deckSize >= 1`, conferida no servidor) já nascia cumprida.
 *
 * Aqui: depois da semente o caderno está vazio e a condição não se cumpre; a primeira palavra
 * salva de verdade cumpre.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { contextoConferivelDeConquistas, progressoNoServidor } from '../../src/core/economiaAutoridade'
import { CONQUISTAS } from '../../src/core/learning/conquistas'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
beforeAll(async () => {
  h = await setupEphemeralDb()
})
afterAll(async () => {
  await h.cleanup()
})

const PRIMEIRA_PALAVRA = CONQUISTAS.find((c) => c.id === 'primeira-palavra')!

describe('semente de demonstração × "Primeira palavra"', () => {
  it('banco novo semeado: caderno vazio e a conquista não está cumprida; a primeira palavra real cumpre', async () => {
    const { seedIfEmpty } = await h.load<typeof import('../../server/db/seed')>('../../server/db/seed')
    const { LOCAL_OWNER } = await h.load<typeof import('../../server/lib/authContext')>('../../server/lib/authContext')
    const { computeProfile } = await h.load<typeof import('../../server/db/repositories/metrics')>(
      '../../server/db/repositories/metrics',
    )
    const { vocabRepo } = await h.load<typeof import('../../server/db/repositories/vocab')>(
      '../../server/db/repositories/vocab',
    )
    const { sessionsRepo } = await h.load<typeof import('../../server/db/repositories/sessions')>(
      '../../server/db/repositories/sessions',
    )

    await seedIfEmpty()
    const sessoes = await sessionsRepo.list(LOCAL_OWNER)
    expect(sessoes.length, 'a sessão de demonstração continua (o app não abre vazio)').toBe(1)

    const ctx = async () =>
      contextoConferivelDeConquistas({
        metricas: await computeProfile(LOCAL_OWNER),
        nivel: 1,
        melhorComboPorJogo: {},
        linhasDeMaestria: [],
      })

    const antes = await ctx()
    expect(antes.metricas.deckSize).toBe(0)
    const p = progressoNoServidor(PRIMEIRA_PALAVRA, antes)
    expect(p.atual >= p.meta, 'conquista cumprida sem palavra salva').toBe(false)

    await vocabRepo.bulkAdd(LOCAL_OWNER, [
      { word: 'retention', back: 'retenção', sentence: 'improve retention', srcLang: 'en', tgtLang: 'pt', sessionId: sessoes[0].id },
    ])
    const depois = progressoNoServidor(PRIMEIRA_PALAVRA, await ctx())
    expect(depois.atual >= depois.meta).toBe(true)
  })
})
