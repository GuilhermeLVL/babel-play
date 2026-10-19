/**
 * TODA CHAVE ESTRANGEIRA TEM ÍNDICE NO LADO FILHO — auditoria de performance do backend (26/09/2026).
 *
 * Cada linha APAGADA numa tabela pai obriga o banco a procurar filhos que ainda a referenciem; sem
 * índice cuja primeira coluna seja a coluna filha, a procura é a tabela filha INTEIRA, por linha
 * apagada. Medido no SQLite, no banco semeado da suíte de carga (453.000 ocorrências,
 * `scripts/perf/consultas/fks-sem-indice.mjs`):
 *
 *   DELETE das 100 falas de uma sessão (PUT /api/sessions/:id/utterances, "retomar captura")
 *     sem `vocab_occurrences(utterance_id)` indexado: 15.467 ms com o event loop preso.
 *
 * No Postgres vale o mesmo, e o Postgres NÃO cria índice para a FK sozinho. A procura é a consulta
 * do gatilho de integridade (`SELECT 1 FROM ONLY <filho> x WHERE <fk> = $1 FOR KEY SHARE OF x`), que
 * o `EXPLAIN` do DELETE não mostra; por isso os planos abaixo são os dessa consulta.
 *
 * O teste usa o banco migrado do harness (`migrations-pg`) e confere, para cada FK, que existe índice
 * (completo ou parcial) com a coluna filha na FRENTE. Os planos rodam com `enable_seqscan = off`: com
 * as tabelas vazias o planejador prefere varrer, e a pergunta aqui é se HÁ índice que sirva — sem
 * índice, ele ainda escolhe Seq Scan mesmo assim. E o índice usado tem de ter a coluna filha na
 * frente: um índice `(user_id, fk)` varrido inteiro é o equivalente do skip-scan do SQLite.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { chavesEstrangeiras } from '../harness/catalogoPg'
import { clienteSql } from '../harness/clienteSql'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'

let h: EphemeralDb
let c: ReturnType<typeof clienteSql>

beforeAll(async () => {
  h = await setupEphemeralDb()
  c = clienteSql(await h.load('../../server/db/db'))
})
afterAll(async () => {
  await h.cleanup()
})

/** Índices de `tabela` cuja PRIMEIRA coluna é `coluna` (completos ou parciais). */
async function indicesComLider(tabela: string, coluna: string): Promise<string[]> {
  const r = await c.execute({
    sql: `SELECT i.relname AS nome
            FROM pg_index x
            JOIN pg_class t ON t.oid = x.indrelid
            JOIN pg_class i ON i.oid = x.indexrelid
            JOIN pg_namespace ns ON ns.oid = t.relnamespace
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.indkey[0]
           WHERE ns.nspname = 'public' AND t.relname = ? AND a.attname = ?`,
    args: [tabela, coluna],
  })
  return r.rows.map((l) => String(l.nome))
}

type No = { 'Node Type': string; 'Relation Name'?: string; 'Index Name'?: string; Plans?: No[] }
const nos = (n: No): No[] => [n, ...(n.Plans ?? []).flatMap(nos)]

/** O plano da consulta que o gatilho de integridade roda no filho ao apagar o pai. */
async function planoDaChecagem(filho: string, coluna: string): Promise<No[]> {
  await c.execute('SET enable_seqscan = off')
  try {
    const r = await c.execute(
      `EXPLAIN (FORMAT JSON) SELECT 1 FROM ONLY "${filho}" x WHERE "${coluna}" = 'pai-qualquer' FOR KEY SHARE OF x`,
    )
    const json = r.rows[0]['QUERY PLAN']
    const plano = (typeof json === 'string' ? JSON.parse(json) : json) as Array<{ Plan: No }>
    return nos(plano[0].Plan)
  } finally {
    await c.execute('SET enable_seqscan = on')
  }
}

const VARREDURA_POR_INDICE = /^(Index Scan|Index Only Scan|Bitmap Index Scan)$/

/** A checagem de cada FK de `pai` no filho usa um índice com a coluna filha na frente — e não varre. */
async function confereFilhosDe(pai: string): Promise<string[]> {
  const problemas: string[] = []
  const fks = (await chavesEstrangeiras(c)).filter((fk) => fk.pai === pai)
  expect(fks.length, `${pai} tem filhos`).toBeGreaterThan(0)
  for (const fk of fks) {
    const coluna = fk.colunas[0]
    const plano = await planoDaChecagem(fk.tabela, coluna)
    const lideres = await indicesComLider(fk.tabela, coluna)
    const desc = plano.map((n) => `${n['Node Type']}${n['Index Name'] ? ` ${n['Index Name']}` : ''}`).join(' / ')
    if (plano.some((n) => n['Node Type'] === 'Seq Scan')) problemas.push(`${fk.tabela}.${coluna}: Seq Scan (${desc})`)
    const indices = plano.filter((n) => VARREDURA_POR_INDICE.test(n['Node Type'])).map((n) => n['Index Name'])
    if (!indices.length || !indices.every((i) => i && lideres.includes(i))) {
      problemas.push(`${fk.tabela}.${coluna}: não usa índice com a coluna na frente (${desc})`)
    }
  }
  return problemas
}

describe('chaves estrangeiras × índices', () => {
  it('cada FK tem índice com a coluna filha na frente', async () => {
    const fks = await chavesEstrangeiras(c)
    expect(fks.length).toBeGreaterThan(0)
    const faltando: string[] = []
    for (const fk of fks) {
      if (!(await indicesComLider(fk.tabela, fk.colunas[0])).length) faltando.push(`${fk.tabela}.${fk.colunas[0]}`)
    }
    expect(faltando, 'FK sem índice no lado filho: cada DELETE no pai varre a tabela filha inteira').toEqual([])
  })

  it('apagar as falas de uma sessão não varre vocab_occurrences (a FK usa o índice parcial)', async () => {
    const plano = await planoDaChecagem('vocab_occurrences', 'utterance_id')
    const desc = plano.map((n) => `${n['Node Type']} ${n['Index Name'] ?? ''}`).join(' / ')
    expect(
      plano.some((n) => n['Node Type'] === 'Seq Scan'),
      desc,
    ).toBe(false)
    expect(
      plano.some((n) => VARREDURA_POR_INDICE.test(n['Node Type']) && n['Index Name'] === 'idx_occ_utterance'),
      desc,
    ).toBe(true)
  })

  it('apagar uma sessão não varre nem salta por usuário nas tabelas filhas', async () => {
    expect(await confereFilhosDe('sessions')).toEqual([])
  })

  it('apagar um cartão não varre nem salta por usuário nas tabelas filhas', async () => {
    expect(await confereFilhosDe('vocab_cards')).toEqual([])
  })
})
