/**
 * `lock_timeout` NO SERVIDOR (revisão final da Fase 1, I3): uma transação esperando a trava do usuário
 * (`travarUsuario`, `pg_advisory_xact_lock`) que outra segura desiste com SQLSTATE 55P03 no prazo de
 * `DB_LOCK_TIMEOUT_MS`, em vez de prender a conexão do pool sem limite.
 *
 * Só roda com `TESTE_POSTGRES_URL` (o PGlite tem uma conexão só: não há duas transações ao mesmo tempo).
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import type { EphemeralDb } from '../harness/ephemeralDb'

const URL_PG = process.env.TESTE_POSTGRES_URL

let m: typeof import('../../server/db/db')
let h: EphemeralDb | undefined

beforeAll(async () => {
  if (!URL_PG) return
  h = await abrirBancoDeTeste({ env: { DB_LOCK_TIMEOUT_MS: '500' }, migrar: false })
  m = await import('../../server/db/db')
})

afterAll(async () => {
  delete process.env.DB_LOCK_TIMEOUT_MS
  await h?.cleanup()
})

const codigoDe = (e: unknown): unknown =>
  (e as { code?: unknown })?.code ?? (e as { cause?: { code?: unknown } })?.cause?.code

describe('lock_timeout', () => {
  it.skipIf(!URL_PG)(
    'a segunda transação na trava do MESMO usuário falha com 55P03 em menos de 2 s (exige TESTE_POSTGRES_URL)',
    async () => {
      const userId = `trava-${randomUUID()}`
      let soltar!: () => void
      const segurando = new Promise<void>((r) => (soltar = r))
      let travou!: () => void
      const travada = new Promise<void>((r) => (travou = r))
      const primeira = m.emTransacao(async (tx) => {
        await m.travarUsuario(tx, userId)
        travou()
        await segurando
      })
      await travada
      const t0 = Date.now()
      let erro: unknown
      try {
        await m.emTransacao(async (tx) => {
          await m.travarUsuario(tx, userId)
        })
      } catch (e) {
        erro = e
      }
      const ms = Date.now() - t0
      soltar()
      await primeira
      expect(codigoDe(erro)).toBe('55P03')
      expect(ms).toBeLessThan(2000)
      expect(ms).toBeGreaterThanOrEqual(400)
    },
  )
})
