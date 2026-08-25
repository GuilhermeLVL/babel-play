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
 * 1. **`VACUUM INTO`, não cópia de arquivo.** Sob WAL o banco são três arquivos (`.db`, `-wal`,
 *    `-shm`) e copiar só o `.db` com o app rodando produz um backup CORROMPIDO ou defasado.
 *    `VACUUM INTO` pede ao próprio SQLite uma cópia consistente, com o WAL já incorporado.
 * 2. **Verifica antes de considerar feito.** Abre a cópia, roda `PRAGMA integrity_check` e
 *    confere as contagens contra a origem. Backup que nunca foi lido não é backup — e um que
 *    falhou em silêncio é pior, porque dá confiança.
 * 3. **Inclui a MÍDIA.** `data/audio` tem 33× o peso do banco (F5-02). Um backup só do banco
 *    restaura ponteiros para arquivos que não existem mais.
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

import { createClient } from '@libsql/client'
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
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

const urlBanco = process.env.DATABASE_URL || 'file:./data/babel.db'
const arquivoBanco = urlBanco.startsWith('file:') ? path.resolve(RAIZ, urlBanco.slice(5)) : null
const dirAudio = process.env.AUDIO_DIR ? path.resolve(process.env.AUDIO_DIR) : path.join(RAIZ, 'data', 'audio')

if (!arquivoBanco || !existsSync(arquivoBanco)) {
  console.error(`[backup] banco não encontrado: ${arquivoBanco ?? urlBanco}`)
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
const carimbo = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
if (!FORMATO_DO_CARIMBO.test(carimbo)) {
  console.error(`[backup] ABORTADO: carimbo "${carimbo}" não casa com o formato da rotação. Sem isso o disco encheria em silêncio.`)
  process.exit(2)
}
/*
 * Duas execuções no MESMO SEGUNDO colidiam e o `VACUUM INTO` estourava contra um arquivo que já
 * existia — descoberto rodando o script três vezes seguidas. Um agendador não faz isso, mas uma
 * pessoa depurando faz, e travar com stack trace é uma aresta desnecessária.
 */
let pasta = path.join(DESTINO, carimbo)
for (let n = 2; existsSync(pasta); n++) pasta = path.join(DESTINO, `${carimbo}-${n}`)
await mkdir(pasta, { recursive: true })

const TABELAS = ['sessions', 'utterances', 'vocab_cards', 'vocab_occurrences', 'review_logs', 'exercise_results', 'users']
const contar = async (cliente) => {
  const r = {}
  for (const t of TABELAS) {
    try { r[t] = Number(Object.values((await cliente.execute(`SELECT COUNT(*) FROM ${t}`)).rows[0])[0]) } catch { r[t] = null }
  }
  return r
}

const t0 = Date.now()
console.log(`[backup] destino: ${path.relative(RAIZ, pasta)}`)

/* ── 1. banco ─────────────────────────────────────────────────────────────── */

const origem = createClient({ url: urlBanco })
const contagemOrigem = await contar(origem)

const destinoDb = path.join(pasta, 'babel.db')
// O caminho vai literal no SQL, então aspas simples precisam ser escapadas.
await origem.execute(`VACUUM INTO '${destinoDb.replace(/\\/g, '/').replace(/'/g, "''")}'`)
console.log('[backup] VACUUM INTO concluído')

/* ── 2. verificação ───────────────────────────────────────────────────────── */

const copia = createClient({ url: `file:${destinoDb.replace(/\\/g, '/')}` })
const integridade = (await copia.execute('PRAGMA integrity_check')).rows[0]
const okIntegridade = String(Object.values(integridade)[0]).toLowerCase() === 'ok'
const contagemCopia = await contar(copia)

const divergentes = TABELAS.filter((t) => contagemOrigem[t] !== contagemCopia[t])
try { copia.close?.() } catch { /* ignora */ }
try { origem.close?.() } catch { /* ignora */ }

if (!okIntegridade) {
  console.error(`[backup] FALHOU: integrity_check devolveu ${JSON.stringify(integridade)}`)
  process.exit(1)
}
/*
 * Divergência de contagem NÃO é necessariamente corrupção: se houver escrita em voo durante o
 * VACUUM, a cópia pode ter uma linha a menos. O que importa é o sentido — a cópia nunca pode ter
 * MAIS do que a origem, e a diferença tem de ser pequena. Uma diferença grande, ou negativa,
 * significa que a cópia não é do banco que se pensa.
 */
const suspeitas = divergentes.filter((t) => {
  const d = (contagemOrigem[t] ?? 0) - (contagemCopia[t] ?? 0)
  return d < 0 || d > 50
})
if (suspeitas.length) {
  console.error(`[backup] FALHOU: contagens incoerentes em ${suspeitas.join(', ')}`)
  console.error(`  origem: ${JSON.stringify(contagemOrigem)}`)
  console.error(`  cópia:  ${JSON.stringify(contagemCopia)}`)
  process.exit(1)
}
if (divergentes.length) console.log(`[backup] ${divergentes.join(', ')} com pequena diferença (escrita em voo) — aceito`)
console.log(`[backup] verificado: integrity_check ok · ${Object.entries(contagemCopia).map(([k, v]) => `${k}=${v}`).join(' ')}`)

/* ── 3. mídia ─────────────────────────────────────────────────────────────── */

let midia = { copiado: false, arquivos: 0, bytes: 0 }
if (!SEM_MIDIA && existsSync(dirAudio)) {
  const destinoAudio = path.join(pasta, 'audio')
  await cp(dirAudio, destinoAudio, { recursive: true })
  const nomes = await readdir(destinoAudio)
  let bytes = 0
  for (const n of nomes) bytes += (await stat(path.join(destinoAudio, n))).size
  midia = { copiado: true, arquivos: nomes.length, bytes }
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

console.log(`[backup] OK em ${((Date.now() - t0) / 1000).toFixed(1)}s · ${existentes.length - excedentes.length} cópia(s) guardada(s)`)
process.exit(0)
