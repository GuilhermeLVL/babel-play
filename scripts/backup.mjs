#!/usr/bin/env node
/**
 * scripts/backup.mjs — backup do banco E da mídia, com verificação e rotação.
 *
 * FECHA O ACHADO F5-01 DA AUDITORIA. O procedimento de restore já existia e foi provado
 * (`scripts/diagnosis/verificar-backup.mjs` → `RESTAURAVEL E FIEL`). O que não existia era o
 * backup em si acontecer: o mais recente tinha **6,5 dias**, com 822 linhas e 688 arquivos de
 * mídia sem cópia nenhuma.
 *
 * TRÊS COISAS QUE ESTE SCRIPT FAZ E UM `cp` NÃO FAZ:
 *
 * 1. **Cópia consistente do banco.** Com `postgres://` roda `pg_dump` (formato custom) para um
 *    arquivo: o próprio Postgres entrega um instantâneo consistente com o serviço no ar. Com
 *    `pglite:<dir>` copia o diretório do banco; o PGlite é de um processo só, então ESSA cópia só é
 *    consistente com o servidor PARADO (é o banco de desenvolvimento, não o de produção).
 * 2. **Verifica antes de considerar feito.** Backup que nunca foi lido não é backup — e um que
 *    falhou em silêncio é pior, porque dá confiança. O dump é aberto com `pg_restore --list`; a
 *    cópia do PGlite precisa ter conteúdo.
 * 3. **Inclui a MÍDIA.** `data/audio` tem 33× o peso do banco (F5-02). Um backup só do banco
 *    restaura ponteiros para arquivos que não existem mais.
 *
 * Com `postgres://` é preciso ter `pg_dump` e `pg_restore` no PATH (pacote `postgresql-client`).
 *
 * Uso:
 *   node scripts/backup.mjs                    # backup + verificação + rotação
 *   node scripts/backup.mjs --sem-midia        # só o banco (mais rápido; use se a mídia já vai
 *                                              # para object storage)
 *   node scripts/backup.mjs --manter=14        # quantas cópias guardar (padrão 7)
 *   node scripts/backup.mjs --destino=/backup  # onde gravar (padrão ./backups)
 *
 * Sai com código != 0 se qualquer etapa falhar — é isso que faz um agendador avisar.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const RAIZ = path.resolve(import.meta.dirname, '..')
const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`))
  return a ? a.slice(n.length + 3) : d
}
const SEM_MIDIA = process.argv.includes('--sem-midia')
const MANTER = Number(arg('manter', 7))
const DESTINO = path.resolve(RAIZ, arg('destino', 'backups'))

const urlBanco = process.env.DATABASE_URL || 'pglite:./data/pg'
const ehPostgres = /^postgres(ql)?:\/\//i.test(urlBanco)
const ehPglite = urlBanco.startsWith('pglite:')
/** O diretório do PGlite (`pglite:./data/pg`); `null` para `pglite://memory` e para outros tipos. */
const dirPglite =
  ehPglite && !urlBanco.startsWith('pglite://') ? path.resolve(RAIZ, urlBanco.slice('pglite:'.length)) : null
const dirAudio = process.env.AUDIO_DIR ? path.resolve(process.env.AUDIO_DIR) : path.join(RAIZ, 'data', 'audio')

if (!ehPostgres && !dirPglite) {
  console.error(
    '[backup] DATABASE_URL precisa ser postgres://… ou pglite:<diretório> (pglite://memory não tem o que copiar)',
  )
  process.exit(2)
}
if (dirPglite && !existsSync(dirPglite)) {
  console.error(`[backup] banco não encontrado: ${dirPglite}`)
  process.exit(2)
}

/**
 * `20260814T185256Z` — ordenável por nome e sem `:`, que o Windows recusa em nome de arquivo.
 *
 * A primeira versão encadeava dois `replace` e produzia `2026-08-14T185256380Z`, que NÃO casa com
 * a regex da rotação lá embaixo. O efeito seria silencioso e caro: o backup funcionaria, a
 * rotação nunca rodaria, e o disco encheria de cópias — num volume onde o banco também mora.
 * Daí a asserção logo abaixo, e o teste em `tests/backup-carimbo.test.ts`.
 */
const FORMATO_DO_CARIMBO = /^\d{8}T\d{6}Z$/
const carimbo = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d+Z$/, 'Z')
if (!FORMATO_DO_CARIMBO.test(carimbo)) {
  console.error(
    `[backup] ABORTADO: carimbo "${carimbo}" não casa com o formato da rotação. Sem isso o disco encheria em silêncio.`,
  )
  process.exit(2)
}
/*
 * Duas execuções no MESMO SEGUNDO colidiam e a cópia estourava contra um destino que já
 * existia — descoberto rodando o script três vezes seguidas. Um agendador não faz isso, mas uma
 * pessoa depurando faz, e travar com stack trace é uma aresta desnecessária.
 */
