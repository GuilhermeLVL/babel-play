#!/usr/bin/env node
/**
 * ORÇAMENTO DE TAMANHO POR USUÁRIO NO BANCO (openspec `modelo-do-aluno-e-dados`, 2.4b).
 *
 *   node scripts/perf/escala/tamanho-por-usuario.mjs [--pesados=3] [--teto-kb=<slo.json>] [--saida=<arquivo.json>]
 *
 * Aplica as migrações PG REAIS num PGlite (motor Postgres: `pg_total_relation_size` mede heap, TOAST e índices como o
 * Postgres de produção), semeia usuários "pesados" sintéticos (`semear.mjs`: 3.000 cartões, 1.000 revisões, 1.000
 * exercícios, 20 sessões x 100 falas) e atribui a cada usuário uma FATIA de cada tabela com `user_id`: o tamanho total da
 * relação (com índices) vezes a parte das linhas dele. Soma as fatias e compara com o teto `banco.porUsuarioPesadoMaxKB`
 * de `scripts/perf/suite/slo.json` (o MESMO número de `docs/slo.md`). Sai 1 se o usuário pesado passar do teto.
 * O `local-owner` (mega) é semeado pelo gerador, mas fica de fora da conta: só os `u-p-*` entram.
 * Não mede o que ainda não foi derivado: `agregados_diarios` e `estado_por_item` nascem vazios no semeador.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

import { carregarSlo } from '../suite/slo.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const arg = (n, d) => process.argv.find((x) => x.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d

/**
 * A fatia de cada usuário em cada tabela. Pura (o teste a cobre).
 * `tabelas`: [{ nome, bytes, total, porUsuario: { [id]: linhas } }] -> { [id]: bytes }.
 */
export function fatiasPorUsuario(tabelas) {
  const soma = {}
  for (const t of tabelas) {
    if (!(t.total > 0)) continue
    for (const [id, n] of Object.entries(t.porUsuario)) soma[id] = (soma[id] ?? 0) + (t.bytes * n) / t.total
  }
  return soma
}

/** O veredito: o maior usuário pesado contra o teto em KB. Pura. */
export function avaliarTamanho(bytesPorUsuario, tetoKb) {
  const kbs = Object.values(bytesPorUsuario).map((b) => b / 1024)
  const maiorKb = kbs.length ? Math.max(...kbs) : 0
  const mediaKb = kbs.length ? kbs.reduce((a, b) => a + b, 0) / kbs.length : 0
  const falhas = []
  if (!kbs.length) falhas.push('nenhum usuário medido')
  else if (maiorKb > tetoKb) falhas.push(`usuário pesado com ${maiorKb.toFixed(0)} KB > teto de ${tetoKb} KB`)
  return { maiorKb, mediaKb, tetoKb, falhas }
}

async function medir(db, prefixo) {
  const nomes = (
    await db.query(
      `select c.table_name n from information_schema.columns c join information_schema.tables t
         on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
       where c.table_schema = 'public' and c.column_name = 'user_id' order by 1`,
    )
  ).rows.map((r) => r.n)
  const tabelas = []
  for (const nome of nomes) {
    const bytes = Number((await db.query(`select pg_total_relation_size('public."${nome}"') b`)).rows[0].b)
    const total = Number((await db.query(`select count(*) n from "${nome}"`)).rows[0].n)
    const porUsuario = {}
    const grupos = await db.query(
      `select user_id id, count(*) n from "${nome}" where user_id like $1 group by user_id`,
      [`${prefixo}%`],
    )
    for (const r of grupos.rows) porUsuario[r.id] = Number(r.n)
    tabelas.push({ nome, bytes, total, porUsuario })
  }
  return tabelas
}

async function principal() {
  const slo = carregarSlo()
  const tetoKb = Number(arg('teto-kb', slo.banco?.porUsuarioPesadoMaxKB))
  const pesados = Number(arg('pesados', 3))
  if (!(tetoKb > 0) || !(pesados > 0)) {
    console.error(
      'uso: node scripts/perf/escala/tamanho-por-usuario.mjs [--pesados=3] [--teto-kb=N] [--saida=arq.json]',
    )
    return 2
  }
  const tmp = mkdtempSync(path.join(tmpdir(), 'tamanho-por-usuario-'))
  const dir = path.join(tmp, 'pg')
  try {
    const pg = new PGlite(dir)
    await migrate(drizzle(pg), { migrationsFolder: path.join(RAIZ, 'server/db/migrations-pg') })
    await pg.close()
    const r = spawnSync(
      process.execPath,
      [
        path.join(RAIZ, 'scripts/perf/escala/semear.mjs'),
        `--db=${dir}`,
        `--pesados=${pesados}`,
        '--leves=0',
        '--mega-sessoes=1',
      ],
      { cwd: RAIZ, encoding: 'utf8' },
    )
    if (r.status !== 0) throw new Error(`semear.mjs falhou (${r.status}): ${r.stderr || r.stdout}`)
    const db = new PGlite(dir)
    await db.exec('ANALYZE')
    const tabelas = await medir(db, 'u-p-')
    await db.close()
    const por = fatiasPorUsuario(tabelas)
    const v = avaliarTamanho(por, tetoKb)
    const maiores = tabelas
      .map((t) => ({
        nome: t.nome,
        kbPorPesado: t.total > 0 ? (t.bytes * (Object.values(t.porUsuario)[0] ?? 0)) / t.total / 1024 : 0,
      }))
      .sort((a, b) => b.kbPorPesado - a.kbPorPesado)
      .slice(0, 5)
    console.log(
      `usuários pesados medidos: ${Object.keys(por).length} · maior ${v.maiorKb.toFixed(0)} KB · média ${v.mediaKb.toFixed(0)} KB · teto ${tetoKb} KB`,
    )
    for (const m of maiores) console.log(`  ${m.nome.padEnd(24)} ${m.kbPorPesado.toFixed(0)} KB`)
    const saida = arg('saida', '')
    if (saida) writeFileSync(saida, JSON.stringify({ ...v, maiores }, null, 2))
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### Tamanho por usuário pesado (PG)\n\nmaior ${v.maiorKb.toFixed(0)} KB, média ${v.mediaKb.toFixed(0)} KB, teto ${tetoKb} KB: ${v.falhas.length ? `**reprovou** (${v.falhas.join('; ')})` : 'ok'}\n`,
      )
    }
    if (v.falhas.length) {
      console.error(
        `\nORÇAMENTO DE TAMANHO REPROVADO: ${v.falhas.join('; ')}.\nSe o aumento é de propósito, mude slo.json (banco.porUsuarioPesadoMaxKB) e docs/slo.md juntos, com a justificativa.`,
      )
      return 1
    }
    console.log('\norçamento de tamanho ok')
    return 0
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal().then(
    (c) => process.exit(c),
    (e) => {
      console.error(`tamanho-por-usuario FALHOU: ${e?.stack ?? e}`)
      process.exit(1)
    },
  )
}
