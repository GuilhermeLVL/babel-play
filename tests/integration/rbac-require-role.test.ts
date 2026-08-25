/**
 * SaaS Fatia 2 — o gate `requireRole`. Prova que o papel é lido no SERVIDOR e fail-closed:
 * usuário comum é barrado (403) num endpoint admin; admin passa; support tem só leitura (barrado
 * onde exige admin, liberado onde admin+support). Express in-process com stub injetando req.userId.
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
  const { requireRole } = (await h.load('../../server/lib/rbac')) as any
  const { usersRepo } = (await h.load('../../server/db/repositories/users')) as any
  await usersRepo.ensure(asUserId('admin-user')); await usersRepo.setRole(asUserId('admin-user'), 'admin')
  await usersRepo.ensure(asUserId('support-user')); await usersRepo.setRole(asUserId('support-user'), 'support')
  // 'regular-user' fica sem linha → getRole default 'user' (menor privilégio)

  const app = express()
  app.use((req, _res, next) => { req.userId = currentUser; next() })
  app.get('/admin-only', requireRole('admin'), (_req, res) => res.json({ ok: true }))
  app.get('/staff', requireRole('admin', 'support'), (_req, res) => res.json({ ok: true }))
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()) })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await h.cleanup()
})

async function status(user: UserId, path: string): Promise<number> {
  currentUser = user
  return (await fetch(`${base}${path}`)).status
}

describe('SaaS Fatia 2 — requireRole', () => {
  it('usuário comum é barrado no endpoint admin (403)', async () => {
    expect(await status(asUserId('regular-user'), '/admin-only')).toBe(403)
  })
  it('admin passa no endpoint admin (200)', async () => {
    expect(await status(asUserId('admin-user'), '/admin-only')).toBe(200)
  })
  it('support é barrado onde exige admin (403), mas passa onde admin+support (200)', async () => {
    expect(await status(asUserId('support-user'), '/admin-only')).toBe(403)
    expect(await status(asUserId('support-user'), '/staff')).toBe(200)
  })
  it('usuário comum é barrado até no endpoint admin+support (403)', async () => {
    expect(await status(asUserId('regular-user'), '/staff')).toBe(403)
  })
})
