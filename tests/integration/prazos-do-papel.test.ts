/**
 * PRAZOS NO PAPEL DO BANCO (migration 0004). O pooler do Supabase e o Hyperdrive ignoram o `options` da
 * abertura da sessão; o `ALTER ROLE … SET` vale para toda sessão. Prova: uma conexão NOVA, sem `options`,
 * já nasce com os prazos. Só com `TESTE_POSTGRES_URL` (o PGlite não tem sessões de papel).
 * Contra o Supabase: TESTE_PRAZOS_URL_POOLER=<url do pooler> (o banco já migrado) lê o mesmo `SHOW` por ali.
 */
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { configDoPool } from '../../server/db/configDoPool'
import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import type { EphemeralDb } from '../harness/ephemeralDb'

const comPostgres = !!process.env.TESTE_POSTGRES_URL
const urlPooler = process.env.TESTE_PRAZOS_URL_POOLER

async function prazosDe(url: string) {
  const c = new Client({ connectionString: url }) // sem `options`: só vale o papel
  await c.connect()
  try {
    const r = await c.query(
      `SELECT current_setting('statement_timeout') AS statement, current_setting('lock_timeout') AS lock,
              current_setting('idle_in_transaction_session_timeout') AS ociosa`,
    )
    return r.rows[0]
  } finally {
    await c.end()
  }
}

describe.skipIf(!comPostgres)('prazos de sessão no papel do banco', () => {
  let h: EphemeralDb

  beforeAll(async () => {
    h = await abrirBancoDeTeste()
  })
  afterAll(async () => {
    await h?.cleanup()
  })

  it('conexão nova SEM options nasce com 30s / 10s / 60s depois da migration', async () => {
    expect(await prazosDe(process.env.DATABASE_URL!)).toEqual({ statement: '30s', lock: '10s', ociosa: '1min' })
  })

  it('DB_SESSION_OPTIONS=0: o pool não manda options', () => {
    expect('options' in configDoPool({ DB_SESSION_OPTIONS: '0' })).toBe(false)
  })

  it.skipIf(!urlPooler)('pelo pooler (Supabase) a sessão também nasce com os prazos', async () => {
    expect(await prazosDe(urlPooler!)).toEqual({ statement: '30s', lock: '10s', ociosa: '1min' })
  })
})
