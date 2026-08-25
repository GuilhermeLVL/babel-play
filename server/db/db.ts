/**
 * Conexão do banco (libsql/SQLite). Instância única do Drizzle.
 * Troca para Postgres/Supabase = trocar este arquivo (createClient/driver);
 * o schema e os repositories não mudam.
 */
import 'dotenv/config'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import * as schema from './schema'

const url = process.env.DATABASE_URL ?? 'file:./data/babel.db'

/**
 * Arquivo local (`file:`) ou banco REMOTO libsql (`libsql://…` / `https://…`, ex.: Turso).
 * O driver é o mesmo; o que muda é o token e os PRAGMAs — WAL, synchronous e busy_timeout são
 * decisões do processo do SQLite, e num banco remoto quem as toma é o servidor deles. Aplicá-los
 * lá ou falha ou não faz nada; o boot não pode depender disso.
 */
export const bancoLocal = url.startsWith('file:')

// libsql não cria o diretório do arquivo — garantimos aqui p/ o dev nunca falhar.
if (bancoLocal) {
  mkdirSync(dirname(url.replace(/^file:/, '')), { recursive: true })
}

export const client = createClient(
  bancoLocal ? { url } : { url, authToken: process.env.DATABASE_AUTH_TOKEN },
)

/**
 * PRAGMAs de concorrência (auditoria P0-2). O default do SQLite é `journal_mode=delete`
 * com `busy_timeout=0`: o escritor toma lock EXCLUSIVO do arquivo e qualquer concorrente
 * leva SQLITE_BUSY na hora, sem esperar. Medido em scripts/audit/diag-wal.mjs:
 *
 *   2 processos → 21,5% das escritas falhavam   · com WAL + busy_timeout: 0%
 *   3 processos → 28,9% falhavam                · com WAL + busy_timeout: 0%
 *   1 processo  → 300 inserts em 894ms          · com WAL + NORMAL:      33ms
 *
 *  - WAL: leitores e UM escritor avançam em paralelo (o default serializa tudo).
 *  - busy_timeout: quem perde a corrida ESPERA até 5s em vez de falhar imediatamente.
 *  - synchronous=NORMAL: seguro sob WAL (não perde dado em crash de processo, só num
 *    corte de energia da máquina) e é o que remove o fsync por commit.
 *  - foreign_keys: o SQLite ignora FK por padrão — ligamos para as constraints valerem.
 *
 * ATENÇÃO ao alcance: isto resolve MÚLTIPLOS PROCESSOS NA MESMA MÁQUINA (deploy sem
 * downtime, modo cluster). NÃO habilita réplicas em hosts diferentes — WAL exige memória
 * compartilhada e não funciona sobre NFS/SMB. Para multi-host, só Postgres.
 *
 * `journal_mode` é persistente no arquivo; os demais são por conexão.
 */
/**
 * Aplica (ou REAPLICA) os PRAGMAs. Exportada porque eles são POR CONEXÃO e o libsql
 * descarta a conexão ao terminar uma transação — medido em
 * `scripts/audit/v2-diag-pragma-tx.mjs`:
 *
 *   depois de aplicar     busy_timeout = 5000
 *   DENTRO da transação   busy_timeout = 5000
 *   DEPOIS da transação   busy_timeout = 0     ← a conexão volta aos defaults
 *
 * Sem reaplicar, a primeira transação do processo desligaria silenciosamente o
 * `busy_timeout` de TODAS as queries seguintes — reintroduzindo o P0-2. Ver `emTransacao`.
 *
 * @returns o `journal_mode` EFETIVO — que pode não ser 'wal'.
 */
export async function aplicarPragmas(): Promise<{ journalMode: string }> {
  // Banco remoto: o servidor libsql gerencia journal/sync; só a FK é por conexão e vale pedir.
  if (!bancoLocal) {
    await client.execute('PRAGMA foreign_keys = ON').catch(() => {})
    return { journalMode: 'remoto' }
  }
  // Ordem importa: WAL primeiro, para os demais valerem sobre o modo novo.
  const r = await client.execute('PRAGMA journal_mode = WAL')
  await client.execute('PRAGMA busy_timeout = 5000')
  await client.execute('PRAGMA synchronous = NORMAL')
  await client.execute('PRAGMA foreign_keys = ON')
  return { journalMode: String(Object.values(r.rows[0] ?? {})[0] ?? '').toLowerCase() }
}

export const dbReady: Promise<void> = (async () => {
  const { journalMode } = await aplicarPragmas()
  // P1-N4: `PRAGMA journal_mode` DEVOLVE o modo resultante e não lança quando não pega —
  // em NFS/SMB ele volta 'delete' silenciosamente e a aplicação subiria achando que está
  // protegida contra a contenção entre processos. Denunciar é o mínimo.
  if (journalMode === 'remoto') {
    console.log('[db] banco remoto (libsql): journal e sync gerenciados pelo servidor do banco')
  } else if (journalMode !== 'wal') {
    console.error(
      `[db] ATENÇÃO: journal_mode ficou '${journalMode}', não 'wal'. A proteção contra ` +
      'SQLITE_BUSY entre processos NÃO está ativa (WAL exige memória compartilhada e não ' +
      'funciona sobre NFS/SMB). Rode um processo só, ou migre para Postgres.',
    )
  }
})()

// Falha aqui não deve derrubar o import (o boot reporta via dbReady); mas não pode
// virar unhandled rejection e matar o processo.
dbReady.catch((err) => {
  console.error('[db] falha ao aplicar PRAGMAs de concorrência:', String(err).slice(0, 160))
})

export const db = drizzle(client, { schema })
export type DB = typeof db

/** `db` ou uma transação — quem escreve em duas etapas aceita os dois (P1-N3). */
export type ExecutorDb = DB | Parameters<Parameters<DB['transaction']>[0]>[0]

/**
 * Roda `fn` numa transação e REAPLICA os PRAGMAs depois — sempre, inclusive em erro.
 *
 * ⚠ PREFIRA `db.batch([...])` quando as instruções são conhecidas de antemão. Medido em
 * `scripts/audit/v2-diag-batch.mjs`:
 *
 *   batch (mesma conexão)              150× em  38ms · pragmas preservados
 *   transaction + reaplicar pragmas    150× em 345ms · pragmas resetados
 *
 * `transaction()` do libsql roda em conexão NOVA, que nasce com `busy_timeout=0` e
 * `synchronous=FULL` — ou seja, fsync por commit, exatamente o que o WAL tinha eliminado.
 * Introduzir transações no caminho quente derrubou a escrita de 878 para 216 req/s.
 *
 * Use este wrapper só quando precisar de lógica condicional entre as instruções (ler algo e
 * decidir a próxima escrita) — aí o `batch` não serve e o custo é inevitável.
 */
export async function emTransacao<T>(fn: (tx: Parameters<Parameters<DB['transaction']>[0]>[0]) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(fn)
  } finally {
    // Best-effort: se o banco caiu, a reaplicação falha junto — e o erro original é o que importa.
    await aplicarPragmas().catch(() => {})
  }
}
