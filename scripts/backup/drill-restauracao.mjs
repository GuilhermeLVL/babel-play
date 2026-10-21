#!/usr/bin/env node
/**
 * EXERCÍCIO DE RESTAURAÇÃO DO PG_DUMP: prova que um dump restaura com as mesmas contagens de linhas.
 *
 *   node scripts/backup/drill-restauracao.mjs --origem <URL> --destino <URL vazia> [--dump <arq>] [--manter]
 *   node scripts/backup/drill-restauracao.mjs --dump <arq> --destino <URL vazia>            (sem origem)
 * RECOMENDADO: passe as URLs pelo ambiente (`DRILL_ORIGEM`, `DRILL_DESTINO`), usadas quando a flag falta: URL
 * com senha no argv aparece em `ps` e no histórico do shell.
 *
 * - Com `--origem` e sem `--dump`: faz o `pg_dump` da origem (mesmo comando do backup semanal).
 * - Com `--origem`: compara `count(*)` de todas as tabelas de `public` + `drizzle.__drizzle_migrations`.
 * - Sem `--origem` (workflow, onde só há o dump do R2): restaura e exige tabelas e migrações registradas.
 * - RECUSA destino que já tenha qualquer tabela em `public` (saída 2): o exercício nunca sobrescreve dado.
 * - Credenciais só por `PG*` no ambiente dos filhos, nunca no argv (ver `scripts/db/comando-pg-dump.mjs`).
 *   TLS: `sslmode` vem da URL; com `verify-full`, `PGSSLROOTCERT` tem de estar no ambiente (nunca rebaixa).
 * - Imprime a tabela Markdown (só contagens, nenhuma linha). Saída: 0 ok, 1 reprovado, 2 uso/destino.
 * Requer `pg_dump`/`pg_restore`/`psql` (cliente 17) no PATH. Só módulos `node:`.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { montarPgDump } from '../db/comando-pg-dump.mjs'
import { compararContagens, destinoLivre, tabelaMarkdown, validarRestaurado } from './compararContagens.mjs'

class ErroDeUso extends Error {}

/** Ambiente do filho para uma URL (PG*), e erro claro se faltar a CA do verify-full. */
function ambienteDe(url) {
  const { env } = montarPgDump(url, '')
  if (env.PGSSLMODE === 'verify-full' && !env.PGSSLROOTCERT) {
    throw new ErroDeUso(
      'sslmode=verify-full exige PGSSLROOTCERT no ambiente (ex.: data/supabase-ca.crt); não rebaixo o TLS',
    )
  }
  return env
}

function rodar(programa, args, env, { capturar = false } = {}) {
  const r = spawnSync(programa, args, {
    env,
    encoding: 'utf8',
    stdio: ['ignore', capturar ? 'pipe' : 'inherit', 'inherit'],
  })
  if (r.error) throw new Error(`${programa}: ${r.error.message}`)
  if (r.status !== 0) throw new Error(`${programa} saiu com código ${r.status}`)
  return r.stdout ?? ''
}

