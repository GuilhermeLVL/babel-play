/**
 * A DATA DE CRIAÇÃO DA CONTA CHEGA AO CLIENTE (change `planos-v3-e-rota-inteligente`, tarefa 11.3).
 *
 * A política de anúncios do Grátis não mostra nada nos três primeiros dias da conta, e é o servidor
 * quem sabe quando ela nasceu (`users.created_at`). `GET /api/me/entitlements` passa a devolver
 * `contaCriadaEm` (ms): a data da linha da conta, a MESMA a cada pedido, e `null` para o convidado, que
 * não tem conta. O `meRouter` real, por HTTP, contra um banco efêmero.
 */
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { asUserId, type UserId } from '../../server/lib/authContext'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let server: Server
let base: string
let usuario: UserId
let convidado = false
let usersRepo: { get: (u: UserId) => Promise<{ createdAt: number } | undefined> }

beforeAll(async () => {
  h = await setupEphemeralDb()
  process.env.AUTH_REQUIRED = '1'
  const { meRouter } = (await h.load('../../server/routes/me')) as { meRouter: express.Router }
  ;({ usersRepo } = (await h.load('../../server/db/repositories/users')) as { usersRepo: typeof usersRepo })

  const app = express()
  app.use((req, _res, next) => {
    req.userId = usuario
    if (convidado) req.convidado = true
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

async function entitlements(quem: string, comoConvidado = false): Promise<Record<string, unknown>> {
  usuario = asUserId(quem)
  convidado = comoConvidado
  const res = await fetch(`${base}/api/me/entitlements`)
  expect(res.status).toBe(200)
  return (await res.json()) as Record<string, unknown>
}

describe('GET /api/me/entitlements — contaCriadaEm', () => {
  it('conta nova: a data de agora, e é a da linha em `users`', async () => {
    const antes = Date.now()
    const corpo = await entitlements('conta-de-hoje')
    const depois = Date.now()
    expect(typeof corpo.contaCriadaEm).toBe('number')
    expect(corpo.contaCriadaEm as number).toBeGreaterThanOrEqual(antes)
    expect(corpo.contaCriadaEm as number).toBeLessThanOrEqual(depois)
    expect((await usersRepo.get(asUserId('conta-de-hoje')))?.createdAt).toBe(corpo.contaCriadaEm)
  })

  it('a data não anda: o segundo pedido devolve a mesma', async () => {
    const primeira = (await entitlements('conta-que-volta')).contaCriadaEm
    await new Promise((r) => setTimeout(r, 15))
    expect((await entitlements('conta-que-volta')).contaCriadaEm).toBe(primeira)
  })

  it('o convidado não tem conta: `null`, e continua sem linha em `users`', async () => {
    const corpo = await entitlements('convidado-sem-data', true)
    expect(corpo).toHaveProperty('contaCriadaEm', null)
    expect(await usersRepo.get(asUserId('convidado-sem-data'))).toBeFalsy()
  })

  it('o campo novo não tira nenhum dos que já existiam', async () => {
    const corpo = await entitlements('conta-de-hoje')
    for (const campo of ['plan', 'semAnuncios', 'teste', 'armazenamento']) expect(corpo, campo).toHaveProperty(campo)
  })
})
