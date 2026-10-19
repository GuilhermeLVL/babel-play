/**
 * LOTES contra o teto de parâmetros por instrução.
 *
 * O protocolo do Postgres numera os parâmetros com 16 bits: uma instrução com mais de 65.535 (`$n`)
 * é recusada INTEIRA. Não é um limite teórico — o schema aceita 5.000 falas por sessão (17
 * parâmetros por linha) e o import Anki até 50.000 notas num `inArray`. (No SQLite/libsql o teto era
 * 32.766, e foi ali que o defeito apareceu: P1 da auditoria de prontidão.)
 *
 * Toda lista que vem do usuário e vira variável de SQL passa por aqui. O tamanho do lote é
 * CALCULADO pelo número de variáveis por item, não fixado a olho: uma coluna nova na tabela não
 * pode reabrir o defeito em silêncio.
 */
import { type Column, getTableColumns, type SQL, sql, type Table } from 'drizzle-orm'
import type { IndexColumn, PgTable, PgUpdateSetSource } from 'drizzle-orm/pg-core'

import { emLote, type ExecutorDb, linhasAfetadas } from './db'

/** Teto de parâmetros de UMA instrução no Postgres (índice de parâmetro em 16 bits). */
export const LIMITE_DE_PARAMETROS_POSTGRES = 65_535

/**
 * Orçamento por instrução, com folga larga sobre o teto: sobra espaço para os parâmetros fixos que o
 * chamador esqueça de declarar, e a instrução não fica gigante (o valor é o mesmo da era SQLite).
 */
export const VARIAVEIS_POR_INSTRUCAO = 30_000

/**
 * Quantos itens cabem numa instrução quando cada um consome `variaveisPorItem` e a instrução
 * ainda carrega `variaveisFixas` (as do WHERE, por exemplo `user_id = ?`).
 */
export function tamanhoDoLote(variaveisPorItem: number, variaveisFixas = 0): number {
  if (!Number.isInteger(variaveisPorItem) || variaveisPorItem < 1) {
    throw new Error(`variaveisPorItem inválido: ${variaveisPorItem}`)
  }
  if (!Number.isInteger(variaveisFixas) || variaveisFixas < 0) {
    throw new Error(`variaveisFixas inválido: ${variaveisFixas}`)
  }
  const n = Math.floor((VARIAVEIS_POR_INSTRUCAO - variaveisFixas) / variaveisPorItem)
  // Lote 0 viraria laço infinito em quem itera por ele; melhor falhar alto aqui.
  if (n < 1) throw new Error(`nem um item cabe numa instrução (${variaveisPorItem} por item, ${variaveisFixas} fixas)`)
  return n
}

/**
 * Lote para um INSERT multi-VALUES em `tabela`. Conta TODAS as colunas da tabela, não só as que
 * a linha preenche: é o pior caso, e o drizzle pode mandar colunas com default como variável.
 */
export function tamanhoDoLoteDeInsert(tabela: Table): number {
  return tamanhoDoLote(Object.keys(getTableColumns(tabela)).length)
}

/** Divide `itens` em fatias de até `tamanho`, na ordem, sem perder nem repetir. */
export function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  if (!Number.isInteger(tamanho) || tamanho < 1) throw new Error(`tamanho de lote inválido: ${tamanho}`)
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho))
  return lotes
}

/**
 * Quantas INSTRUÇÕES vão numa transação quando o lote não precisa ser atômico como um todo (import
 * grande). Uma transação gigante seguraria travas de linha por segundos; lotes deste tamanho mantêm
 * cada transação curta sem voltar a uma transação por item.
 */
export const INSTRUCOES_POR_BATCH = 500

/**
 * Uma instrução de lote: MONTA e dispara a consulta sobre o executor recebido (o `tx` do `emLote`).
 * É função, e não builder pronto, porque um builder montado sobre `db` rodaria fora da transação.
 */
export type InstrucaoDeBatch = (tx: ExecutorDb) => Promise<unknown>

/**
 * Roda as instruções em sequência numa só transação (`emLote`) e devolve os resultados na ordem.
 * Lista vazia é recusada, como antes: quem monta a lista dinamicamente confere o `length` antes.
 */
export async function rodarLote(instrucoes: readonly InstrucaoDeBatch[]): Promise<unknown[]> {
  if (!instrucoes.length) throw new Error('batch vazio')
  return emLote<unknown[]>((tx) => instrucoes.map((i) => () => i(tx)))
}

