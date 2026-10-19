/**
 * INT8 CHEGA COMO `number` TAMBÉM NO `pg` (revisão final da Fase 1, I1).
 *
 * O parser padrão do `pg` para int8 (OID 20) devolve STRING; o Drizzle só troca os de data. No PGlite
 * vinha number, e o código foi escrito para isso: em produção `inicioDaContagem` devolvia
 * `"1712345678901"` e o cliente lançava `RangeError: Invalid time value`. `db.ts` registra um parser
 * para int8 e numeric com a mesma regra de `linhas()`: number quando cabe, string acima de 2^53.
 *
 * Só roda com `TESTE_POSTGRES_URL` (o PGlite já devolve number; o caso dele está nos testes do
 * repositório de vocabulário).
 */
import { sql } from 'drizzle-orm'
import { bigint, integer, pgTable } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  bancoPostgresDescartavel,
  type PostgresDescartavel,
  URL_POSTGRES_DE_TESTE,
} from '../harness/postgresDescartavel'

const SEM_PG = 'exige TESTE_POSTGRES_URL (Postgres de verdade; no PGlite int8 já é number)'

const tabela = pgTable('int8_sonda', {
  id: integer('id').primaryKey(),
  em: bigint('em', { mode: 'number' }).notNull(),
})

let banco: PostgresDescartavel | undefined
let m: typeof import('../../server/db/db')

beforeAll(async () => {
  if (!URL_POSTGRES_DE_TESTE) return
  banco = await bancoPostgresDescartavel(URL_POSTGRES_DE_TESTE)
  process.env.DATABASE_URL = banco.url
  m = await import('../../server/db/db')
  await m.db.execute(sql`create table int8_sonda (id integer primary key, em bigint not null)`)
  await m.db.insert(tabela).values([
    { id: 1, em: 1_712_345_678_901 },
    { id: 2, em: 1_712_345_679_000 },
  ])
}, 60_000)

afterAll(async () => {
  if (!banco) return
  await m.fecharBanco()
  await banco.apagar()
})

describe('int8 e numeric no pg', () => {
  it.skipIf(!URL_POSTGRES_DE_TESTE)(`builder do Drizzle: min/count/sum chegam como number (${SEM_PG})`, async () => {
    const [r] = await m.db
      .select({
        inicio: sql<number>`min(${tabela.em})`,
        n: sql<number>`count(*)`,
        soma: sql<number>`sum(${tabela.em})`,
      })
      .from(tabela)
    expect(typeof r!.inicio).toBe('number')
    expect(r!.inicio).toBe(1_712_345_678_901)
    expect(new Date(r!.inicio).toISOString()).toMatch(/^2024-/)
    expect(typeof r!.n).toBe('number')
    expect(r!.n).toBe(2)
    expect(typeof r!.soma).toBe('number') // sum(bigint) é numeric (OID 1700)
    expect(r!.soma).toBe(1_712_345_678_901 + 1_712_345_679_000)
  })

  it.skipIf(!URL_POSTGRES_DE_TESTE)(`db.execute + linhas(): number também (${SEM_PG})`, async () => {
    const r = await m.db.execute(sql`select min(em) as inicio, count(*) as n, sum(em) as soma from int8_sonda`)
    const [l] = m.linhas<{ inicio: unknown; n: unknown; soma: unknown }>(r)
    expect([typeof l!.inicio, typeof l!.n, typeof l!.soma]).toEqual(['number', 'number', 'number'])
    // E sem o `linhas()`: o parser já entrega number nas linhas cruas.
    const cru = (r as unknown as { rows: Array<Record<string, unknown>> }).rows[0]!
    expect(typeof cru.inicio).toBe('number')
  })

  it.skipIf(!URL_POSTGRES_DE_TESTE)(`int8 acima de 2^53 continua string, sem arredondar (${SEM_PG})`, async () => {
    const r = await m.db.execute(sql`select 9007199254740993::int8 as grande, 9007199254740991::int8 as limite`)
    const [l] = m.linhas<{ grande: unknown; limite: unknown }>(r)
    expect(l!.grande).toBe('9007199254740993')
    expect(l!.limite).toBe(9_007_199_254_740_991)
    const [b] = await m.db
      .select({ g: sql<unknown>`9007199254740993::int8` })
      .from(tabela)
      .limit(1)
    expect(b!.g).toBe('9007199254740993')
  })
})
