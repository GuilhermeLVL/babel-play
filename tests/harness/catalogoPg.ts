/**
 * O CATÁLOGO DO POSTGRES PARA OS TESTES QUE LIAM `PRAGMA` DO SQLITE.
 *
 *   `PRAGMA foreign_key_list(t)` → `chavesEstrangeiras(c, t)`  (de `pg_constraint`)
 *   `PRAGMA foreign_key_check`   → `orfaos(c)`                 (LEFT JOIN por constraint)
 *   `PRAGMA table_info(t)`       → `colunas(c, t)`             (de `information_schema.columns`)
 *
 * `orfaos` não é redundante com o Postgres aplicar FK: ele prova que nenhuma linha escapou por um
 * caminho que desliga a checagem (`session_replication_role = replica`, `DISABLE TRIGGER ALL` numa
 * carga) — e é a mesma pergunta que o `foreign_key_check` respondia.
 */
import type { ClienteSql } from './clienteSql'

export interface ChaveEstrangeira {
  nome: string
  tabela: string
  colunas: string[]
  pai: string
  colunasDoPai: string[]
}

/** As FKs declaradas no schema `public` (todas, ou só as da tabela `tabela`). */
export async function chavesEstrangeiras(c: ClienteSql, tabela?: string): Promise<ChaveEstrangeira[]> {
  const r = await c.execute(
    `SELECT con.conname AS nome, filho.relname AS tabela, pai.relname AS pai,
            array_to_string(ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(n, i)
                                  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n ORDER BY k.i), ',') AS colunas,
            array_to_string(ARRAY(SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY k(n, i)
                                  JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.n ORDER BY k.i), ',') AS colunas_do_pai
       FROM pg_constraint con
       JOIN pg_class filho ON filho.oid = con.conrelid
       JOIN pg_class pai ON pai.oid = con.confrelid
       JOIN pg_namespace ns ON ns.oid = filho.relnamespace
      WHERE con.contype = 'f' AND ns.nspname = 'public'
      ORDER BY filho.relname, con.conname`,
  )
  return r.rows
    .map((l) => ({
      nome: String(l.nome),
      tabela: String(l.tabela),
      colunas: String(l.colunas).split(','),
      pai: String(l.pai),
      colunasDoPai: String(l.colunas_do_pai).split(','),
    }))
    .filter((fk) => !tabela || fk.tabela === tabela)
}

/** Linhas filhas cuja FK aponta para um pai que não existe — o `PRAGMA foreign_key_check`. */
export async function orfaos(c: ClienteSql): Promise<Array<{ fk: string; tabela: string; n: number }>> {
  const fora: Array<{ fk: string; tabela: string; n: number }> = []
  for (const fk of await chavesEstrangeiras(c)) {
    const naoNulo = fk.colunas.map((col) => `f."${col}" IS NOT NULL`).join(' AND ')
    const junta = fk.colunas.map((col, i) => `p."${fk.colunasDoPai[i]}" = f."${col}"`).join(' AND ')
    const r = await c.execute(
      `SELECT count(*) AS n FROM "${fk.tabela}" f WHERE ${naoNulo} AND NOT EXISTS (SELECT 1 FROM "${fk.pai}" p WHERE ${junta})`,
    )
    const n = Number(r.rows[0]?.n ?? 0)
    if (n > 0) fora.push({ fk: fk.nome, tabela: fk.tabela, n })
  }
  return fora
}

/** Nomes das colunas de `tabela`, na ordem do schema. */
export async function colunas(c: ClienteSql, tabela: string): Promise<string[]> {
  const r = await c.execute({
    sql: `SELECT column_name AS nome FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = ? ORDER BY ordinal_position`,
    args: [tabela],
  })
  return r.rows.map((l) => String(l.nome))
}

/** A tabela existe no schema `public`? */
export async function existeTabela(c: ClienteSql, tabela: string): Promise<boolean> {
  const r = await c.execute({ sql: `SELECT to_regclass(?) IS NOT NULL AS ok`, args: [`public.${tabela}`] })
  return r.rows[0]?.ok === true
}
