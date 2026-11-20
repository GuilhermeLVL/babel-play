#!/usr/bin/env node
/**
 * CUSTO DOS DELETES FÍSICOS COM AS CHAVES ESTRANGEIRAS ATIVAS (auditoria de performance do backend,
 * 26/09/2026).
 *
 *   node scripts/perf/consultas/medir-exclusoes.mjs --db=<CÓPIA: diretório do pglite | postgres://…>
 *        [--sessao=s-u-p-0003-0:u-p-0003] [--contas=u-m-0005,u-p-0004]
 *
 * APAGA DADOS: use sempre uma CÓPIA (o script recusa um `--db` cujo nome não contenha "copia"). Com
 * PGlite, com o servidor parado. Os índices das FKs (antes a migração 0034) já nascem na baseline do
 * Postgres, então não há mais o passo `--com-0034`; `fks-sem-indice.mjs` confere se algum faltou.
 *
 * Mede, abrindo o banco como `contar-linhas.mjs` (PGlite ou `pg`):
 *   1. o DELETE das falas de uma sessão — o `stmtDeleteForSession` de `PUT /api/sessions/:id/utterances`;
 *   2. a exclusão de conta — os DELETEs de `contaRepo.excluir` na MESMA ordem de `TABELAS_DO_TITULAR`,
 *      numa transação (o `db.batch` do repositório é uma transação na mesma conexão).
 * Cada medida é o tempo em que o event loop fica preso (o driver é síncrono).
 */
import path from 'node:path'

import { abrirAlvo } from '../contar-linhas.mjs'

const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const banco = arg('db', '')
if (!banco || !/copia/i.test(path.basename(banco.replace(/\/+$/, '')))) {
  console.error('uso: --db=<diretório do pglite ou postgres:// com "copia" no nome> — este script APAGA linhas')
  process.exit(2)
}
const db = await abrirAlvo(banco)
/** DELETE que devolve quantas linhas apagou. */
const apagar = async (sql, params) =>
  (await db.consultar(`WITH d AS (${sql} RETURNING 1) SELECT count(*)::int AS n FROM d`, params))[0].n

const medir = async (rotulo, fn) => {
  const t = performance.now()
  const r = await fn()
  const ms = Math.round((performance.now() - t) * 10) / 10
  console.log(JSON.stringify({ rotulo, ms, ...r }))
  return ms
}

const [sessao, dono] = arg('sessao', 's-u-p-0003-0:u-p-0003').split(':')
await medir(`DELETE falas da sessao ${sessao}`, async () => ({
  linhas: await apagar('DELETE FROM utterances WHERE session_id = $1 AND user_id = $2', [sessao, dono]),
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
  (await db.consultar(`select table_name from information_schema.tables where table_schema = 'public'`)).map(
    (r) => r.table_name,
  ),
)
for (const u of arg('contas', 'u-m-0005,u-p-0004').split(',').filter(Boolean)) {
  await medir(`exclusao da conta ${u}`, async () => {
    const porTabela = {}
    await db.consultar('BEGIN')
    try {
      for (const t of ORDEM) {
        if (!existentes.has(t)) continue
        const a = performance.now()
        const n = await apagar(`DELETE FROM "${t}" WHERE user_id = $1`, [u])
        if (n) porTabela[t] = { linhas: n, ms: Math.round(performance.now() - a) }
      }
      await apagar('DELETE FROM versoes_de_dados WHERE user_id = $1', [u])
      await apagar('DELETE FROM users WHERE id = $1', [u])
      await db.consultar('COMMIT')
    } catch (e) {
      await db.consultar('ROLLBACK')
      throw e
    }
    return { porTabela }
  })
}
await db.fechar()
