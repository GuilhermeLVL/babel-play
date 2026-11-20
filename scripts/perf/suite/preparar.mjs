#!/usr/bin/env node
/**
 * PREPARA O BANCO DA SUÍTE DE CARGA (Fase 4 da auditoria de prontidão).
 *
 *   node scripts/perf/suite/preparar.mjs --db=<diretório do pglite> [--pesados=50] [--medios=2000] [--leves=0]
 *
 * 1. Aplica as migrations REAIS (`server/db/migrations-pg`) com o migrador do Drizzle sobre o PGlite — sem `tsx`, para
 *    rodar igual no CI.
 * 2. Semeia com `scripts/perf/escala/semear.mjs` (o mesmo gerador determinístico da Fase 2).
 * 3. Dá a cada usuário semeado o que a mistura realista precisa e o semeador da Fase 2 não dá:
 *    - uma ASSINATURA ativa (`pro` nos ímpares, `essencial` nos pares), porque STT e MT gerenciados
 *      exigem o entitlement — sem ela todo pedido de IA seria 402 e a suíte mediria só a recusa;
 *    - um crédito de Seeds (`seed_credits`), porque a loja (`seeds/gastar`) recusa com 402 quem não
 *      tem saldo, e o usuário médio semeado tem poucos exercícios.
 *
 * Idempotente só no sentido de "recria": apaga o diretório antes.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d

/** Prepara o banco e devolve as contagens. Exportada para o `rodar.mjs` e o CI. */
export async function preparar({ db: diretorio, pesados = 50, medios = 2000, leves = 0 }) {
  const abs = path.resolve(diretorio)
  mkdirSync(path.dirname(abs), { recursive: true })
  if (existsSync(abs)) rmSync(abs, { recursive: true, force: true })

  const t0 = performance.now()
  const pg = new PGlite(abs)
  await migrate(drizzle(pg), { migrationsFolder: path.join(RAIZ, 'server/db/migrations-pg') })
  await pg.close()
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

  const db = new PGlite(abs)
  const agora = Date.now()
  const fimDoPeriodo = agora + 30 * 86_400_000
  const usuarios = (await db.query(`select id from users where id like 'u-%'`)).rows
  await db.exec('BEGIN')
  for (const [i, { id }] of usuarios.entries()) {
    await db.query(
      `insert into subscriptions (id, created_at, updated_at, user_id, plan, status, current_period_end) values ($1, $2, $3, $4, $5, 'active', $6)`,
      [`sub-${id}`, agora, agora, id, i % 2 ? 'pro' : 'essencial', fimDoPeriodo],
    )
    await db.query(
      `insert into seed_credits (id, created_at, updated_at, user_id, credito_id, amount, xp, reason) values ($1, $2, $3, $4, $5, 100000, 0, 'perf:suite')`,
      [`cred-${id}`, agora, agora, id, `perf-suite-${id}`],
    )
  }
  await db.exec('COMMIT')
  await db.exec('ANALYZE')
  await db.close()
  return { ...semeado, assinaturas: usuarios.length, msMigrar, msTotal: Math.round(performance.now() - t0) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = arg('db', '')
  if (!db) {
    console.error('uso: node scripts/perf/suite/preparar.mjs --db=<diretório do pglite> [--pesados=50] [--medios=2000]')
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
