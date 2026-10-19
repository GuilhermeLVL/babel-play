/**
 * O BANCO SQLITE LEGADO, migrado pela cadeia antiga (`server/db/migrations-sqlite/`), para os testes
 * que provam uma migração DE DADOS do SQLite sobre linhas escritas no formato de antes.
 *
 * Por que ainda existe: o servidor saiu do SQLite (Fase 1 da migração para o Postgres), mas o banco de
 * produção continua sendo um arquivo SQLite até a cópia para o Postgres (Tarefa 8), e essa cópia parte
 * do banco migrado por esta cadeia. As migrações de dado dela (renomear planos, reduzir o payload do
 * webhook, consolidar o idioma…) seguem sendo o que leva o dado antigo à forma que o Postgres recebe.
 * No Postgres essas linhas antigas não existem: a baseline já nasce no estado final.
 *
 * Arquivo temporário, e não `:memory:`: o migrador do libsql abre transação, e cada conexão a
 * `:memory:` é um banco novo e vazio.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { type Client, createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

export const PASTA_SQLITE_LEGADO = path.resolve(process.cwd(), 'server', 'db', 'migrations-sqlite')

export interface SqliteLegado {
  client: Client
  /** A URL `file:` do arquivo, para quem precise abrir uma segunda conexão (a cópia para o Postgres). */
  url: string
  fechar: () => void
}

/** Um SQLite novo com TODA a cadeia legada aplicada. `fechar()` apaga o arquivo. */
export async function abrirSqliteLegado(): Promise<SqliteLegado> {
  const dir = mkdtempSync(path.join(tmpdir(), 'babel-sqlite-legado-'))
  const url = 'file:' + path.join(dir, 'legado.db').split(path.sep).join('/')
  const client = createClient({ url })
  await client.execute('PRAGMA foreign_keys = ON')
  await migrate(drizzle(client), { migrationsFolder: PASTA_SQLITE_LEGADO })
  return {
    client,
    url,
    fechar() {
      client.close()
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* antivírus/OneDrive pode segurar */
      }
    },
  }
}
