/**
 * TODA CHAVE ESTRANGEIRA TEM ÍNDICE NO LADO FILHO — auditoria de performance do backend (26/09/2026).
 *
 * `server/db/db.ts` liga `PRAGMA foreign_keys = ON`. Com isso, cada linha APAGADA numa tabela pai
 * obriga o SQLite a procurar filhos que ainda a referenciem; sem índice cuja primeira coluna seja a
 * coluna filha, a procura é a tabela filha INTEIRA, por linha apagada. Medido no banco semeado da
 * suíte de carga (453.000 ocorrências, `scripts/perf/consultas/fks-sem-indice.mjs`):
 *
 *   DELETE das 100 falas de uma sessão (PUT /api/sessions/:id/utterances, "retomar captura")
 *     sem `vocab_occurrences(utterance_id)` indexado: 15.467 ms com o event loop preso.
 *
 * O teste aplica as migrations reais num banco vazio e confere, para cada FK, que existe índice
 * (completo ou parcial) com a coluna filha na FRENTE. Os casos em que o índice existente começa por
 * `user_id` (skip-scan) estão listados em `SKIP_SCAN_ACEITO`, com a medição que os justifica — um caso
 * novo tem de ou ganhar índice ou entrar na lista com número.
 */
import path from 'node:path'

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const PASTA = path.resolve(__dirname, '..', '..', 'server', 'db', 'migrations')

let cliente: ReturnType<typeof createClient>

beforeAll(async () => {
  cliente = createClient({ url: 'file::memory:' })
  await cliente.execute('PRAGMA foreign_keys = ON') // como `server/db/db.ts`
  await migrate(drizzle(cliente), { migrationsFolder: PASTA })
})
afterAll(() => cliente.close())

async function linhas<T>(sql: string, args: unknown[] = []): Promise<T[]> {
  return (await cliente.execute({ sql, args: args as never })).rows as unknown as T[]
}

describe('chaves estrangeiras × índices', () => {
  it('cada FK tem índice com a coluna filha na frente', async () => {
    const tabelas = await linhas<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_%' ESCAPE '\\'",
    )
    const faltando: string[] = []
    for (const { name: t } of tabelas) {
      const fks = await linhas<{ from: string }>('SELECT "from" FROM pragma_foreign_key_list(?)', [t])
      if (!fks.length) continue
      const indices = await linhas<{ name: string }>('SELECT name FROM pragma_index_list(?)', [t])
      const lideres = new Set<string>()
      for (const i of indices) {
        const cols = await linhas<{ name: string }>('SELECT name FROM pragma_index_info(?) ORDER BY seqno', [i.name])
        if (cols[0]) lideres.add(cols[0].name)
      }
      for (const fk of fks) {
        const chave = `${t}.${fk.from}`
        if (!lideres.has(fk.from)) faltando.push(chave)
      }
    }
    expect(faltando, 'FK sem índice no lado filho: cada DELETE no pai varre a tabela filha inteira').toEqual([])
  })

  it('apagar as falas de uma sessão não varre vocab_occurrences (a FK usa o índice parcial)', async () => {
    const plano = await linhas<{ detail: string }>(
      'EXPLAIN QUERY PLAN DELETE FROM utterances WHERE session_id = ? AND user_id = ?',
      ['s', 'u'],
    )
    const detalhes = plano.map((l) => l.detail)
    expect(detalhes.some((d) => /^SCAN vocab_occurrences\b/.test(d)), detalhes.join(' / ')).toBe(false)
    expect(detalhes.some((d) => /vocab_occurrences USING .*idx_occ_utterance/.test(d)), detalhes.join(' / ')).toBe(true)
  })

  /* `ANY(user_id)` no plano é o skip-scan: salta de usuário em usuário no índice (user_id, …). */
  it('apagar uma sessão não varre nem salta por usuário nas tabelas filhas', async () => {
    const plano = await linhas<{ detail: string }>('EXPLAIN QUERY PLAN DELETE FROM sessions WHERE id = ?', ['s'])
    const detalhes = plano.map((l) => l.detail)
    expect(detalhes.filter((d) => /^SCAN |ANY\(/.test(d)), detalhes.join(' / ')).toEqual([])
  })

  it('apagar um cartão não varre nem salta por usuário nas tabelas filhas', async () => {
    const plano = await linhas<{ detail: string }>('EXPLAIN QUERY PLAN DELETE FROM vocab_cards WHERE id = ?', ['c'])
    const detalhes = plano.map((l) => l.detail)
    expect(detalhes.filter((d) => /^SCAN |ANY\(/.test(d)), detalhes.join(' / ')).toEqual([])
  })
})
