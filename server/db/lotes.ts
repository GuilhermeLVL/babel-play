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
import { getTableColumns, type Table } from 'drizzle-orm'

import { emLote, type ExecutorDb } from './db'

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
