/**
 * TODA TABELA DO SCHEMA TEM LEITOR E ESCRITOR (auditoria de 2026-09-07, achado A35).
 *
 * Cinco tabelas foram removidas por não terem nenhum dos dois — `memory_embeddings` na F1-05,
 * depois `analyses`, `profiles`, `anki_media` e `anki_note_media` na migração 0026. Todas com zero
 * linhas, todas conhecidas por um único trecho de código: a lista de exclusão de conta, que
 * garantia que seriam apagadas.
 *
 * REMOVER AS CINCO NÃO IMPEDE A SEXTA. Este arquivo é o que impede: a próxima tabela declarada
 * sem quem a use derruba o CI no mesmo dia, e não dois meses depois numa auditoria.
 *
 * O MÉTODO, e por que ele é uma varredura de texto e não uma análise de tipos: as escritas do
 * projeto acontecem por três caminhos que não têm um tipo em comum — o builder do drizzle
 * (`db.insert(tabela)`), SQL cru com interpolação de tabela (``sql`INSERT INTO ${tabela}` ``, usado
 * onde o `ON CONFLICT` de índice parcial exige) e SQL cru com o nome literal (`$client.batch`).
 * Uma varredura pelo IDENTIFICADOR do drizzle e pelo NOME da tabela cobre os três; um analisador
 * de tipos cobriria o primeiro e chamaria os outros dois de tabela órfã.
 *
 * Ele mede `server/` inteiro, e não só `repositories/`: uma tabela lida por `server/lib/` continua
 * sendo uma tabela usada.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { getTableName } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { describe, expect,it } from 'vitest'

import * as schema from '../../server/db/schema'

/** Todo arquivo `.ts` sob `server/`, exceto o próprio schema (declarar não é usar). */
function arquivosDoServidor(dir = 'server'): string[] {
  const saida: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) { saida.push(...arquivosDoServidor(caminho)); continue }
    if (!nome.endsWith('.ts')) continue
    if (caminho.replace(/\\/g, '/') === 'server/db/schema.ts') continue
    saida.push(caminho)
  }
  return saida
}

const CODIGO = arquivosDoServidor().map((f) => readFileSync(f, 'utf8')).join('\n')

/** As tabelas declaradas, com o identificador exportado e o nome no banco. */
const TABELAS = Object.entries(schema as Record<string, unknown>)
  .filter((e): e is [string, SQLiteTable] => e[1] instanceof SQLiteTable)
  .map(([ident, tabela]) => ({ ident, nome: getTableName(tabela) }))

/* Uma escrita: `insert(tabela)`, `update(tabela)`, `delete(tabela)`, `INSERT INTO ${tabela}` /
   `INSERT INTO nome`, `UPDATE tabela SET`, `DELETE FROM tabela`. */
function temEscritor(t: { ident: string; nome: string }): boolean {
  const porBuilder = new RegExp(`\\.(insert|update|delete)\\(\\s*${t.ident}\\b`)
  const porSqlCru = new RegExp(`(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+(\\\${)?${t.nome}\\b`, 'i')
  const porSqlInterp = new RegExp(`(INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+\\\${${t.ident}}`, 'i')
  return porBuilder.test(CODIGO) || porSqlCru.test(CODIGO) || porSqlInterp.test(CODIGO)
}

/** Uma leitura: `from(tabela)`, `FROM tabela` / `FROM ${tabela}`. */
function temLeitor(t: { ident: string; nome: string }): boolean {
  const porBuilder = new RegExp(`\\.from\\(\\s*${t.ident}\\b`)
  const porSqlCru = new RegExp(`FROM\\s+(\\\${)?${t.nome}\\b`, 'i')
  const porSqlInterp = new RegExp(`FROM\\s+\\\${${t.ident}}`, 'i')
  return porBuilder.test(CODIGO) || porSqlCru.test(CODIGO) || porSqlInterp.test(CODIGO)
}

describe('o schema é só o que o código usa', () => {
  it('há tabelas para conferir (a varredura não passou por vazio)', () => {
    expect(TABELAS.length).toBeGreaterThan(15)
    expect(CODIGO.length).toBeGreaterThan(100_000)
  })

  it('toda tabela declarada tem ao menos um ESCRITOR em server/', () => {
    const sem = TABELAS.filter((t) => !temEscritor(t)).map((t) => t.nome)
    expect(sem, `tabelas sem escritor: ${sem.join(', ')}`).toEqual([])
  })

  it('toda tabela declarada tem ao menos um LEITOR em server/', () => {
    const sem = TABELAS.filter((t) => !temLeitor(t)).map((t) => t.nome)
    expect(sem, `tabelas sem leitor: ${sem.join(', ')}`).toEqual([])
  })

  it('as cinco tabelas órfãs removidas não voltaram', () => {
    /* Nomeadas uma a uma de propósito. As três checagens acima já as barrariam, mas esta é a que
       diz POR QUE elas saíram, para quem reintroduzir uma ler o motivo antes do erro. */
    const nomes = TABELAS.map((t) => t.nome)
    for (const removida of ['memory_embeddings', 'analyses', 'profiles', 'anki_media', 'anki_note_media']) {
      expect(nomes, `${removida} voltou: ela saiu por não ter leitor nem escritor`).not.toContain(removida)
    }
  })

  it('`vocab_cards.frequency` não voltou — quem conta encontro de palavra é `occurrences`', () => {
    const colunas = Object.keys(schema.vocabCards)
    expect(colunas).not.toContain('frequency')
    expect(colunas).toContain('occurrences')
  })
})
