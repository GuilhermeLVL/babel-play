/**
 * A FLAG `nuvem_gratuita_alivio` (A10): a migração 0040 a semeia DESLIGADA e só para o Grátis, e a
 * avaliação devolve booleano — ligar é decisão do operador, com o orçamento do dia configurado.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FLAG_NUVEM_GRATUITA_ALIVIO } from '../src/core/nuvemDeAlivio'
import { type EphemeralDb, setupEphemeralDb } from './harness/ephemeralDb'

describe('flag nuvem_gratuita_alivio no servidor', () => {
  let h: EphemeralDb
  beforeAll(async () => {
    h = await setupEphemeralDb()
  })
  afterAll(async () => {
    await h.cleanup()
  })

  it('a migração semeia a flag desligada, com a regra de planos só no free', async () => {
    const { client } = (await h.load('../../server/db/db')) as {
      client: { execute: (q: string) => Promise<{ rows: Array<Record<string, unknown>> }> }
    }
    const { rows } = await client.execute(
      `SELECT habilitada, regras FROM flags WHERE chave = '${FLAG_NUVEM_GRATUITA_ALIVIO}'`,
    )
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].habilitada)).toBe(0)
    expect(JSON.parse(String(rows[0].regras))).toEqual({ planos: ['free'] })
  })

  it('desligada, a avaliação diz false também para o Grátis', async () => {
    const { avaliarParaContexto } = (await h.load('../../server/lib/flags')) as {
      avaliarParaContexto: (ctx: { plano: string }) => Promise<Record<string, { ligada: boolean }>>
    }
    const avaliadas = await avaliarParaContexto({ plano: 'free' })
    expect(avaliadas[FLAG_NUVEM_GRATUITA_ALIVIO].ligada).toBe(false)
  })
})
