/**
 * Contagem de linhas para os scripts de medição que sobem o servidor (`recuperacao`, `concorrencia`).
 *
 * `--db` aceita um diretório do PGlite OU uma URL `postgres://`. O PGlite é de um processo só:
 * ler o diretório enquanto o servidor está de pé corromperia o banco, então quem usa o PGlite
 * precisa contar com o servidor PARADO (antes de subir e depois de matar). Com `postgres://` pode
 * contar a qualquer hora.
 */
import path from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import pg from 'pg'

export const ehPostgres = (db) => /^postgres(ql)?:\/\//i.test(db)

/** O valor de `DATABASE_URL` que o servidor filho deve receber para este `--db`. */
export const urlDoBanco = (db) => (ehPostgres(db) ? db : `pglite:${path.resolve(db).replace(/\\/g, '/')}`)

export async function contarLinhas(db, tabela) {
  if (!/^\w+$/.test(tabela)) throw new Error(`nome de tabela inválido: ${tabela}`)
  const consulta = `select count(*)::int as n from ${tabela}`
  if (ehPostgres(db)) {
    const cliente = new pg.Client({ connectionString: db })
    await cliente.connect()
    try {
      return (await cliente.query(consulta)).rows[0].n
    } finally {
      await cliente.end()
    }
  }
  const banco = new PGlite(path.resolve(db))
  try {
    return (await banco.query(consulta)).rows[0].n
  } finally {
    await banco.close()
  }
}
