/**
 * O `--zerar` do semeador de revisão contra o schema REAL do Postgres (PGlite em memória, migrations-pg):
 * com um deck do Anki, import, nota, cartão, sessão e fala, os DELETEs têm de terminar sem violar FK e
 * deixar as tabelas vazias. A ordem antiga (decks antes de imports) falhava aqui.
 */
import path from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// @ts-expect-error módulo .mjs de scripts, sem tipos
import { TABELAS_A_ZERAR, zerarBanco } from '../scripts/polimento/zerar-banco.mjs'

let pg: PGlite
const banco = { consultar: (sql: string) => pg.query(sql) }

beforeAll(async () => {
  pg = new PGlite()
  await migrate(drizzle(pg), { migrationsFolder: path.resolve(__dirname, '../server/db/migrations-pg') })
})
afterAll(() => pg.close())

const contar = async (t: string) => (await pg.query<{ n: number }>(`select count(*)::int n from ${t}`)).rows[0].n

describe('zerarBanco', () => {
  it('apaga deck + import + nota + cartão + sessão + fala sem violar FK, e deixa tudo vazio', async () => {
    await pg.exec(`
      INSERT INTO users (id, created_at, updated_at) VALUES ('u1', 1, 1);
      INSERT INTO sessions (id, created_at, updated_at, user_id) VALUES ('s1', 1, 1, 'u1');
      INSERT INTO utterances (id, created_at, updated_at, user_id, session_id, idx) VALUES ('f1', 1, 1, 'u1', 's1', 0);
      INSERT INTO anki_decks (id, created_at, updated_at, user_id, nome, arquivo_origem) VALUES ('d1', 1, 1, 'u1', 'D', 'd.apkg');
      INSERT INTO anki_imports (id, created_at, updated_at, user_id, deck_id) VALUES ('i1', 1, 1, 'u1', 'd1');
      INSERT INTO vocab_cards (id, created_at, updated_at, user_id, word) VALUES ('c1', 1, 1, 'u1', 'w');
      INSERT INTO anki_notes (id, created_at, updated_at, user_id, deck_id, guid, projected_card_id) VALUES ('n1', 1, 1, 'u1', 'd1', 'g', 'c1');
    `)
    for (const t of ['anki_decks', 'anki_imports', 'anki_notes', 'vocab_cards', 'sessions', 'utterances'])
      expect(await contar(t), t).toBe(1)

    await zerarBanco(banco)

    for (const t of TABELAS_A_ZERAR) expect(await contar(t), t).toBe(0)
    expect(await contar('users')).toBe(1) // só o conteúdo de estudo sai, não a conta
  })
})
