/**
 * `/api/health` precisa detectar schema quebrado, não só "o banco responde" (P1-N2 da v2).
 *
 * Medido na re-auditoria (cenário C4): com a tabela `sessions` ausente, toda escrita
 * devolvia 400 e o health devolvia **200 `{"status":"ok","db":"up"}`** — porque ele só faz
 * `SELECT 1`, que funciona com o schema inteiro faltando.
 *
 * Efeito prático: o orquestrador mantém no balanceador uma réplica que falha em tudo.
 * O boot é fail-fast, o runtime era cego — a pior combinação.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupEphemeralDb, type EphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let health: any
let client: any
let boot: any

beforeAll(async () => {
  h = await setupEphemeralDb()
  ;({ healthHandler: health } = await h.load('../../server/routes/health'))
  ;({ client } = await h.load('../../server/db/db') as any)
  boot = await h.load('../../server/lib/bootStatus')
})
afterAll(async () => { await h.cleanup() })

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}
const chamar = async () => { const res = fakeRes(); await health({} as any, res); return res }

describe('/api/health — detecção de schema', () => {
  it('banco íntegro: 200 e status ok', async () => {
    boot.resetBootStatus()
    const res = await chamar()
    expect(res.statusCode).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.db).toBe('up')
  })

  it('SCHEMA QUEBRADO: 503, não 200', async () => {
    boot.resetBootStatus()
    await client.execute('ALTER TABLE sessions RENAME TO sessions_sumiu')
    try {
      const res = await chamar()
      expect(res.statusCode).toBe(503)
      expect(res.body.status).toBe('degraded')
      expect(res.body.db).not.toBe('up')
    } finally {
      await client.execute('ALTER TABLE sessions_sumiu RENAME TO sessions')
    }
  })

  it('recupera sozinho quando o schema volta', async () => {
    boot.resetBootStatus()
    const res = await chamar()
    expect(res.statusCode).toBe(200)
  })

  it('não vaza detalhe do banco na resposta', async () => {
    boot.resetBootStatus()
    await client.execute('ALTER TABLE sessions RENAME TO sessions_sumiu')
    try {
      const res = await chamar()
      const corpo = JSON.stringify(res.body)
      expect(corpo).not.toMatch(/sessions_sumiu|SQLITE|no such table/i)
    } finally {
      await client.execute('ALTER TABLE sessions_sumiu RENAME TO sessions')
    }
  })
})
