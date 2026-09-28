/**
 * MISSÕES DO DIA NO EXPRESS (recompensas v2, onda 5 — Task 5.2).
 *
 * 1. `GET /api/metrics/missoes` devolve as três missões do dia LOCAL, contadas das linhas gravadas.
 * 2. `meta:<dia>` só credita com as três fechadas — os 20 acertos provisórios não bastam mais — e
 *    uma vez só.
 * 3. Virada de meia-noite: a rodada começada às 23:59 e gravada às 00:01 conta no dia em que
 *    COMEÇOU, e só nele (`created_at` = início, `inicioDaRodada`).
 * 4. Congelamento: a meta creditada rende 1 por semana; o dia perdido o gasta e a ofensiva do
 *    perfil não quebra.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { diaNoFuso, META_DIARIA_ACERTOS } from '../../src/core/learning/economia'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let metricsRouter: any
let computeProfile: any
let exerciseResultsRepo: any
let sessionsRepo: any
let vocabRepo: any
let economiaRepo: any

const FUSO = 'America/Sao_Paulo'

function handler(caminho: string, metodo: 'get' | 'post'): (req: any, res: any) => Promise<void> {
  const camada = metricsRouter.stack.find((l: any) => l.route?.path === caminho && l.route?.methods?.[metodo])
  return camada.route.stack[0].handle
}
function mockRes(): any {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => {
    r.statusCode = c
    return r
  }
  r.json = (b: any) => {
    r.body = b
    return r
  }
  return r
}
const req = (u: string, body: unknown = {}, query: Record<string, string> = { fuso: FUSO }) => ({
  userId: asUserId(u),
  body,
  query,
  requestId: 'req-missoes',
  path: '/x',
})

async function creditarMeta(u: string, dia: string) {
  const r = mockRes()
  await handler('/seeds/creditar', 'post')(req(u, { creditoId: `meta:${dia}`, fuso: FUSO }), r)
  return r
}
async function missoes(u: string) {
  const r = mockRes()
  await handler('/missoes', 'get')(req(u), r)
  expect(r.statusCode).toBe(200)
  return r.body
}
async function rodada(u: string, roundId: string, jogo: string, certos: number, duracaoMs?: number) {
  await exerciseResultsRepo.addRodada(asUserId(u), {
    roundId,
    exerciseKind: jogo,
    origem: 'baralho',
    score: certos,
    melhorSequencia: 1,
    duracaoMs,
    itens: Array.from({ length: certos }, (_, i) => ({ itemRef: `${roundId}-${i}`, correct: 1, kind: 'drill' })),
  })
}
/** O teto de revisão e de palavra salva: 5 palavras de uma sessão e 20 revisões. */
async function revisarESalvar(u: string) {
  const s = await sessionsRepo.create(asUserId(u), { title: 'meta', kind: 'audio' })
  const { cards } = await vocabRepo.bulkAdd(
    asUserId(u),
    [
      ['leverage', 'alavancar'], ['synergy', 'sinergia'], ['volatility', 'volatilidade'],
      ['heuristics', 'heurística'], ['resilience', 'resiliência'],
    ].map(([word, back]) => ({ word, back, sentence: `we discuss ${word} here`, srcLang: 'en', tgtLang: 'pt', sessionId: s.id })),
  )
  for (let i = 0; i < 20; i++) await vocabRepo.review(asUserId(u), cards[i % cards.length].id, 3)
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ metricsRouter } = (await h.load('../../server/routes/metrics')) as any)
  ;({ computeProfile } = (await h.load('../../server/db/repositories/metrics')) as any)
  ;({ exerciseResultsRepo } = (await h.load('../../server/db/repositories/exerciseResults')) as any)
  ;({ sessionsRepo } = (await h.load('../../server/db/repositories/sessions')) as any)
  ;({ vocabRepo } = (await h.load('../../server/db/repositories/vocab')) as any)
  ;({ economiaRepo } = (await h.load('../../server/db/repositories/economia')) as any)
})
afterAll(async () => {
  await h.cleanup()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('meta do dia = as três missões', () => {
  it('os 20 acertos provisórios não bastam; com as três fechadas credita 15 Seeds uma vez', async () => {
    const u = 'u-missoes'
    const dia = diaNoFuso(Date.now(), FUSO)
    await rodada(u, 'mi-a', 'blitz', META_DIARIA_ACERTOS)
    const antes = await creditarMeta(u, dia)
    expect(antes.statusCode).toBe(400)
    expect(antes.body.code).toBe('meta_nao_cumprida')
    expect(antes.body.detalhes.missoes).toHaveLength(3)

    const m0 = await missoes(u)
    expect(m0).toMatchObject({ dia, metaConcluida: false, metaCreditada: false, recompensa: { seeds: 15, xp: 20 } })

    await revisarESalvar(u)
    await rodada(u, 'mi-b', 'termo', 10)
    const m1 = await missoes(u)
    expect(m1.metaConcluida).toBe(true)

    const r1 = await creditarMeta(u, dia)
    expect(r1.statusCode).toBe(200)
    expect(r1.body).toMatchObject({ jaExistia: false, seedsCreditadas: 15 })
    const r2 = await creditarMeta(u, dia)
    expect(r2.body).toMatchObject({ jaExistia: true, seedsCreditadas: 15 })
    expect((await missoes(u)).metaCreditada).toBe(true)
  })
})

describe('virada de meia-noite: a rodada conta no dia em que começou', () => {
  it('começou 23:5x, gravada 00:01 → credita a meta da véspera e não conta para o dia novo', async () => {
    const u = 'u-virada'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 5, 23, 0))) // 05/10 20:00 em -03
    await revisarESalvar(u)

    vi.setSystemTime(new Date(Date.UTC(2026, 9, 6, 3, 1))) // 06/10 00:01 em -03
    // Sem as rodadas, a véspera ainda não fechou (ela tem missão de rodada ou de jogo novo).
    expect((await creditarMeta(u, '2026-10-05')).statusCode).toBe(400)

    await rodada(u, 'vi-a', 'blitz', 10, 2 * 60_000) // começou 23:59
    await rodada(u, 'vi-b', 'termo', 10, 3 * 60_000) // começou 23:58
    const r = await creditarMeta(u, '2026-10-05')
    expect(r.statusCode).toBe(200)
    expect(r.body.jaExistia).toBe(false)

    // O dia novo não herda nada: nenhuma missão de 06/10 tem progresso.
    const hoje = await missoes(u)
    expect(hoje.dia).toBe('2026-10-06')
    for (const m of hoje.missoes) expect(m.atual, m.tipo).toBe(0)
  })
})

