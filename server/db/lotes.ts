/**
 * LOTES contra o teto de variáveis do SQLite.
 *
 * O libsql compila o SQLite com `MAX_VARIABLE_NUMBER = 32766`: uma instrução com mais `?` do que
 * isso é recusada INTEIRA com "too many SQL variables". Não é um limite teórico — o schema aceita
 * 5.000 falas por sessão e o INSERT de falas usa 17 variáveis por linha, então a partir de 1.928
 * falas a sessão toda era recusada (P1 da auditoria de prontidão). Com o `inArray` e o `NOT IN`
 * do import Anki (até 50.000 notas) acontecia o mesmo a partir de ~32 mil.
 *
 * Toda lista que vem do usuário e vira variável de SQL passa por aqui. O tamanho do lote é
 * CALCULADO pelo número de variáveis por item, não fixado a olho: uma coluna nova na tabela não
 * pode reabrir o defeito em silêncio.
 */
import { getTableColumns, type Table } from 'drizzle-orm'

import type { DB } from './db'

/** Teto do SQLite embutido no libsql (`SQLITE_MAX_VARIABLE_NUMBER`). */
export const LIMITE_DE_VARIAVEIS_SQLITE = 32_766

/**
 * Orçamento por instrução, com margem sobre o teto: sobra espaço para as variáveis fixas que o
 * chamador esqueça de declarar e para um banco remoto (libsql/Turso) compilado com teto menor.
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
 * Quantas INSTRUÇÕES vão num `db.batch` quando o lote não precisa ser atômico como um todo (import
 * grande). Cada batch local é uma transação: um batch gigante seguraria o lock de escrita por
 * segundos, e o `busy_timeout` dos outros processos é de 5 s. Lotes deste tamanho mantêm cada
 * transação curta sem voltar a uma ida ao banco por item.
 */
export const INSTRUCOES_POR_BATCH = 500

/** Uma instrução aceita por `db.batch`. */
export type InstrucaoDeBatch = Parameters<DB['batch']>[0][number]

/**
 * `db.batch` exige tupla NÃO vazia no tipo. Quem monta a lista dinamicamente confere o
 * `length` antes e passa por aqui — em vez de espalhar o mesmo cast pelos repositórios.
 */
export function tuplaDeBatch(instrucoes: InstrucaoDeBatch[]): [InstrucaoDeBatch, ...InstrucaoDeBatch[]] {
  if (!instrucoes.length) throw new Error('batch vazio')
  return instrucoes as [InstrucaoDeBatch, ...InstrucaoDeBatch[]]
}
