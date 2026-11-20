/**
 * UM BANCO POSTGRES NOVO POR TESTE, para os testes que sobem MAIS DE UM PROCESSO sobre o mesmo banco
 * (cluster, duas instâncias). O PGlite é de processo único, então esses testes só rodam com
 * `TESTE_POSTGRES_URL=postgres://…` (um Postgres de verdade, por exemplo num contêiner descartável).
 *
 * Banco novo, e não esquema novo: as migrations escrevem `"public"."tabela"` nas FKs, então só um
 * `CREATE DATABASE` dá a cada teste um `public` vazio. `apagar()` derruba as conexões que sobraram
 * (`WITH (FORCE)`, Postgres 13+) e remove o banco.
 */
import { Client } from 'pg'

export const URL_POSTGRES_DE_TESTE = process.env.TESTE_POSTGRES_URL

export interface PostgresDescartavel {
  url: string
  apagar: () => Promise<void>
}

async function comAdmin<T>(base: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: base })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

export async function bancoPostgresDescartavel(base: string): Promise<PostgresDescartavel> {
  const nome = `babel_teste_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  await comAdmin(base, (c) => c.query(`CREATE DATABASE ${nome}`))
  const url = new URL(base)
  url.pathname = `/${nome}`
  return {
    url: url.toString(),
    apagar: () => comAdmin(base, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`)).then(() => {}),
  }
}