const psql = (env, sql) =>
  rodar('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], env, { capturar: true }).trim()
const ident = (n) => `"${n.replaceAll('"', '""')}"`

function contar(env) {
  const tabelas = psql(env, "select tablename from pg_tables where schemaname = 'public' order by 1")
    .split('\n')
    .filter(Boolean)
  const contagens = {}
  for (const t of tabelas) contagens[t] = Number(psql(env, `select count(*) from public.${ident(t)}`))
  const temMigracoes = psql(env, "select to_regclass('drizzle.__drizzle_migrations') is not null") === 't'
  if (temMigracoes)
    contagens.__drizzle_migrations = Number(psql(env, 'select count(*) from drizzle.__drizzle_migrations'))
  return contagens
}

function main() {
  const { values } = parseArgs({
    options: {
      origem: { type: 'string' },
      destino: { type: 'string' },
      dump: { type: 'string' },
      manter: { type: 'boolean' },
    },
  })
  // Preferir o ambiente: URL com senha no argv aparece em `ps` e no histórico do shell.
  values.origem ??= process.env.DRILL_ORIGEM || undefined
  values.destino ??= process.env.DRILL_DESTINO || undefined
  if (!values.destino || (!values.origem && !values.dump)) {
    throw new ErroDeUso(
      'uso: drill-restauracao.mjs --destino <URL vazia> (--origem <URL> | --dump <arq>) [--dump <arq>] [--manter]',
    )
  }
  const envDestino = ambienteDe(values.destino)
  const envOrigem = values.origem ? ambienteDe(values.origem) : null

  // Destino primeiro: se não estiver vazio, nada mais acontece (nem o dump da origem).
  // Estrito: só o texto exato `0` libera. Saída vazia ou estranha (NaN) NÃO pode passar por "vazio".
  const existentes = psql(envDestino, "select count(*) from pg_tables where schemaname = 'public'").trim()
  if (!destinoLivre(existentes)) {
    throw new ErroDeUso(
      `destino recusado: ${/^\d+$/.test(existentes) ? `já tem ${existentes} tabela(s) em public` : 'não consegui confirmar que public está vazio'}. Use um banco VAZIO (nunca o de produção)`,
    )
  }

  let dump = values.dump
  let tmp = null
  try {
    if (!dump) {
      tmp = mkdtempSync(join(tmpdir(), 'drill-'))
      dump = join(tmp, 'origem.dump')
      const cmd = montarPgDump(values.origem, dump, process.env)
      console.error('pg_dump da origem…')
      rodar(cmd.programa, cmd.args, cmd.env)
    }
    if (!(statSync(dump).size > 0)) throw new Error('dump vazio')
    const lista = rodar('pg_restore', ['--list', dump], envDestino, { capturar: true })
    console.error(
      `dump legível: ${lista.split('\n').filter((l) => l.includes('TABLE DATA')).length} tabela(s) com dados`,
    )

    console.error('pg_restore no destino…')
    // O dump por `--schema` não leva o CREATE SCHEMA do `drizzle`; o `public` já vem no banco novo.
    psql(envDestino, 'create schema if not exists drizzle')
    // `--no-privileges` porque os GRANT do Supabase citam papéis (anon, service_role…) que não existem num Postgres novo.
    rodar(
      'pg_restore',
      [
        '--no-owner',
        '--no-privileges',
        '--schema=public',
        '--schema=drizzle',
        `--dbname=${envDestino.PGDATABASE}`,
        dump,
      ],
      envDestino,
    )

    const restaurado = contar(envDestino)
    let ok
    if (envOrigem) {
      const origem = contar(envOrigem)
      const r = compararContagens(origem, restaurado)
      ok = r.ok
      console.log(tabelaMarkdown(origem, restaurado))
      if (!ok) console.error(`REPROVADO: ${r.faltantes.length} faltante(s), ${r.divergentes.length} divergente(s)`)
    } else {
      const v = validarRestaurado(restaurado)
      ok = v.ok
      console.log(tabelaMarkdown(null, restaurado))
      if (!ok) console.error(`REPROVADO: ${v.motivos.join('; ')}`)
    }
    if (ok) console.error(`OK: ${Object.keys(restaurado).length} tabela(s) conferidas`)
    return ok ? 0 : 1
  } finally {
    if (tmp && !values.manter) rmSync(tmp, { recursive: true, force: true })
    else if (tmp) console.error(`dump mantido em ${dump}`)
  }
}

try {
  process.exitCode = main()
} catch (e) {
  // Opção desconhecida (`--help`…) é erro de uso, não falha do exercício.
  const uso =
    e instanceof ErroDeUso ||
    e?.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' ||
    e?.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE'
  console.error(uso ? e.message : `falha: ${e.message}`)
  process.exitCode = uso ? 2 : 1
}
