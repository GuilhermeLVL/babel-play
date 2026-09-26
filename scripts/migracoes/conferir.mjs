#!/usr/bin/env node
/**
 * PORTÃO DE MIGRATIONS EXPAND/CONTRACT — auditoria de prontidão, Fase 6.
 *
 * As migrations rodam NO BOOT e só para a frente (`server.ts` → `migrate`). Com uma máquina e
 * `--strategy immediate` (ADR 0006), o rollback de um deploy é trocar a IMAGEM — o banco não volta.
 * Uma imagem anterior sobre um banco migrado só funciona se a migration nova tiver apenas
 * ACRESCENTADO (expand). Por isso a regra da casa, agora cobrada:
 *
 *   1. EXPAND por padrão. Migration nova (número >= 0030) não pode ter `DROP TABLE`, `DROP COLUMN`,
 *      `RENAME` (tabela ou coluna) nem `ALTER ... NOT NULL` sem `DEFAULT` — tudo isso quebra a
 *      versão anterior do código, que é exatamente a que o rollback põe de volta no ar.
 *   2. CONTRACT só com marcador explícito: uma linha `-- CONTRATO: <justificativa>` na migration.
 *      E ela vem SOZINHA: no mesmo diff não pode haver mudança de código de servidor/cliente
 *      (fora `server/db/schema.ts`, que precisa acompanhar a migration, e `server/db/migrations/`).
 *      O código que parou de usar a coluna foi num deploy ANTERIOR; este só remove o que já não é lido.
 *      A conferência de "sozinha" usa `git diff` contra `--base` — sem base resolvível (push de
 *      branch nova, clone raso), só o marcador é cobrado, com aviso.
 *   3. Toda migration nova tem um comentário `REVERSAO:` (ou `REVERSÃO:`) dizendo como desfazer —
 *      é o que o runbook manda executar num rollback que precise do banco.
 *   4. Todo `.sql` está no `meta/_journal.json` e vice-versa (um arquivo fora do journal nunca roda).
 *
 *   node scripts/migracoes/conferir.mjs                       # regras 1, 3, 4 e o marcador da 2
 *   node scripts/migracoes/conferir.mjs --base=origin/main    # + "contrato vem sozinho" (git diff)
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** A partir desta migration as regras valem. As anteriores são história (0026 remove tabela órfã). */
export const A_PARTIR_DE = 30

const PASTA_PADRAO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'server', 'db', 'migrations')

