/**
 * POSTGRES INALCANÇÁVEL VIRA ERRO EM TEMPO CONHECIDO (revisão final da Fase 1, I3).
 *
 * Sem `connectionTimeoutMillis`, `pool.connect()` contra um endereço que não responde ficava pendurado
 * até o TCP desistir (minutos), e com ele o `/api/health` e o `/api/ready` — o orquestrador via uma
 * probe sem resposta em vez de um 503. Endereço não roteável (10.255.255.1) e `DB_CONNECT_TIMEOUT_MS=500`:
 * a consulta rejeita, e as duas probes respondem 503, em menos de 2 s. Não precisa de Postgres nenhum.
 */
import { sql } from 'drizzle-orm'
import type { Request, Response } from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let m: typeof import('../../server/db/db')
let health: typeof import('../../server/routes/health')

beforeAll(async () => {
  process.env.DATABASE_URL = 'postgres://u:p@10.255.255.1:5432/x'
  process.env.DB_CONNECT_TIMEOUT_MS = '500'
  m = await import('../../server/db/db')
  m.dbReady.catch(() => {})
  health = await import('../../server/routes/health')
}, 30_000)

afterAll(async () => {
  delete process.env.DB_CONNECT_TIMEOUT_MS
  await m?.fecharBanco()
})

function respostaFalsa() {
  const r = { codigo: 200, corpo: undefined as unknown }
  const res = {
    status(c: number) {
      r.codigo = c
      return res
    },
    json(b: unknown) {
      r.corpo = b
      return res
    },
  }
  return { r, res: res as unknown as Response }
}

describe('pool com prazo de conexão', () => {
  it('a consulta rejeita em menos de 2 s', async () => {
    const t0 = Date.now()
    await expect(m.db.execute(sql`select 1`)).rejects.toThrow()
    expect(Date.now() - t0).toBeLessThan(2000)
  })

  it('/api/health responde 503 (db: down) em menos de 2 s', async () => {
    const { r, res } = respostaFalsa()
    const t0 = Date.now()
    await health.healthHandler({} as Request, res)
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(r.codigo).toBe(503)
    expect(r.corpo).toMatchObject({ db: 'down' })
  })

  it('/api/ready responde 503 (db: down) em menos de 2 s', async () => {
    health.esquecerVereditoDeProntidao()
    const { r, res } = respostaFalsa()
    const t0 = Date.now()
    await health.readyHandler({} as Request, res)
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(r.codigo).toBe(503)
    expect(r.corpo).toMatchObject({ db: 'down' })
  })
})
