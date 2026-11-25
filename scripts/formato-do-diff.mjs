#!/usr/bin/env node
/**
 * TRAVA DE FORMATO NA CI (change `formatacao-e-lint-estrito`, 1.6): `prettier --check` SÓ nos arquivos que o
 * PR altera. Impede a entrada de arquivo torto (commit com `--no-verify`, edição na web) sem reformatar o
 * repositório; a passada geral é outra tarefa (1.7).
 *
 * Uso: `node scripts/formato-do-diff.mjs [base]` (padrão: `HEAD^1`, o lado da base do commit de merge que o
 * `pull_request` do GitHub faz checkout; o `ci.yml` usa `fetch-depth: 2`).
 * Arquivos apagados, ignorados (`.prettierignore`) e de tipo desconhecido ficam de fora.
 */
import { spawnSync } from 'node:child_process'

const base = process.argv[2] ?? 'HEAD^1'

const diff = spawnSync('git', ['diff', '--name-only', '--diff-filter=d', '-z', base, 'HEAD'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
if (diff.status !== 0) {
  console.error(`formato-do-diff: não consegui ler o diff contra ${base}:\n${diff.stderr}`)
  process.exit(2)
}

const arquivos = diff.stdout.split('\0').filter(Boolean)
if (arquivos.length === 0) {
  console.log('formato-do-diff: nenhum arquivo alterado.')
  process.exit(0)
}

const r = spawnSync(
  'npx',
  ['prettier', '--check', '--ignore-unknown', '--no-error-on-unmatched-pattern', ...arquivos],
  { stdio: 'inherit' },
)
if (r.status !== 0) {
  console.error('\nformato-do-diff: arquivo(s) fora do padrão. Rode `npx prettier --write <arquivo>` e comite.')
}
process.exit(r.status ?? 1)
