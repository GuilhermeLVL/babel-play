/**
 * A LIMPEZA DIÁRIA RODA `ANALYZE` SÓ NO BANCO EMBUTIDO.
 *
 * O PGlite (o padrão do self-host, `pglite:./data/pg`) roda em modo de usuário único: sem autovacuum
 * nem autoanalyze, o planejador fica sem estatística e estima `rows=1` em tudo. A limpeza é quem pede
 * o `ANALYZE` (o papel do `PRAGMA optimize` no SQLite). No Postgres de produção o autovacuum do
 * servidor cuida disso, e a aplicação não manda ANALYZE nenhum.
 *
 * PGlite por padrão; com `TESTE_POSTGRES_URL=postgres://…`, contra um Postgres de verdade — e aí o
 * caso do embutido fica `skip`, e o do Postgres roda (sem a URL, o contrário).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { abrirBancoDeTeste } from '../harness/bancoDeTeste'
import type { EphemeralDb } from '../harness/ephemeralDb'

const URL_PG = process.env.TESTE_POSTGRES_URL

let h: EphemeralDb
let instrucoesDaLimpeza: string[] = []

beforeAll(async () => {
  h = await abrirBancoDeTeste()
  const { registrarObservadorDeConsultas } = await h.load<typeof import('../../server/db/observadorDeConsultas')>(
    '../../server/db/observadorDeConsultas',
  )
  const { limparBanco } = await h.load<typeof import('../../server/lib/limpezaDiaria')>(
    '../../server/lib/limpezaDiaria',
  )
  const vistas: string[] = []
  registrarObservadorDeConsultas((o) => vistas.push(...o.instrucoes))
  try {
    await limparBanco({ agora: Date.now(), dias: 30 })
  } finally {
    registrarObservadorDeConsultas(undefined)
  }
  instrucoesDaLimpeza = vistas
})
afterAll(async () => {
  await h.cleanup()
})

const analyzes = () => instrucoesDaLimpeza.filter((i) => /^\s*analyze\b/i.test(i))

describe('limpeza diária × estatística do planejador', () => {
  it('a passada foi observada (a conta abaixo não é vazia por construção)', () => {
    expect(instrucoesDaLimpeza.length).toBeGreaterThan(0)
  })

  it.skipIf(!!URL_PG)('no PGlite embutido, a limpeza termina com ANALYZE (sem TESTE_POSTGRES_URL)', () => {
    expect(analyzes()).toHaveLength(1)
  })

  it.skipIf(!URL_PG)(
    'no Postgres de verdade, nenhum ANALYZE (o autovacuum do servidor cuida; exige TESTE_POSTGRES_URL)',
    () => {
      expect(analyzes()).toEqual([])
    },
  )
})
