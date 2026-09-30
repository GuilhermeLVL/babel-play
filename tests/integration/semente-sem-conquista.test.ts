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
 *
 * "PRIMEIRA CAPTURA" (pendência de 30/09): a mesma semente deixava a SESSÃO de demonstração — e a
 * conquista (`sessions >= 1`, +25 Seeds, +30 XP) também nascia cumprida. A sessão fica (o app não
 * abre vazio), mas marcada como demonstração, e na conta ela não conta como captura da pessoa.
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
      {
        word: 'retention',
        back: 'retenção',
        sentence: 'improve retention',
        srcLang: 'en',
        tgtLang: 'pt',
        sessionId: sessoes[0].id,
      },
    ])
    const depois = progressoNoServidor(PRIMEIRA_PALAVRA, await ctx())
    expect(depois.atual >= depois.meta).toBe(true)
  })
})

const PRIMEIRA_CAPTURA = CONQUISTAS.find((c) => c.id === 'primeira-captura')!
const POLIGLOTA = CONQUISTAS.find((c) => c.id === 'poliglota')!

describe('semente de demonstração × "Primeira captura"', () => {
  async function carregar() {
    const { seedIfEmpty } = await h.load<typeof import('../../server/db/seed')>('../../server/db/seed')
    const { LOCAL_OWNER } = await h.load<typeof import('../../server/lib/authContext')>('../../server/lib/authContext')
    const { computeProfile } = await h.load<typeof import('../../server/db/repositories/metrics')>(
      '../../server/db/repositories/metrics',
    )
    const { sessionsRepo } = await h.load<typeof import('../../server/db/repositories/sessions')>(
      '../../server/db/repositories/sessions',
    )
    const { db } = await h.load<typeof import('../../server/db/db')>('../../server/db/db')
    const { sql } = await import('drizzle-orm')
    const ctx = async () =>
      contextoConferivelDeConquistas({
        metricas: await computeProfile(LOCAL_OWNER),
        nivel: 1,
        melhorComboPorJogo: {},
        linhasDeMaestria: [],
      })
    const cumprida = (c: typeof PRIMEIRA_CAPTURA, x: Awaited<ReturnType<typeof ctx>>) => {
      const p = progressoNoServidor(c, x)
      return p.atual >= p.meta
    }
    return { seedIfEmpty, LOCAL_OWNER, computeProfile, sessionsRepo, db, sql, ctx, cumprida }
  }

  it('banco novo semeado: a demonstração não é captura da pessoa; a primeira captura de verdade é', async () => {
    const { seedIfEmpty, LOCAL_OWNER, sessionsRepo, ctx, cumprida } = await carregar()
    await seedIfEmpty()
    expect((await sessionsRepo.list(LOCAL_OWNER)).length, 'a demonstração continua na biblioteca').toBe(1)

    const antes = await ctx()
    expect(antes.metricas.sessions).toBe(0)
    expect(cumprida(PRIMEIRA_CAPTURA, antes), 'conquista cumprida sem captura nenhuma').toBe(false)

    // A primeira captura da pessoa — e num idioma que não é o da demonstração (inglês).
    await sessionsRepo.createWithUtterances(
      LOCAL_OWNER,
      { title: 'Aula de espanhol', kind: 'audio', sourceLang: 'es', targetLang: 'pt', status: 'done' },
      [{ idx: 0, source: 'mic', sourceLang: 'es', sourceText: 'Hola, ¿qué tal?', targetLang: 'pt' }],
    )
    const depois = await ctx()
    expect(depois.metricas.sessions).toBe(1)
    expect(cumprida(PRIMEIRA_CAPTURA, depois), 'quem capturou de verdade ganha a conquista').toBe(true)
    // O inglês da demonstração também não vira "segundo idioma" para a Poliglota.
    expect(progressoNoServidor(POLIGLOTA, depois).atual).toBe(1)
  })

  it('dentro da própria demonstração (métricas da sessão), os números continuam os dela', async () => {
    const { LOCAL_OWNER, computeProfile, sessionsRepo } = await carregar()
    const demo = (await sessionsRepo.list(LOCAL_OWNER)).find((s) => s.title?.endsWith('— demo'))!
    const daSessao = await computeProfile(LOCAL_OWNER, { sessionId: demo.id })
    expect(daSessao.sessions).toBe(1)
    expect(daSessao.wordsCaptured).toBeGreaterThan(0)
  })

  it('banco semeado ANTES da correção: a demonstração antiga é reconhecida na próxima subida', async () => {
    const { seedIfEmpty, LOCAL_OWNER, sessionsRepo, db, sql, ctx } = await carregar()
    // A semente antiga não marcava nada: é o estado de quem já tinha o banco criado.
    await db.run(sql`UPDATE sessions SET origem_local_id = NULL WHERE title = 'Reunião de Alinhamento (Q3) — demo'`)
    const todas = (await sessionsRepo.list(LOCAL_OWNER)).length
    expect((await ctx()).metricas.sessions, 'sem a marca, a demonstração contava').toBe(todas)

    await seedIfEmpty()
    expect((await ctx()).metricas.sessions).toBe(todas - 1)
    expect((await sessionsRepo.list(LOCAL_OWNER)).length, 'reconhecer não é apagar').toBe(todas)
  })
})