/* ── LOTES EM UMA INSTRUÇÃO (Fase 2, tarefa 2) ─────────────────────────────────────────────────────────
   `emLote` com uma instrução por linha custa uma ida ao banco por linha: medido contra o Supabase em
   us-east-1 (130 ms por ida), reetiquetar 5 000 cartões segurava a trava do usuário por dezenas de segundos
   e caía em `lock_timeout`. Os helpers abaixo mandam N linhas numa instrução (multi-VALUES), em fatias que
   respeitam o teto de parâmetros. `emLote` continua para os lotes pequenos e heterogêneos. */

/** Quantas instruções foram ao banco e quantas linhas elas tocaram. */
export interface ResultadoDeLotes {
  instrucoes: number
  linhas: number
}

/**
 * Linhas por instrução: a calculada pelo orçamento (`tamanhoDoLote`) ou a pedida, desde que a pedida
 * não passe do teto de parâmetros do protocolo — uma instrução acima dele é recusada inteira.
 */
function linhasPorInstrucao(variaveisPorLinha: number, pedido?: number): number {
  if (pedido === undefined) return tamanhoDoLote(variaveisPorLinha)
  if (!Number.isInteger(pedido) || pedido < 1) throw new Error(`tamanho de lote inválido: ${pedido}`)
  if (pedido * variaveisPorLinha > LIMITE_DE_PARAMETROS_POSTGRES) {
    throw new Error(
      `lote de ${pedido} linhas × ${variaveisPorLinha} parâmetros passa do teto de ${LIMITE_DE_PARAMETROS_POSTGRES} parâmetros`,
    )
  }
  return pedido
}

/** A coluna da tabela com a chave TS `chave` (ex.: `atualizadoEm`), ou erro alto. */
function colunaDe(tabela: Table, chave: string): Column {
  const coluna = (getTableColumns(tabela) as Record<string, Column>)[chave]
  if (!coluna) throw new Error(`coluna desconhecida: ${chave}`)
  return coluna
}

/**
 * As linhas de um `VALUES` solto, `(CAST($1 AS text), CAST($2 AS bigint), …), (…)`, nas colunas `chaves`
 * (chaves TS da tabela) e nessa ordem. O CAST é por coluna porque, fora de um `INSERT … VALUES` direto,
 * o Postgres tipa cada valor pelo parâmetro — texto —, e `bigint = text` ou `SET boolean = text` falham
 * (lição da Fase 1). O valor passa pelo codificador da coluna, como num `insert()` do Drizzle.
 */
export function valoresTipados(
  tabela: Table,
  chaves: readonly string[],
  linhas: readonly Record<string, unknown>[],
): SQL {
  const colunas = chaves.map((k) => colunaDe(tabela, k))
  return sql.join(
    linhas.map(
      (l) =>
        sql`(${sql.join(
          colunas.map((c, i) => sql`CAST(${sql.param(l[chaves[i]] ?? null, c)} AS ${sql.raw(c.getSQLType())})`),
          sql`, `,
        )})`,
    ),
    sql`, `,
  )
}

/**
 * INSERT multi-VALUES em fatias, todas no executor recebido (passe o `tx` para que as fatias sejam
 * atômicas juntas; com `db`, cada fatia é atômica sozinha).
 *
 * `conflito`: `alvo` são as colunas do índice único (`alvoOnde` repete o predicado de um índice PARCIAL);
 * sem `atualizar` vira `DO NOTHING`; `atualizar` como lista de chaves TS copia o valor proposto
 * (`excluded.coluna`), e como objeto é o `set` do Drizzle (expressões com `excluded.*` à vontade).
 * Atenção: no Postgres, duas linhas da MESMA instrução com a mesma chave de conflito e `DO UPDATE`
 * falham (`cannot affect row a second time`) — quem chama junta as repetidas antes.
 */
