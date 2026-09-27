#!/usr/bin/env node
/**
 * CUSTO DOS DELETES FÍSICOS COM `foreign_keys = ON` — antes e depois da migração 0034
 * (auditoria de performance do backend, 26/09/2026).
 *
 *   node scripts/perf/consultas/medir-exclusoes.mjs --db=<CÓPIA do banco semeado> [--com-0034]
 *        [--sessao=s-u-p-0003-0:u-p-0003] [--contas=u-m-0005,u-p-0004]
 *
 * APAGA DADOS: use sempre uma CÓPIA (o script recusa um arquivo cujo nome não contenha "copia").
 * Com `--com-0034`, aplica antes a migração `0034_indices_das_chaves_estrangeiras.sql` e mede quanto
 * ela leva (é o que o boot do deploy paga uma vez).
 *
 * Mede, com o driver síncrono `libsql` e os PRAGMAs de `server/db/db.ts`:
 *   1. o DELETE das falas de uma sessão — o `stmtDeleteForSession` de `PUT /api/sessions/:id/utterances`;
 *   2. a exclusão de conta — os DELETEs de `contaRepo.excluir` na MESMA ordem de `TABELAS_DO_TITULAR`,
 *      numa transação (o `db.batch` do repositório é uma transação na mesma conexão).
 * Cada medida é o tempo em que o event loop fica preso (o driver é síncrono).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Database from 'libsql'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const banco = arg('db', '')
if (!banco || !/copia/i.test(path.basename(banco))) {
  console.error('uso: --db=<arquivo com "copia" no nome> — este script APAGA linhas')
  process.exit(2)
}
const db = new Database(banco)
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;')

const medir = (rotulo, fn) => {
  const t = performance.now()
  const r = fn()
  const ms = Math.round((performance.now() - t) * 10) / 10
  console.log(JSON.stringify({ rotulo, ms, ...r }))
  return ms
}

if (process.argv.includes('--com-0034')) {
  const sql = readFileSync(
    path.join(RAIZ, 'server/db/migrations/0034_indices_das_chaves_estrangeiras.sql'),
    'utf8',
  ).replace(/--> statement-breakpoint/g, '')
  medir('migracao 0034 (CREATE INDEX x8)', () => (db.exec(sql), {}))
}

const [sessao, dono] = arg('sessao', 's-u-p-0003-0:u-p-0003').split(':')
medir(`DELETE falas da sessao ${sessao}`, () => ({
  linhas: db.prepare('DELETE FROM utterances WHERE session_id = ? AND user_id = ?').run(sessao, dono).changes,
}))

/* A ordem de `TABELAS_DO_TITULAR` (server/db/repositories/conta.ts), com os nomes das tabelas no banco. */
const ORDEM = [
  'vocab_occurrences',
  'review_logs',
  'exercise_results',
  'utterances',
  'anki_notes',
  'anki_imports',
  'anki_decks',
  'vocab_cards',
  'sessions',
  'settings',
  'user_interests',
  'provider_credentials',
  'seed_spends',
  'seed_credits',
  'credit_purchases',
  'credit_spends',
  'presencas',
  'subscriptions',
  'billing_events',
  'usage_counters',
  'vinculos_de_responsavel',
  'idades_declaradas',
  'convidados',
]
const existentes = new Set(
  db
    .prepare(`select name from sqlite_master where type='table'`)
    .all()
    .map((r) => r.name),
)
for (const u of arg('contas', 'u-m-0005,u-p-0004').split(',').filter(Boolean)) {
  medir(`exclusao da conta ${u}`, () => {
    const porTabela = {}
    db.exec('BEGIN')
    try {
      for (const t of ORDEM) {
        if (!existentes.has(t)) continue
        const a = performance.now()
        const n = db.prepare(`DELETE FROM "${t}" WHERE user_id = ?`).run(u).changes
        if (n) porTabela[t] = { linhas: n, ms: Math.round(performance.now() - a) }
      }
      db.prepare('DELETE FROM versoes_de_dados WHERE user_id = ?').run(u)
      db.prepare('DELETE FROM users WHERE id = ?').run(u)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
    return { porTabela }
  })
}
db.close()
