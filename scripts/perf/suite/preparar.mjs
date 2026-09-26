#!/usr/bin/env node
/**
 * PREPARA O BANCO DA SUÍTE DE CARGA (Fase 4 da auditoria de prontidão).
 *
 *   node scripts/perf/suite/preparar.mjs --db=<arquivo.db> [--pesados=50] [--medios=2000] [--leves=0]
 *
 * 1. Aplica as migrations REAIS (`server/db/migrations`) com o migrador do Drizzle — sem `tsx`, para
 *    rodar igual no CI.
 * 2. Semeia com `scripts/perf/escala/semear.mjs` (o mesmo gerador determinístico da Fase 2).
 * 3. Dá a cada usuário semeado o que a mistura realista precisa e o semeador da Fase 2 não dá:
 *    - uma ASSINATURA ativa (`pro` nos ímpares, `essencial` nos pares), porque STT e MT gerenciados
 *      exigem o entitlement — sem ela todo pedido de IA seria 402 e a suíte mediria só a recusa;
 *    - um crédito de Seeds (`seed_credits`), porque a loja (`seeds/gastar`) recusa com 402 quem não
 *      tem saldo, e o usuário médio semeado tem poucos exercícios.
 *
 * Idempotente só no sentido de "recria": apaga o arquivo antes.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import Database from 'libsql'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d

/** Prepara o banco e devolve as contagens. Exportada para o `rodar.mjs` e o CI. */
export async function preparar({ db: arquivo, pesados = 50, medios = 2000, leves = 0 }) {
  const abs = path.resolve(arquivo)
  mkdirSync(path.dirname(abs), { recursive: true })
  for (const s of ['', '-wal', '-shm']) if (existsSync(abs + s)) rmSync(abs + s)

  const t0 = performance.now()
  const client = createClient({ url: `file:${abs.replace(/\\/g, '/')}` })
  await migrate(drizzle(client), { migrationsFolder: path.join(RAIZ, 'server/db/migrations') })
  client.close()
  const msMigrar = Math.round(performance.now() - t0)

  const r = spawnSync(
    process.execPath,
    [
      path.join(RAIZ, 'scripts/perf/escala/semear.mjs'),
      `--db=${abs}`,
      `--pesados=${pesados}`,
      `--leves=${leves}`,
      `--medios=${medios}`,
      '--mega-sessoes=5',
    ],
    { cwd: RAIZ, encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`semear.mjs falhou (${r.status}): ${r.stderr || r.stdout}`)
  const semeado = JSON.parse(r.stdout.trim().split('\n').at(-1))

  const db = new Database(abs)
  db.exec('PRAGMA journal_mode=WAL;')
  const agora = Date.now()
  const fimDoPeriodo = agora + 30 * 86_400_000
  const usuarios = db.prepare(`select id from users where id like 'u-%'`).all()
  const assinatura = db.prepare(
    `insert into subscriptions (id, created_at, updated_at, user_id, plan, status, current_period_end) values (?, ?, ?, ?, ?, 'active', ?)`,
  )
  const credito = db.prepare(
    `insert into seed_credits (id, created_at, updated_at, user_id, credito_id, amount, xp, reason) values (?, ?, ?, ?, ?, 100000, 0, 'perf:suite')`,
  )
  db.transaction(() => {
    usuarios.forEach(({ id }, i) => {
      assinatura.run(`sub-${id}`, agora, agora, id, i % 2 ? 'pro' : 'essencial', fimDoPeriodo)
      credito.run(`cred-${id}`, agora, agora, id, `perf-suite-${id}`)
    })
  })()
  db.exec('PRAGMA wal_checkpoint(TRUNCATE); ANALYZE;')
  db.close()
  return { ...semeado, assinaturas: usuarios.length, msMigrar, msTotal: Math.round(performance.now() - t0) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = arg('db', '')
  if (!db) {
    console.error('uso: node scripts/perf/suite/preparar.mjs --db=<arquivo.db> [--pesados=50] [--medios=2000]')
    process.exit(2)
  }
  const r = await preparar({
    db,
    pesados: Number(arg('pesados', 50)),
    medios: Number(arg('medios', 2000)),
    leves: Number(arg('leves', 0)),
  })
  console.log(JSON.stringify(r))
}
