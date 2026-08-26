/**
 * Marco 1 — Commit 10: isolamento HTTP ponta-a-ponta.
 *
 * Sobe um Express in-process com o authMiddleware REAL + o sessionsRouter REAL contra um banco
 * efêmero, e o exercita por HTTP com dois tokens HS256 assinados localmente. Prova o boundary de
 * verdade: dois usuários veem conjuntos DISJUNTOS de sessões, e sem token dá 401.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import { SignJWT, generateKeyPair } from 'jose'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'

/*
 * F15-01 (2026-08-26): o deploy bem configurado e JWKS ASSIMETRICO com origem declarada. Este e2e
 * representa isso com um par ES256 gerado aqui e injetado como `key` (o JWKS remoto e a mesma
 * verificacao, com a chave vinda da rede); o `iss` continua exigido pela `SUPABASE_URL`.
 */
const URL_SUPABASE = 'https://projeto-e2e.supabase.co'
const ISS = `${URL_SUPABASE}/auth/v1`
const { publicKey, privateKey } = await generateKeyPair('ES256')
const mkToken = (sub: string) =>
  new SignJWT({}).setProtectedHeader({ alg: 'ES256' }).setSubject(sub)
    .setAudience('authenticated').setIssuer(ISS).setIssuedAt().setExpirationTime('1h').sign(privateKey)

let h: EphemeralDb
let server: Server
let base: string
let tokenA: string
let tokenB: string
let savedAuth: string | undefined

beforeAll(async () => {
  h = await setupEphemeralDb()
  savedAuth = process.env.AUTH_REQUIRED
  process.env.AUTH_REQUIRED = '1' // modo público: token obrigatório

  const { sessionsRepo } = await h.load<any>('../../server/db/repositories/sessions')
  const { asUserId } = await h.load<any>('../../server/lib/authContext')
  const { makeAuthMiddleware, createVerifier } = await h.load<any>('../../server/lib/auth')
  const { sessionsRouter } = await h.load<any>('../../server/routes/sessions')

  await sessionsRepo.createWithUtterances(asUserId('user-A'), { title: 'A-sess' }, [])
  await sessionsRepo.createWithUtterances(asUserId('user-B'), { title: 'B-sess' }, [])

  const app = express()
  app.use(express.json())
  app.use('/api', makeAuthMiddleware(createVerifier({ key: publicKey, supabaseUrl: URL_SUPABASE })))
  app.use('/api/sessions', sessionsRouter)

  server = app.listen(0)
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  base = `http://127.0.0.1:${port}`

  tokenA = await mkToken('user-A')
  tokenB = await mkToken('user-B')
})

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()))
  if (savedAuth === undefined) delete process.env.AUTH_REQUIRED
  else process.env.AUTH_REQUIRED = savedAuth
  await h.cleanup()
})

describe('Marco 1 — isolamento HTTP ponta-a-ponta', () => {
  it('dois tokens veem conjuntos DISJUNTOS de sessões', async () => {
    const ra = await fetch(`${base}/api/sessions`, { headers: { Authorization: `Bearer ${tokenA}` } })
    const rb = await fetch(`${base}/api/sessions`, { headers: { Authorization: `Bearer ${tokenB}` } })
    expect(ra.status).toBe(200)
    expect(rb.status).toBe(200)
    const la = await ra.json()
    const lb = await rb.json()
    expect(la.map((s: any) => s.title)).toEqual(['A-sess'])
    expect(lb.map((s: any) => s.title)).toEqual(['B-sess'])
  })

  it('sem token → 401', async () => {
    const r = await fetch(`${base}/api/sessions`)
    expect(r.status).toBe(401)
  })

  it('token inválido → 401', async () => {
    const r = await fetch(`${base}/api/sessions`, { headers: { Authorization: 'Bearer lixo.invalido.xyz' } })
    expect(r.status).toBe(401)
  })
})
