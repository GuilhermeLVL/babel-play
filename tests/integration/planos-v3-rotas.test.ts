/**
 * AS ROTAS DA CONTA COM A MATRIZ V3 (change `planos-v3-e-rota-inteligente`, etapas 2 e 3).
 *
 * `GET /api/me/entitlements` entrega as capacidades novas (`semAnuncios`, `sttAoVivo`, `nivelDeVoz`) de
 * TODO plano da matriz, e `GET /api/me/uso` entrega o que resta do mês por NÍVEL de serviço (por
 * trechos e ao vivo). O `meRouter` real, por HTTP, contra um banco efêmero.
 */
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId, type UserId } from '../../server/lib/authContext'
import { PLAN_MATRIX, PLANOS_PAGOS } from '../../src/core/planos'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let server: Server
let base: string
let usuario: UserId
let subs: {
  upsert: (u: UserId, d: Record<string, unknown>) => Promise<unknown>
}

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  const { meRouter } = (await h.load('../../server/routes/me')) as { meRouter: express.Router }
  ;({ subscriptionsRepo: subs } = (await h.load('../../server/db/repositories/subscriptions')) as {
    subscriptionsRepo: typeof subs
  })
  for (const p of PLANOS_PAGOS) await subs.upsert(asUserId(`conta-${p}`), { plan: p, status: 'active' })

  const app = express()
  app.use((req, _res, next) => {
    req.userId = usuario
    next()
  })
  app.use('/api/me', meRouter)
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  delete process.env.AUTH_REQUIRED
  await h.cleanup()
})

async function pedir(caminho: string, quem: string): Promise<{ status: number; body: Record<string, any> }> {
  usuario = asUserId(quem)
  const res = await fetch(`${base}/api/me/${caminho}`)
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

describe('GET /api/me/entitlements — as capacidades novas', () => {
  it.each([...PLANOS_PAGOS])('%s: as capacidades são as da matriz, todas', async (plano) => {
    const { status, body } = await pedir('entitlements', `conta-${plano}`)
    expect(status).toBe(200)
    expect(body).toMatchObject({ plan: plano, ...PLAN_MATRIX[plano].entitlements })
    for (const campo of ['semAnuncios', 'sttAoVivo', 'nivelDeVoz']) expect(body, campo).toHaveProperty(campo)
  })

  it('sem plano: o Grátis, com anúncios, sem ao vivo e com a voz do aparelho', async () => {
    const { body } = await pedir('entitlements', 'conta-sem-plano')
    expect(body).toMatchObject({ plan: 'free', semAnuncios: false, sttAoVivo: false, nivelDeVoz: 'aparelho' })
  })
})

describe('GET /api/me/uso — o restante do mês por nível', () => {
  it('devolve usado, teto e restante da nuvem por trechos e da nuvem ao vivo', async () => {
    const quota = (await h.load('../../server/lib/usageQuota')) as typeof import('../../server/lib/usageQuota')
    process.env.PREMIUM_MONTHLY_STT_SECONDS = '1000'
    process.env.PREMIUM_MONTHLY_STT_LIVE_SECONDS = '600'
    try {
      const u = asUserId('conta-premium')
      expect((await quota.reservarSegundosDeStt(u, 40, 'plano', 'trechos')).cabe).toBe(true)
      expect((await quota.reservarSegundosDeStt(u, 90, 'plano', 'aovivo')).cabe).toBe(true)

      const { status, body } = await pedir('uso', 'conta-premium')
      expect(status).toBe(200)
      expect(body.porNivel).toEqual({
        trechos: { usado: 40, teto: 1000, restante: 960 },
        aovivo: { usado: 90, teto: 600, restante: 510 },
      })
      // O contador de sempre continua, e é o mesmo número dos trechos.
      expect(body.segundosDeAudio).toEqual({ usado: 40, teto: 1000 })
    } finally {
      delete process.env.PREMIUM_MONTHLY_STT_SECONDS
      delete process.env.PREMIUM_MONTHLY_STT_LIVE_SECONDS
    }
  })

  it('plano sem horas num nível: teto 0 e nada restando; o restante nunca é negativo', async () => {
    const { body } = await pedir('uso', 'conta-sem-plano')
    expect(body.porNivel).toEqual({
      trechos: { usado: 0, teto: 0, restante: 0 },
      aovivo: { usado: 0, teto: 0, restante: 0 },
    })
  })
})