let pasta = path.join(DESTINO, carimbo)
for (let n = 2; existsSync(pasta); n++) pasta = path.join(DESTINO, `${carimbo}-${n}`)
await mkdir(pasta, { recursive: true })

const t0 = Date.now()
console.log(`[backup] destino: ${path.relative(RAIZ, pasta)}`)

/** Roda um utilitário do cliente do Postgres sem repetir a URL (tem senha) em nenhuma mensagem. */
function rodarCliente(programa, args) {
  const r = spawnSync(programa, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error?.code === 'ENOENT') {
    console.error(
      `[backup] FALHOU: ${programa} não está no PATH. Instale o cliente do Postgres (postgresql-client) e rode de novo.`,
    )
    process.exit(1)
  }
  if (r.status !== 0) {
    console.error(`[backup] FALHOU: ${programa} saiu com ${r.status}`)
    console.error(
      String(r.stderr || '')
        .replaceAll(urlBanco, '<DATABASE_URL>')
        .trim(),
    )
    process.exit(1)
  }
  return r
}

/* ── 1. banco ─────────────────────────────────────────────────────────────── */

let arquivoBanco
if (ehPostgres) {
  arquivoBanco = path.join(pasta, 'babel.dump')
  rodarCliente('pg_dump', ['--format=custom', `--file=${arquivoBanco}`, `--dbname=${urlBanco}`])
  console.log('[backup] pg_dump concluído')
} else {
  arquivoBanco = path.join(pasta, 'pg')
  await cp(dirPglite, arquivoBanco, { recursive: true })
  console.log('[backup] diretório do PGlite copiado (consistente só com o servidor parado)')
}

/* ── 2. verificação ───────────────────────────────────────────────────────── */

if (ehPostgres) {
  const lista = rodarCliente('pg_restore', ['--list', arquivoBanco]).stdout
  if (!/\bTABLE DATA\b/.test(lista)) {
    console.error('[backup] FALHOU: o dump abre, mas não tem dados de nenhuma tabela')
    process.exit(1)
  }
  console.log(
    `[backup] verificado: pg_restore --list ok · ${((await stat(arquivoBanco)).size / 1048576).toFixed(1)} MB`,
  )
} else {
  const nomes = await readdir(arquivoBanco)
  if (nomes.length === 0) {
    console.error('[backup] FALHOU: a cópia do diretório do PGlite saiu vazia')
    process.exit(1)
  }
  console.log(`[backup] verificado: ${nomes.length} entradas no diretório copiado`)
}

/* ── 3. mídia ─────────────────────────────────────────────────────────────── */

if (!SEM_MIDIA && existsSync(dirAudio)) {
  const destinoAudio = path.join(pasta, 'audio')
  await cp(dirAudio, destinoAudio, { recursive: true })
  const nomes = await readdir(destinoAudio)
  let bytes = 0
  for (const n of nomes) bytes += (await stat(path.join(destinoAudio, n))).size
  console.log(`[backup] mídia: ${nomes.length} arquivos, ${(bytes / 1048576).toFixed(1)} MB`)
} else if (SEM_MIDIA) {
  console.log('[backup] mídia PULADA (--sem-midia)')
} else {
  console.log(`[backup] mídia: ${path.relative(RAIZ, dirAudio)} não existe — nada a copiar`)
}

/* ── 4. rotação ───────────────────────────────────────────────────────────── */

const existentes = (await readdir(DESTINO, { withFileTypes: true }))
  /*
   * O `(-\d+)?` NÃO é detalhe: sem ele a rotação ignorava as pastas com sufixo de colisão, e elas
   * ficariam para sempre num volume onde o banco também mora. Medido rodando com `--manter=2` e
   * encontrando 3 pastas depois.
   */
  .filter((e) => e.isDirectory() && /^\d{8}T\d{6}Z(-\d+)?$/.test(e.name))
  .map((e) => e.name)
  .sort()
const excedentes = existentes.slice(0, Math.max(0, existentes.length - MANTER))
for (const velho of excedentes) {
  await rm(path.join(DESTINO, velho), { recursive: true, force: true })
  console.log(`[backup] rotação: removido ${velho}`)
}

console.log(
  `[backup] OK em ${((Date.now() - t0) / 1000).toFixed(1)}s · ${existentes.length - excedentes.length} cópia(s) guardada(s)`,
)
process.exit(0)
