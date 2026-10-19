/**
 * LEITURA COMPACTA — a lista de objetos de uma tabela, só com as colunas pedidas, na ordem pedida.
 * O driver `pg` devolve `float8` sem passar por JSON, então a leitura compacta do SQLite (JSON com
 * `printf('%!.17g')`) não é mais necessária; a função fica pelo contrato e pela validação de nomes.
 */
import { type SQL, sql } from 'drizzle-orm'

import { db, linhas } from './db'

/**
 * `[chave no objeto, coluna no SQL, afinidade]`. A coluna é um identificador do schema, nunca
 * entrada. `'texto'` é legado da leitura do SQLite e é ignorado.
 */
export type ColunaCompacta = readonly [chave: string, coluna: string, afinidade?: 'texto']

/** De onde ler: a tabela, o filtro (com parâmetros), e opcionalmente DISTINCT e ORDER BY. */
export interface OrigemCompacta {
  tabela: string
  onde: SQL
  distinta?: boolean
  /** Ex.: `'added_at DESC NULLS LAST'`. Só identificadores, ASC/DESC e NULLS FIRST/LAST. */
  ordem?: string
}

const IDENTIFICADOR = /^[a-z_][a-z0-9_]*$/
const ORDEM =
  /^[a-z_][a-z0-9_]*( (ASC|DESC)( NULLS (FIRST|LAST))?)?(, [a-z_][a-z0-9_]*( (ASC|DESC)( NULLS (FIRST|LAST))?)?)*$/

/** `SELECT [DISTINCT] <colunas> FROM <tabela> WHERE <onde> [ORDER BY <ordem>]`, com as chaves pedidas. */
export async function lerCompacto<T>(colunas: readonly ColunaCompacta[], de: OrigemCompacta): Promise<T[]> {
  // Os nomes vão crus para o SQL: só identificadores simples, como os do schema.
  for (const nome of [de.tabela, ...colunas.map(([, c]) => c)]) {
    if (!IDENTIFICADOR.test(nome)) throw new Error(`lerCompacto: identificador inválido: ${nome}`)
  }
  if (de.ordem && !ORDEM.test(de.ordem)) throw new Error(`lerCompacto: ordem inválida: ${de.ordem}`)
  const nomes = colunas.map(([, c]) => c).join(', ')
  const consulta = sql`SELECT ${sql.raw(de.distinta ? 'DISTINCT ' : '')}${sql.raw(nomes)} FROM ${sql.raw(de.tabela)} WHERE ${de.onde}${sql.raw(de.ordem ? ` ORDER BY ${de.ordem}` : '')}`
  return linhas<Record<string, unknown>>(await db.execute(consulta)).map((l) => {
    const o: Record<string, unknown> = {}
    for (const [chave, coluna] of colunas) o[chave] = l[coluna]
    return o as T
  })
}
