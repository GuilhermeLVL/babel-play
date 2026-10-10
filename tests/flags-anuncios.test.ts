/**
 * A FLAG `anuncios` (change `planos-v3-e-rota-inteligente`, grupo 11): a migração 0051 a semeia
 * DESLIGADA e sem regra de plano, e a avaliação devolve `false` para todos — inclusive para o Grátis,
 * que é quem veria anúncio. Ligar é ato do dono.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FLAG_ANUNCIOS } from '../src/core/anuncios/politicaDeAnuncio'
import { type EphemeralDb, setupEphemeralDb } from './harness/ephemeralDb'

describe('flag anuncios no servidor', () => {
  let h: EphemeralDb
  beforeAll(async () => {
    h = await setupEphemeralDb()
  })
  afterAll(async () => {
    await h.cleanup()
  })

  it('a chave é `anuncios`', () => {
    expect(FLAG_ANUNCIOS).toBe('anuncios')
  })

  it('a migração semeia a flag desligada, sem regra e sem payload', async () => {
    const { client } = (await h.load('../../server/db/db')) as {
      client: { execute: (q: string) => Promise<{ rows: Array<Record<string, unknown>> }> }
    }
    const { rows } = await client.execute(
      `SELECT habilitada, regras, payload FROM flags WHERE chave = '${FLAG_ANUNCIOS}'`,
    )
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].habilitada)).toBe(0)
    expect(JSON.parse(String(rows[0].regras))).toEqual({})
    expect(rows[0].payload).toBeNull()
  })

  it.each(['free', 'convidado', 'essencial', 'premium', 'selfhost'])(
    'desligada, a avaliação diz false para o plano %s',
    async (plano) => {
      const { avaliarParaContexto } = (await h.load('../../server/lib/flags')) as {
        avaliarParaContexto: (ctx: { plano: string }) => Promise<Record<string, { ligada: boolean }>>
      }
      const avaliadas = await avaliarParaContexto({ plano })
      expect(avaliadas[FLAG_ANUNCIOS]).toEqual({ ligada: false })
    },
  )
})