/** Remove comentários `-- …` (até o fim da linha) e `/* … *\/`, para que o texto explicativo não conte como SQL. */
export function semComentarios(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

/** Comandos SQL da migration, já sem comentários (separados por `;` ou pelo breakpoint do drizzle). */
function comandos(sql) {
  return semComentarios(sql)
    .split(/;|-->\s*statement-breakpoint/)
    .map((c) => c.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

const DESTRUTIVOS = [
  { nome: 'DROP TABLE', teste: (c) => /\bDROP\s+TABLE\b/i.test(c) },
  {
    nome: 'DROP COLUMN',
    teste: (c) => /\bDROP\s+COLUMN\b/i.test(c) || /\bALTER\s+TABLE\b.*\bDROP\s+(?!INDEX|TRIGGER|VIEW)\w+/i.test(c),
  },
  { nome: 'RENAME', teste: (c) => /\bRENAME\b/i.test(c) },
  {
    nome: 'ALTER ... NOT NULL sem DEFAULT',
    teste: (c) => /^ALTER\b/i.test(c) && /\bNOT\s+NULL\b/i.test(c) && !/\bDEFAULT\b/i.test(c),
  },
]

/** Número da migration pelo nome (`0031_x.sql` → 31). */
export function numeroDa(nome) {
  const m = /^(\d{4})_/.exec(nome)
  return m ? Number(m[1]) : NaN
}

/**
 * Confere UMA migration. Devolve `{ erros, contrato }`: `contrato` é a justificativa do marcador
 * (ou `null`), e `erros` as violações — vazio quando passa.
 */
export function conferirMigracao(nome, sql) {
  const erros = []
  const marcador = /^\s*--\s*CONTRATO:\s*(.*)$/im.exec(sql)
  const contrato = marcador ? marcador[1].trim() : null
  if (marcador && contrato.length < 10) {
    erros.push(`${nome}: o marcador \`-- CONTRATO:\` precisa de uma justificativa (10+ caracteres)`)
  }

  const achados = new Set()
  for (const c of comandos(sql)) for (const d of DESTRUTIVOS) if (d.teste(c)) achados.add(d.nome)
  if (achados.size && !contrato) {
    erros.push(
      `${nome}: ${[...achados].join(', ')} quebra a versão anterior do código (que é a que um rollback põe no ar). ` +
        'Faça expand/contract: acrescente agora, pare de usar num deploy, e remova numa migration própria com `-- CONTRATO: <justificativa>` (docs/versionamento.md).',
    )
  }

  if (!/REVERS(?:A|Ã)O\s*:/i.test(sql)) {
    erros.push(`${nome}: falta o comentário \`-- REVERSAO: <como desfazer>\` (o runbook de rollback depende dele)`)
  }
  return { erros, contrato }
}

/**
 * Regra 2, a parte do "sozinha": se alguma migration com CONTRATO mudou, nenhum arquivo de código
 * fora do banco pode ter mudado no mesmo diff.
 */
export function conferirContratoSozinho(arquivosMudados, migracoesComContrato) {
  const contratosNoDiff = migracoesComContrato.filter((m) =>
    arquivosMudados.some((a) => a.replace(/\\/g, '/').endsWith(`server/db/migrations/${m}`)),
  )
  if (!contratosNoDiff.length) return []
  const codigo = arquivosMudados
    .map((a) => a.replace(/\\/g, '/'))
    .filter((a) => /^(src\/|server\/|server\.ts$)/.test(a))
    .filter((a) => !a.startsWith('server/db/migrations/') && a !== 'server/db/schema.ts')
  if (!codigo.length) return []
  return [
    `${contratosNoDiff.join(', ')}: migration de CONTRATO não pode vir com mudança de código no mesmo diff — ` +
      `o rollback desta release voltaria para um código que ainda lê o que foi removido. Separe: ${codigo.slice(0, 5).join(', ')}${codigo.length > 5 ? '…' : ''}`,
  ]
}

/** Regra 4: `.sql` e journal casam um a um. */
export function conferirJournal(arquivosSql, tagsDoJournal) {
  const erros = []
  const tags = new Set(tagsDoJournal)
  const arquivos = new Set(arquivosSql.map((a) => a.replace(/\.sql$/, '')))
  for (const a of arquivos) if (!tags.has(a)) erros.push(`${a}.sql não está no meta/_journal.json — nunca vai rodar`)
  for (const t of tags) if (!arquivos.has(t)) erros.push(`o journal cita ${t} e o arquivo ${t}.sql não existe`)
  return erros
}

function arquivosMudadosDesde(base) {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], { stdio: 'ignore' })
  } catch {
    return null
  }
  const saida = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
  return saida
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

/** Roda tudo sobre uma pasta de migrations. Devolve `{ erros, avisos }`. */
export function conferirPasta(pasta = PASTA_PADRAO, { base } = {}) {
  const erros = []
  const avisos = []
  const sqls = readdirSync(pasta)
    .filter((n) => n.endsWith('.sql'))
    .sort()
  const journal = JSON.parse(readFileSync(path.join(pasta, 'meta', '_journal.json'), 'utf8'))
  erros.push(
    ...conferirJournal(
      sqls,
      journal.entries.map((e) => e.tag),
    ),
  )

  const comContrato = []
  for (const nome of sqls.filter((n) => numeroDa(n) >= A_PARTIR_DE)) {
    const r = conferirMigracao(nome, readFileSync(path.join(pasta, nome), 'utf8'))
    erros.push(...r.erros)
    if (r.contrato) comContrato.push(nome)
  }

  if (comContrato.length) {
    const mudados = base ? arquivosMudadosDesde(base) : null
    if (mudados) erros.push(...conferirContratoSozinho(mudados, comContrato))
    else
      avisos.push(
        `há migration de CONTRATO (${comContrato.join(', ')}) e não deu para conferir se ela veio sozinha ` +
          `(${base ? `base ${base} não resolvível` : 'sem --base'}): só o marcador foi cobrado`,
      )
  }
  return { erros, avisos, total: sqls.length, conferidas: sqls.filter((n) => numeroDa(n) >= A_PARTIR_DE).length }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baseArg = process.argv.find((a) => a.startsWith('--base='))?.slice(7)
  const base = baseArg && !/^0+$/.test(baseArg) ? baseArg : undefined
  const r = conferirPasta(PASTA_PADRAO, { base })
  for (const a of r.avisos) console.warn(`AVISO: ${a}`)
  for (const e of r.erros) console.error(`ERRO: ${e}`)
  console.log(
    `migrations: ${r.total} · conferidas (>= ${String(A_PARTIR_DE).padStart(4, '0')}): ${r.conferidas} · erros: ${r.erros.length}`,
  )
  process.exit(r.erros.length ? 1 : 0)
}
