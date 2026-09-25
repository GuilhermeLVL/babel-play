/**
 * LEITURA COMPACTA — milhares de linhas numa célula só (fix/rotas-caras, auditoria de prontidão
 * Fase 2 §2.1).
 *
 * O QUE FOI MEDIDO. O custo das rotas grandes não é o SQLite achar as linhas — é o driver
 * (`@libsql/client`) montar um objeto por linha, com uma propriedade por coluna, e prender o event
 * loop enquanto faz isso. Com 3.000 cartões (usuário pesado semeado, `scripts/perf/escala`):
 *
 *   | leitura                                  | linhas do driver | compacta |
 *   |------------------------------------------|-----------------:|---------:|
 *   | 27 colunas de `vocab_cards` (o baralho)  |      ~95 ms      |  ~31 ms  |
 *   | 13 colunas de `vocab_cards` (o perfil)   |      ~40 ms      |  ~15 ms  |
 *   | falas (5 colunas)                        |      ~14 ms      |   ~3 ms  |
 *
 * COMO: o próprio SQLite serializa as linhas num único JSON (`json_group_array(json_array(...))`),
 * o driver devolve UMA célula, e `JSON.parse` (nativo) a abre. A saída é a mesma lista de objetos,
 * com as chaves na ordem pedida.
 *
 * O CUIDADO QUE TORNA ISSO EXATO — os REAIS. O JSON do SQLite escreve ponto flutuante com 15
 * algarismos significativos (`0.847930459072813`), e o double original precisa de até 17
 * (`0.8479304590728134`): ler por JSON cru mudaria estabilidades, dificuldades e confianças no
 * último bit — e as médias do perfil com elas. Por isso todo valor cujo `typeof` é `real` sai como
 * `["<printf %!.17g>"]` (17 algarismos fazem a volta exata) e vira número de novo aqui — dentro
 * da faixa em que o `printf` do SQLite foi conferido (ver `fora` abaixo); fora dela, a leitura cai
 * no caminho do driver. Inteiros e textos passam como
 * JSON normal, e o array de um elemento distingue o real até de uma coluna de texto que por acaso
 * guarde dígitos.
 *
 * A ORDEM das linhas é a da subconsulta `deOnde` — a mesma consulta que o código fazia antes, com
 * o mesmo `WHERE` e o mesmo `ORDER BY`, então o mesmo plano. Somas de ponto flutuante feitas sobre
 * o resultado dão o mesmo número.
 */
import { type SQL, sql } from 'drizzle-orm'

import { db } from './db'

/**
 * `[chave no objeto, coluna no SQL, afinidade]`. A coluna é um identificador do schema, nunca
 * entrada. `'texto'` marca coluna de afinidade TEXT: o SQLite converte para texto o número gravado
 * nela, então ela nunca guarda REAL e dispensa a conferência de tipo por linha (que custa). Sem a
 * marca, a coluna é tratada como numérica — e uma INTEGER pode, sim, guardar REAL (`last_review`
 * recebe `dueAt - stability * DAY`, fracionário, em `scheduler.ts`).
 */
export type ColunaCompacta = readonly [chave: string, coluna: string, afinidade?: 'texto']

/** De onde ler: a tabela, o filtro (com parâmetros), e opcionalmente DISTINCT e ORDER BY. */
export interface OrigemCompacta {
  tabela: string
  onde: SQL
  distinta?: boolean
  /** Ex.: `'added_at DESC'`. Só identificadores e ASC/DESC. */
  ordem?: string
}

const IDENTIFICADOR = /^[a-z_][a-z0-9_]*$/
const ORDEM = /^[a-z_][a-z0-9_]*( (ASC|DESC))?(, [a-z_][a-z0-9_]*( (ASC|DESC))?)*$/

/**
 * `SELECT [DISTINCT] <colunas> FROM <tabela> WHERE <onde> [ORDER BY <ordem>]` — a consulta que o
 * código fazia antes, só com as colunas pedidas — embrulhada em `json_group_array`.
 */
export async function lerCompacto<T>(colunas: readonly ColunaCompacta[], de: OrigemCompacta): Promise<T[]> {
  // Os nomes vão crus para o SQL: só identificadores simples, como os do schema.
  for (const nome of [de.tabela, ...colunas.map(([, c]) => c)]) {
    if (!IDENTIFICADOR.test(nome)) throw new Error(`lerCompacto: identificador inválido: ${nome}`)
  }
  if (de.ordem && !ORDEM.test(de.ordem)) throw new Error(`lerCompacto: ordem inválida: ${de.ordem}`)
  const nomes = colunas.map(([, c]) => c).join(', ')
  /* Real DENTRO da faixa conferida → `["<17 algarismos>"]`; real FORA dela → `[]`, que manda a
     leitura inteira para o caminho do driver (abaixo). Numa passada só: uma segunda agregação só
     para achar os reais fora da faixa custava mais que o resto da consulta (medido: +34 ms em
     3.000 cartões). */
  const exprs = colunas
    .map(([, c, afinidade]) =>
      afinidade === 'texto'
        ? c
        : `CASE WHEN typeof(${c}) <> 'real' THEN ${c} WHEN ${c} = 0 OR abs(${c}) BETWEEN 1e-12 AND 1e15 ` +
          `THEN json_array(printf('%!.17g', ${c})) ELSE json_array() END`,
    )
    .join(', ')
  const interna = sql`SELECT ${sql.raw(de.distinta ? 'DISTINCT ' : '')}${sql.raw(nomes)} FROM ${sql.raw(de.tabela)} WHERE ${de.onde}${sql.raw(de.ordem ? ` ORDER BY ${de.ordem}` : '')}`
  const [linha] = await db.all<{ j: string | null }>(
    sql`SELECT json_group_array(json_array(${sql.raw(exprs)})) AS j FROM (${interna})`,
  )
  const n = colunas.length
  const linhas = JSON.parse(linha?.j ?? '[]') as unknown[][]
  const foraDaFaixa = linhas.some((l) => l.some((v) => Array.isArray(v) && v.length === 0))
  if (foraDaFaixa) {
    const crus = await db.all<Record<string, unknown>>(interna)
    return crus.map((l) => {
      const o: Record<string, unknown> = {}
      for (let i = 0; i < n; i++) o[colunas[i][0]] = l[colunas[i][1]]
      return o as T
    })
  }
  return linhas.map((l) => {
    const o: Record<string, unknown> = {}
    for (let i = 0; i < n; i++) {
      const v = l[i]
      o[colunas[i][0]] = Array.isArray(v) ? Number(v[0]) : v
    }
    return o as T
  })
}
