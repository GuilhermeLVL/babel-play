/**
 * SaaS Fatia 1a — a rota GET /api/me/entitlements devolve os entitlements derivados NO SERVIDOR,
 * por usuário e read-only. Sobe um Express in-process (stub de auth injetando `req.userId`) + o
 * `meRouter` REAL contra banco efêmero, exercitando por HTTP.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'
import { asUserId, type UserId } from '../../server/lib/authContext'

let h: EphemeralDb
let server: Server
let base: string
let currentUser: UserId

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1' // modo público: default = free para quem não tem plano
  const { meRouter } = (await h.load('../../server/routes/me')) as any
  const { subscriptionsRepo } = (await h.load('../../server/db/repositories/subscriptions')) as any
  await subscriptionsRepo.upsert(asUserId('pro-user'), { plan: 'pro', status: 'active' })

  const app = express()
  app.use((req, _res, next) => { req.userId = currentUser; next() })
  app.use('/api/me', meRouter)
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  delete process.env.AUTH_REQUIRED
  await h.cleanup()
})

async function pedirEntitlements(user: UserId): Promise<{ status: number; body: any }> {
  currentUser = user
  const res = await fetch(`${base}/api/me/entitlements`)
  return { status: res.status, body: await res.json() }
}

describe('SaaS Fatia 1a — GET /api/me/entitlements', () => {
  it('usuário Pro → entitlements liberados', async () => {
    const { status, body } = await pedirEntitlements(asUserId('pro-user'))
    expect(status).toBe(200)
    expect(body).toMatchObject({ plan: 'pro', managedCloudStt: true, managedCloudLlm: true })
  })

  it('usuário sem plano (público) → free, tudo bloqueado', async () => {
    const { status, body } = await pedirEntitlements(asUserId('free-user'))
    expect(status).toBe(200)
    expect(body).toMatchObject({ plan: 'free', managedCloudStt: false, youtubeImport: false })
  })
})