export async function inserirEmLotes<T extends PgTable>(
  tx: ExecutorDb,
  tabela: T,
  linhas: readonly T['$inferInsert'][],
  opcoes: {
    conflito?: {
      alvo: IndexColumn | IndexColumn[]
      alvoOnde?: SQL
      atualizar?: ReadonlyArray<keyof T['$inferInsert'] & string> | PgUpdateSetSource<T>
      atualizarOnde?: SQL
    }
    tamanho?: number
  } = {},
): Promise<ResultadoDeLotes> {
  const resultado: ResultadoDeLotes = { instrucoes: 0, linhas: 0 }
  if (!linhas.length) return resultado
  // Pior caso: todas as colunas da tabela como parâmetro (o Drizzle manda `default` nas que faltam).
  const tamanho = linhasPorInstrucao(Object.keys(getTableColumns(tabela)).length, opcoes.tamanho)
  const { conflito } = opcoes
  const set: PgUpdateSetSource<T> | undefined = Array.isArray(conflito?.atualizar)
    ? (Object.fromEntries(
        (conflito.atualizar as readonly string[]).map((k) => [
          k,
          sql`excluded.${sql.identifier(colunaDe(tabela, k).name)}`,
        ]),
      ) as PgUpdateSetSource<T>)
    : (conflito?.atualizar as PgUpdateSetSource<T> | undefined)
  for (const fatia of emLotes(linhas, tamanho)) {
    const insert = tx.insert(tabela).values(fatia as T['$inferInsert'][])
    const r = await (!conflito
      ? insert
      : set
        ? insert.onConflictDoUpdate({
            target: conflito.alvo,
            targetWhere: conflito.alvoOnde,
            set,
            setWhere: conflito.atualizarOnde,
          })
        : insert.onConflictDoNothing({ target: conflito.alvo, where: conflito.alvoOnde }))
    resultado.instrucoes += 1
    resultado.linhas += linhasAfetadas(r)
  }
  return resultado
}

/**
 * UPDATE de N linhas por instrução, cada uma com os SEUS valores:
 *
 *   UPDATE t SET c = v.c, … FROM (VALUES (CAST(…), …), …) AS v(chave, c, …) WHERE t.chave = v.chave [AND onde]
 *
 * As linhas trazem a `chave` (chave TS, ex.: `id`) e as colunas a mudar — as mesmas em todas. `onde` é
 * a condição fixa a mais (ex.: `user_id = ?`, para não tocar linha de outro usuário). Mesma chave repetida:
 * vale a ÚLTIMA, como valia com um UPDATE por linha em sequência (num UPDATE … FROM só, o Postgres
 * escolheria uma qualquer). `linhas` no retorno conta linhas distintas.
 */
export async function atualizarEmLotes<T extends PgTable>(
  tx: ExecutorDb,
  tabela: T,
  linhas: readonly Record<string, unknown>[],
  opcoes: { chave: string; onde?: SQL; tamanho?: number },
): Promise<ResultadoDeLotes> {
  const resultado: ResultadoDeLotes = { instrucoes: 0, linhas: 0 }
  if (!linhas.length) return resultado
  const chaves = Object.keys(linhas[0])
  if (!chaves.includes(opcoes.chave)) throw new Error(`as linhas não trazem a chave ${opcoes.chave}`)
  const campos = chaves.filter((k) => k !== opcoes.chave)
  if (!campos.length) throw new Error('nada a atualizar: as linhas só trazem a chave')
  const assinatura = [...chaves].sort().join(',')
  const ultimas = new Map<unknown, Record<string, unknown>>()
  for (const l of linhas) {
    if (Object.keys(l).sort().join(',') !== assinatura) throw new Error('as linhas precisam trazer as mesmas colunas')
    ultimas.delete(l[opcoes.chave])
    ultimas.set(l[opcoes.chave], l)
  }
  const ordem = [opcoes.chave, ...campos]
  const colunaDaChave = colunaDe(tabela, opcoes.chave)
  const nomes = sql.join(
    ordem.map((k) => sql.identifier(colunaDe(tabela, k).name)),
    sql`, `,
  )
  const atribuicoes = sql.join(
    campos.map((k) => {
      const nome = sql.identifier(colunaDe(tabela, k).name)
      return sql`${nome} = v.${nome}`
    }),
    sql`, `,
  )
  const tamanho = linhasPorInstrucao(ordem.length, opcoes.tamanho)
  for (const fatia of emLotes([...ultimas.values()], tamanho)) {
    const r = await tx.execute(sql`
      UPDATE ${tabela} SET ${atribuicoes}
      FROM (VALUES ${valoresTipados(tabela, ordem, fatia)}) AS v(${nomes})
      WHERE ${colunaDaChave} = v.${sql.identifier(colunaDaChave.name)}${opcoes.onde ? sql` AND ${opcoes.onde}` : sql``}`)
    resultado.instrucoes += 1
    resultado.linhas += linhasAfetadas(r)
  }
  return resultado
}