describe('congelamento da ofensiva', () => {
  it('a meta creditada rende 1; o dia perdido o gasta e a ofensiva não quebra', async () => {
    const u = 'u-congela'
    vi.useFakeTimers({ toFake: ['Date'] })
    const meioDia = (d: number) => new Date(Date.UTC(2026, 9, d, 12, 0))
    vi.setSystemTime(meioDia(5))
    await rodada(u, 'c-5', 'blitz', 10)
    // A meta de 05/10 creditada (o valor e a conferência são de outro teste; aqui importa o razão).
    await economiaRepo.creditar(asUserId(u), { creditoId: 'meta:2026-10-05', amount: 15, xp: 20, reason: 'meta:2026-10-05' })
    vi.setSystemTime(meioDia(6))
    await rodada(u, 'c-6', 'blitz', 10)
    // 07/10: nada.
    vi.setSystemTime(meioDia(8))
    await rodada(u, 'c-8', 'blitz', 10)

    const p = await computeProfile(asUserId(u))
    expect(p.streakDays).toBe(3)
    const m = await missoes(u)
    expect(m).toMatchObject({ ofensiva: 3, congelamentos: 0 })
  })

  it('sem meta, o mesmo buraco quebra a ofensiva', async () => {
    const u = 'u-sem-congela'
    vi.useFakeTimers({ toFake: ['Date'] })
    const meioDia = (d: number) => new Date(Date.UTC(2026, 9, d, 12, 0))
    for (const d of [5, 6, 8]) {
      vi.setSystemTime(meioDia(d))
      await rodada(u, `s-${d}`, 'blitz', 10)
    }
    const p = await computeProfile(asUserId(u))
    expect(p.streakDays).toBe(1)
    expect((await missoes(u)).congelamentos).toBe(0)
  })
})
