/**
 * `/api/health` diz QUAL banco está atrás do processo (Fase 1 da migração para o Postgres).
 *
 * Com o SQLite, quem operava conferia o `journal_mode` (WAL) para saber se o banco estava sadio.
 * No Postgres não há journal para conferir: a pergunta útil é se o processo subiu no PGlite
 * embutido (dev, testes, uma máquina só) ou num Postgres de verdade. O campo `banco` responde isso
 * sem vazar URL, host nem driver.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type AppDeTeste, subirApp } from '../caracterizacao/_app'

let s: AppDeTeste

beforeAll(async () => {
  s = await subirApp({ modo: 'self-host' })
})
afterAll(async () => {
  await s.encerrar()
})

describe('/api/health — tipo de banco', () => {
  it('GET /api/health informa o tipo de banco e não menciona journal_mode', async () => {
    const r = await s.get('/api/health')
    expect(r.status).toBe(200)
    const corpo = (await r.json()) as Record<string, unknown>
    expect(corpo.banco).toBe(process.env.BANCO_DE_TESTE === 'postgres' ? 'postgres' : 'pglite')
    expect(corpo).not.toHaveProperty('journal_mode')
  })

  it('o campo não carrega a URL do banco', async () => {
    const corpo = JSON.stringify(await (await s.get('/api/health')).json())
    expect(corpo).not.toMatch(/pglite:\/\/|memory|postgres:\/\//)
  })
})
