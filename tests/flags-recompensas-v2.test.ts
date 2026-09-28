// @vitest-environment jsdom
/**
 * A FLAG `recompensas_v2` (recompensas v2, Task 2.4): existe, é booleana, nasce DESLIGADA no
 * servidor (migração 0036) e, na edição estática, só liga com `VITE_RECOMPENSAS_V2=1`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { FLAG_RECOMPENSAS_V2 } from '../src/core/flags'
import { definirEstadoDasFlags } from '../src/lib/flagsCache'
import { recompensasV2Ligadas } from '../src/lib/recompensasV2'
import { type EphemeralDb, setupEphemeralDb } from './harness/ephemeralDb'

describe('no servidor', () => {
  let h: EphemeralDb
  beforeAll(async () => {
    h = await setupEphemeralDb()
  })
  afterAll(async () => {
    await h.cleanup()
  })

  it('a migração semeia a flag desligada, e a avaliação devolve booleano false', async () => {
    const { client } = (await h.load('../../server/db/db')) as { client: { execute: (q: string) => Promise<{ rows: Array<Record<string, unknown>> }> } }
    const { rows } = await client.execute(`SELECT chave, habilitada FROM flags WHERE chave = '${FLAG_RECOMPENSAS_V2}'`)
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].habilitada)).toBe(0)
    const { avaliarParaContexto } = (await h.load('../../server/lib/flags')) as {
      avaliarParaContexto: (ctx: { plano: string }) => Promise<Record<string, { ligada: boolean }>>
    }
    const avaliadas = await avaliarParaContexto({ plano: 'free' })
    expect(typeof avaliadas[FLAG_RECOMPENSAS_V2].ligada).toBe('boolean')
    expect(avaliadas[FLAG_RECOMPENSAS_V2].ligada).toBe(false)
  })
})

describe('no cliente', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    definirEstadoDasFlags(null)
  })

  it('com servidor: segue o que o servidor avaliou', () => {
    definirEstadoDasFlags({ [FLAG_RECOMPENSAS_V2]: { ligada: false } })
    expect(recompensasV2Ligadas()).toBe(false)
    definirEstadoDasFlags({ [FLAG_RECOMPENSAS_V2]: { ligada: true } })
    expect(recompensasV2Ligadas()).toBe(true)
  })

  it('na edição estática: desligada sem VITE_RECOMPENSAS_V2, ligada com =1 (a flag do cache não manda)', () => {
    vi.stubEnv('VITE_EDICAO_ESTATICA', '1')
    definirEstadoDasFlags({ [FLAG_RECOMPENSAS_V2]: { ligada: true } })
    expect(recompensasV2Ligadas()).toBe(false)
    vi.stubEnv('VITE_RECOMPENSAS_V2', '1')
    expect(recompensasV2Ligadas()).toBe(true)
  })
})
