/**
 * O GANCHO DE MEDIÇÃO NO `pg` (Postgres de verdade): as instruções de dentro de `emLote` chegam ao
 * observador pelo cliente que `pool.connect()` empresta; o controle da transação não; e o cliente
 * devolvido ao pool volta ao `query` original (a consulta avulsa seguinte não conta duas vezes).
 *
 * O caso do PGlite está em `db-driver.test.ts`. Este só roda com `TESTE_POSTGRES_URL`.
 */
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'

const URL_PG = process.env.TESTE_POSTGRES_URL

describe('medição das transações no pg', () => {
  afterAll(async () => {
    if (!URL_PG) return
    const { fecharBanco } = await import('../../server/db/db')
    await fecharBanco()
  })

  it.skipIf(!URL_PG)(
    'lote contado, sem BEGIN/COMMIT, e sem contagem dupla depois do release (exige TESTE_POSTGRES_URL)',
    async () => {
      process.env.DATABASE_URL = URL_PG
      const m = await import('../../server/db/db')
      const { registrarObservadorDeConsultas } = await import('../../server/db/observadorDeConsultas')
      const vistas: string[] = []
      registrarObservadorDeConsultas((o) => vistas.push(...o.instrucoes))
      try {
        await m.db.execute(sql`select 'avulsa-antes' as x`)
        await m.emLote((tx) => [
          () => tx.execute(sql`select 'lote-1' as x`),
          () => tx.execute(sql`select 'lote-2' as x`),
        ])
        await m.db.execute(sql`select 'avulsa-depois' as x`)
      } finally {
        registrarObservadorDeConsultas(undefined)
      }
      expect(vistas.filter((i) => i.includes('avulsa-antes'))).toHaveLength(1)
      expect(vistas.filter((i) => i.includes('lote-'))).toHaveLength(2)
      expect(vistas.filter((i) => i.includes('avulsa-depois'))).toHaveLength(1)
      expect(vistas.filter((i) => /^\s*(begin|commit|rollback)\b/i.test(i))).toEqual([])
    },
  )
})
