// @vitest-environment jsdom
/**
 * SESSÃO VAZIA NÃO RENDE XP — NAS DUAS PONTAS (revisão de 27/09 das recompensas v2, P0).
 *
 * `POST /api/sessions` aceita `{}`, e cada sessão valia `PESOS_XP.sessao` (25 XP) na conta e na
 * temporada: sessões vazias em série subiam a trilha grátis inteira (1.050 Seeds). A régua agora é
 * do core — a sessão rende XP se dela saiu ao menos UMA palavra salva no caderno (cartão com
 * `sessionId`, no baralho) — e as duas pontas a aplicam sobre as mesmas linhas: o perfil
 * (`sessoesComPalavraSalva`) e a curva/temporada (`palavrasSalvas` por sessão).
 */
import 'fake-indexeddb/auto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId } from '../../server/lib/authContext'
import { economiaDeMetricas } from '../../src/core/learning/xp'
import { linhasDoHistoricoLocal, perfilEfemero } from '../../src/data/efemero/rotas/metricas'
import { servidorEfemero } from '../../src/data/efemero/servidor'
import { fecharStore, limparTudo } from '../../src/data/efemero/store'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let sessionsRepo: any
let vocabRepo: any
let computeProfile: any
let linhasDoHistoricoDeXp: any

const U = asUserId('contrato-sessao-xp')

async function efemero(caminho: string, corpo: unknown) {
  const res = await servidorEfemero(caminho, { method: 'POST', body: JSON.stringify(corpo) })
  return res.json()
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ sessionsRepo } = (await h.load('../../server/db/repositories/sessions')) as any)
  ;({ vocabRepo } = (await h.load('../../server/db/repositories/vocab')) as any)
  ;({ computeProfile, linhasDoHistoricoDeXp } = (await h.load('../../server/db/repositories/metrics')) as any)
  await limparTudo()
})
afterAll(async () => {
  await fecharStore()
  await h?.cleanup?.()
})

describe('sessão só rende XP com palavra salva', () => {
  const sessoesExpress: string[] = []
  const sessoesEfemero: string[] = []

  it('três sessões vazias: 0 XP nas duas pontas', async () => {
    for (let i = 0; i < 3; i++) {
      sessoesExpress.push((await sessionsRepo.create(U, {})).id)
      sessoesEfemero.push((await efemero('/api/sessions', {})).id)
    }
    const express = await computeProfile(U)
    const local = await perfilEfemero(null)
    expect(express.sessions).toBe(3)
    expect(local.sessions).toBe(3)
    expect(express.sessoesComPalavraSalva).toBe(0)
    expect(local.sessoesComPalavraSalva).toBe(0)
    expect(economiaDeMetricas(express).xp).toBe(0)
    expect(economiaDeMetricas(local).xp).toBe(0)
  })

  it('uma palavra salva de UMA sessão: só ela conta, e as duas pontas concordam', async () => {
    const carta = { word: 'casa', back: 'house', sentence: 'A casa é grande.', srcLang: 'pt', tgtLang: 'en' }
    await vocabRepo.bulkAdd(U, [{ ...carta, sessionId: sessoesExpress[0] }])
    await efemero('/api/vocab/bulk-add', { cards: [{ ...carta, sessionId: sessoesEfemero[0] }] })
    const express = await computeProfile(U)
    const local = await perfilEfemero(null)
    expect(express.sessoesComPalavraSalva).toBe(1)
    expect(local.sessoesComPalavraSalva).toBe(1)
    expect(economiaDeMetricas(local).xp).toBe(economiaDeMetricas(express).xp)

    const salvasExpress = (await linhasDoHistoricoDeXp(U)).sessoes.map((s: { palavrasSalvas: number }) => s.palavrasSalvas)
    const salvasLocal = (await linhasDoHistoricoLocal()).sessoes.map((s) => s.palavrasSalvas)
    expect(salvasExpress.sort()).toEqual([0, 0, 1])
    expect(salvasLocal.sort()).toEqual([0, 0, 1])
  })
})
