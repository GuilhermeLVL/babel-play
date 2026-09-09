#!/usr/bin/env node
/**
 * scripts/db/fixture-anonimizada.mjs — gera `tests/fixtures/banco-estado-atual.db` a partir de um
 * banco REAL, com o dado pessoal trocado por marcadores.
 *
 * POR QUE EXISTE (rede de seguranca do banco, Fase 1 do saneamento). Os testes de migracao rodam
 * sobre um banco NASCIDO vazio e migrado do zero. Isso prova que as migrations se aplicam em
 * sequencia, nao que se aplicam sobre o ESTADO que o banco de verdade carrega: tabelas rebuildadas
 * por cima de dado antigo, indices criados sobre linhas que ja existiam, colunas adicionadas depois
 * de a tabela ter conteudo. A fixture e uma foto desse estado, sem o que identifica alguem.
 *
 * O QUE E TROCADO, E POR QUE:
 *   users.email                 -> usuario-<n>@exemplo.test  (dominio reservado, nunca entrega)
 *   users.display_name / bio    -> Usuario <n> / NULL
 *   rank.apelido / ip_hash      -> jogador-<n> / zeros
 *   secrets.value_encrypted     -> marcador constante (o texto cifrado tambem identifica: e unico)
 *   provider_credentials        -> label e base_url genericos (um host privado e endereco de rede)
 *   billing_events              -> provider_ref e payload de marcador (o payload do Asaas carrega
 *                                  nome, CPF e e-mail do pagador)
 *   subscriptions / purchases   -> ids de cliente/assinatura/pagamento de marcador
 *   utterances.speaker_name     -> Falante <n> por nome distinto
 *   anki_decks / anki_imports   -> so o nome-base do arquivo (o caminho traz o usuario do SO)
 *   qualquer coluna de texto    -> toda ocorrencia com FORMA de e-mail vira removido@exemplo.test
 *
 * O QUE E MANTIDO, E POR QUE:
 *   sessions.title, utterances.source_text/translated_text, vocab_cards, vocab_occurrences.sentence,
 *   anki_notes: e o CONTEUDO DE APRENDIZADO (falas transcritas, palavras, frases de exemplo), nao
 *   dado pessoal. E exatamente o dado que as migrations precisam encontrar para serem provadas.
 *   A varredura por e-mail passa por essas colunas mesmo assim.
 *
 * A ORIGEM E LIDA, NUNCA ESCRITA: a copia sai por `sqlite3 -readonly ... ".backup"` para um
 * diretorio temporario, e tudo o que se segue acontece na copia. Sem o `sqlite3` no PATH, cai em
 * `VACUUM INTO` pelo @libsql/client, que tambem so le a origem.
 *
 * Uso:
 *   node scripts/db/fixture-anonimizada.mjs                       # de data/babel.db
 *   node scripts/db/fixture-anonimizada.mjs --origem=/x/babel.db  # de outro banco
 *   node scripts/db/fixture-anonimizada.mjs --reduzir             # so as primeiras N linhas das
 *                                                                 # tabelas grandes (padrao 300),
 *                                                                 # respeitando as FKs
 *   node scripts/db/fixture-anonimizada.mjs --reduzir --linhas=100
 *   node scripts/db/fixture-anonimizada.mjs --destino=/x/saida.db
 *
 * Sai com codigo != 0 se a origem nao existir, se a varredura final ainda achar e-mail, ou se a
 * copia reduzida deixar FK pendurada.
 */

import { createClient } from '@libsql/client'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const RAIZ = path.resolve(import.meta.dirname, '..', '..')
const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`))
  return a ? a.slice(n.length + 3) : d
}
const ORIGEM = path.resolve(RAIZ, arg('origem', path.join('data', 'babel.db')))
const DESTINO = path.resolve(RAIZ, arg('destino', path.join('tests', 'fixtures', 'banco-estado-atual.db')))
const REDUZIR = process.argv.includes('--reduzir')
const LINHAS_POR_TABELA = Number(arg('linhas', 300))
const LIMITE_COMMITAVEL = 2 * 1024 * 1024

/** Os mesmos valores estao repetidos em `tests/integration/fixture-sem-pii.test.ts`. */
export const MARCADOR_SEGREDO = 'SEGREDO-ANONIMIZADO'
export const MARCADOR_PAYLOAD = '{"anonimizado":true}'
export const IP_HASH_ZERADO = '0'.repeat(32)
export const EMAIL_REMOVIDO = 'removido@exemplo.test'
export const REGEX_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

if (!existsSync(ORIGEM)) {
  console.error(`[fixture] origem nao encontrada: ${ORIGEM}`)
  process.exit(2)
}

const url = (arquivo) => 'file:' + arquivo.split(path.sep).join('/')
const tmp = mkdtempSync(path.join(tmpdir(), 'babel-fixture-'))
const copia = path.join(tmp, 'copia.db')

/* ── 1. foto da origem, sem escrever nela ─────────────────────────────────── */

async function fotografarOrigem() {
  const r = spawnSync('sqlite3', ['-readonly', ORIGEM, `.backup "${copia.split(path.sep).join('/')}"`], { encoding: 'utf8' })
  if (r.status === 0 && existsSync(copia)) return 'sqlite3 -readonly .backup'
  const motivo = r.error ? String(r.error.message) : (r.stderr || `status ${r.status}`).trim()
  console.warn(`[fixture] sqlite3 indisponivel (${motivo.slice(0, 100)}); caindo em VACUUM INTO`)
  const origem = createClient({ url: url(ORIGEM) })
  try {
    await origem.execute(`VACUUM INTO '${copia.split(path.sep).join('/').replace(/'/g, "''")}'`)
  } finally {
    origem.close()
  }
  return 'VACUUM INTO'
}

const metodo = await fotografarOrigem()
console.log(`[fixture] origem: ${path.relative(RAIZ, ORIGEM) || ORIGEM} (${metodo})`)

/* ── 2. anonimizacao, na copia ────────────────────────────────────────────── */

const c = createClient({ url: url(copia) })
const linhas = async (sql, args = []) => (await c.execute({ sql, args })).rows
const executar = (sql, args = []) => c.execute({ sql, args })
const contar = async (t) => Number(Object.values((await linhas(`SELECT COUNT(*) AS n FROM "${t}"`))[0])[0])

const tabelas = (await linhas("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"))
  .map((r) => String(r.name))
const temTabela = (t) => tabelas.includes(t)
const colunas = async (t) => (await linhas(`PRAGMA table_info("${t}")`)).map((r) => ({ nome: String(r.name), tipo: String(r.type ?? '') }))
const temColuna = async (t, col) => (await colunas(t)).some((x) => x.nome === col)

const antes = {}
for (const t of tabelas) antes[t] = await contar(t)

await executar('PRAGMA foreign_keys = OFF')

/** Renumera uma coluna por linha: `SELECT rowid ... ORDER BY created_at, rowid` -> valor(n). */
async function renumerar(tabela, coluna, valor, { ordem = 'created_at', apenasNaoNulos = true } = {}) {
  if (!temTabela(tabela) || !(await temColuna(tabela, coluna))) return 0
  const ordenacao = (await temColuna(tabela, ordem)) ? `"${ordem}", rowid` : 'rowid'
  const rows = await linhas(`SELECT rowid AS rid, "${coluna}" AS v FROM "${tabela}" ORDER BY ${ordenacao}`)
  let n = 0
  let alteradas = 0
  for (const r of rows) {
    n++
    if (apenasNaoNulos && (r.v === null || r.v === undefined)) continue
    await executar(`UPDATE "${tabela}" SET "${coluna}" = ? WHERE rowid = ?`, [valor(n), r.rid])
    alteradas++
  }
  return alteradas
}

/** Substitui cada valor DISTINTO por um marcador numerado (mantem a igualdade entre linhas). */
async function porValorDistinto(tabela, coluna, valor) {
  if (!temTabela(tabela) || !(await temColuna(tabela, coluna))) return 0
  const distintos = await linhas(`SELECT DISTINCT "${coluna}" AS v FROM "${tabela}" WHERE "${coluna}" IS NOT NULL ORDER BY "${coluna}"`)
  let n = 0
  for (const r of distintos) {
    n++
    await executar(`UPDATE "${tabela}" SET "${coluna}" = ? WHERE "${coluna}" = ?`, [valor(n), r.v])
  }
  return distintos.length
}

async function constante(tabela, coluna, valor) {
  if (!temTabela(tabela) || !(await temColuna(tabela, coluna))) return 0
  const r = await executar(`UPDATE "${tabela}" SET "${coluna}" = ? WHERE "${coluna}" IS NOT NULL`, [valor])
  return Number(r.rowsAffected ?? 0)
}

async function nomeBase(tabela, coluna) {
  if (!temTabela(tabela) || !(await temColuna(tabela, coluna))) return 0
  const rows = await linhas(`SELECT rowid AS rid, "${coluna}" AS v FROM "${tabela}" WHERE "${coluna}" IS NOT NULL`)
  let alteradas = 0
  for (const r of rows) {
    const base = path.basename(String(r.v).replace(/\\/g, '/'))
    if (base === r.v) continue
    await executar(`UPDATE "${tabela}" SET "${coluna}" = ? WHERE rowid = ?`, [base, r.rid])
    alteradas++
  }
  return alteradas
}

const trocas = {}
trocas['users.email'] = await renumerar('users', 'email', (n) => `usuario-${n}@exemplo.test`)
trocas['users.display_name'] = await renumerar('users', 'display_name', (n) => `Usuario ${n}`)
trocas['users.name'] = await renumerar('users', 'name', (n) => `Usuario ${n}`)
trocas['users.bio'] = await constante('users', 'bio', null)
trocas['rank.apelido'] = await renumerar('rank', 'apelido', (n) => `jogador-${n}`, { ordem: 'criado_em' })
trocas['rank.ip_hash'] = await constante('rank', 'ip_hash', IP_HASH_ZERADO)
trocas['secrets.value_encrypted'] = await constante('secrets', 'value_encrypted', MARCADOR_SEGREDO)
trocas['provider_credentials.label'] = await renumerar('provider_credentials', 'label', (n) => `credencial-${n}`)
trocas['provider_credentials.base_url'] = await constante('provider_credentials', 'base_url', 'https://exemplo.test')
trocas['billing_events.provider_ref'] = await renumerar('billing_events', 'provider_ref', (n) => `ref-${n}`)
trocas['billing_events.payload'] = await constante('billing_events', 'payload', MARCADOR_PAYLOAD)
trocas['subscriptions.provider_customer_id'] = await renumerar('subscriptions', 'provider_customer_id', (n) => `cus-${n}`)
trocas['subscriptions.provider_subscription_id'] = await renumerar('subscriptions', 'provider_subscription_id', (n) => `sub-${n}`)
trocas['credit_purchases.provider_payment_id'] = await renumerar('credit_purchases', 'provider_payment_id', (n) => `pay-${n}`)
trocas['utterances.speaker_name'] = await porValorDistinto('utterances', 'speaker_name', (n) => `Falante ${n}`)
trocas['anki_decks.arquivo_origem'] = await nomeBase('anki_decks', 'arquivo_origem')
trocas['anki_imports.arquivo'] = await nomeBase('anki_imports', 'arquivo')

/*
 * Varredura: toda coluna de texto de toda tabela. `users.email` ja esta no formato final.
 *
 * Numa coluna sob indice UNIQUE o marcador leva o rowid: o guid do Anki e base91 e pode ter a
 * FORMA de e-mail (`a.b@cd.ef`), e dois guids trocados pelo mesmo marcador estouravam
 * `uq_anki_notes_deck_guid` — aconteceu na primeira execucao.
 */
const colunasUnicas = new Set()
for (const t of tabelas) {
  for (const idx of await linhas(`PRAGMA index_list("${t}")`)) {
    if (Number(idx.unique) !== 1) continue
    for (const col of await linhas(`PRAGMA index_info("${String(idx.name)}")`)) colunasUnicas.add(`${t}.${String(col.name)}`)
  }
}
const varridas = {}
for (const t of tabelas) {
  for (const col of await colunas(t)) {
    if (t === 'users' && col.nome === 'email') continue
    if (!(col.tipo === '' || /^(text|char|clob|varchar)/i.test(col.tipo))) continue
    const unica = colunasUnicas.has(`${t}.${col.nome}`)
    const rows = await linhas(`SELECT rowid AS rid, "${col.nome}" AS v FROM "${t}" WHERE typeof("${col.nome}") = 'text' AND "${col.nome}" LIKE '%@%'`)
    for (const r of rows) {
      const texto = String(r.v)
      if (!REGEX_EMAIL.test(texto)) { REGEX_EMAIL.lastIndex = 0; continue }
      REGEX_EMAIL.lastIndex = 0
      const marcador = unica ? `removido-${r.rid}@exemplo.test` : EMAIL_REMOVIDO
      await executar(`UPDATE "${t}" SET "${col.nome}" = ? WHERE rowid = ?`, [texto.replace(REGEX_EMAIL, marcador), r.rid])
      varridas[`${t}.${col.nome}`] = (varridas[`${t}.${col.nome}`] ?? 0) + 1
    }
  }
}

/* ── 3. reducao opcional, respeitando as FKs ──────────────────────────────── */

if (REDUZIR) {
  const grandes = tabelas.filter((t) => t !== '__drizzle_migrations' && antes[t] > LINHAS_POR_TABELA)
  for (const t of grandes) {
    const ordem = (await temColuna(t, 'created_at')) ? '"created_at", rowid' : (await temColuna(t, 'criado_em')) ? '"criado_em", rowid' : 'rowid'
    await executar(`DELETE FROM "${t}" WHERE rowid NOT IN (SELECT rowid FROM "${t}" ORDER BY ${ordem} LIMIT ?)`, [LINHAS_POR_TABELA])
  }

  /* As FKs declaradas, mais as relacoes LOGICAS do acervo Anki, que o schema nao declara. */
  const relacoes = []
  for (const t of tabelas) {
    for (const fk of await linhas(`PRAGMA foreign_key_list("${t}")`)) {
      relacoes.push({ filho: t, coluna: String(fk.from), pai: String(fk.table), paiColuna: String(fk.to ?? 'id') })
    }
  }
  for (const [filho, coluna, pai] of [
    ['anki_imports', 'deck_id', 'anki_decks'],
    ['anki_notes', 'deck_id', 'anki_decks'],
    ['anki_notes', 'import_id', 'anki_imports'],
    ['anki_notes', 'projected_card_id', 'vocab_cards'],
  ]) {
    if (temTabela(filho) && temTabela(pai) && (await temColuna(filho, coluna))) relacoes.push({ filho, coluna, pai, paiColuna: 'id' })
  }

  /* Ate estabilizar: apagar um pai pode deixar orfaos em filhos que ja tinham passado. */
  for (let rodada = 0, apagadas = 1; apagadas > 0; rodada++) {
    apagadas = 0
    for (const { filho, coluna, pai, paiColuna } of relacoes) {
      const r = await executar(
        `DELETE FROM "${filho}" WHERE "${coluna}" IS NOT NULL AND "${coluna}" NOT IN (SELECT "${paiColuna}" FROM "${pai}")`,
      )
      apagadas += Number(r.rowsAffected ?? 0)
    }
    if (rodada > 20) throw new Error('[fixture] a limpeza de orfaos nao convergiu em 20 rodadas')
  }
}

/* ── 4. verificacao e compactacao ─────────────────────────────────────────── */

await executar('PRAGMA foreign_keys = ON')
const pendentes = await linhas('PRAGMA foreign_key_check')
if (pendentes.length) {
  console.error(`[fixture] FALHOU: foreign_key_check devolveu ${pendentes.length} linha(s): ${JSON.stringify(pendentes.slice(0, 5))}`)
  process.exit(1)
}

/* Ainda ha e-mail em alguma coluna de texto? (users.email so pode ter o dominio reservado.) */
let sobras = 0
for (const t of tabelas) {
  for (const col of await colunas(t)) {
    const rows = await linhas(`SELECT "${col.nome}" AS v FROM "${t}" WHERE typeof("${col.nome}") = 'text' AND "${col.nome}" LIKE '%@%'`)
    for (const r of rows) {
      const achados = String(r.v).match(REGEX_EMAIL) ?? []
      sobras += achados.filter((e) => !e.endsWith('@exemplo.test')).length
    }
  }
}
if (sobras > 0) {
  console.error(`[fixture] FALHOU: ${sobras} e-mail(s) sobraram depois da varredura`)
  process.exit(1)
}

/* Um arquivo so: sem isto a fixture nasce em WAL e todo `open` cria -wal/-shm ao lado dela. */
await executar('PRAGMA journal_mode = DELETE')
await executar('VACUUM')
const integridade = String(Object.values((await linhas('PRAGMA integrity_check'))[0])[0])
const depois = {}
for (const t of tabelas) depois[t] = await contar(t)
c.close()

if (integridade.toLowerCase() !== 'ok') {
  console.error(`[fixture] FALHOU: integrity_check devolveu ${integridade}`)
  process.exit(1)
}

mkdirSync(path.dirname(DESTINO), { recursive: true })
for (const sufixo of ['', '-wal', '-shm', '-journal']) {
  if (existsSync(DESTINO + sufixo)) rmSync(DESTINO + sufixo, { force: true })
}
copyFileSync(copia, DESTINO)
try { rmSync(tmp, { recursive: true, force: true }) } catch { /* OneDrive/AV pode segurar */ }

/* ── 5. relatorio ─────────────────────────────────────────────────────────── */

const bytes = statSync(DESTINO).size
console.log(`[fixture] gravada em ${path.relative(RAIZ, DESTINO)} (${(bytes / 1024).toFixed(0)} KB)${REDUZIR ? ` — reduzida a ${LINHAS_POR_TABELA} linha(s) por tabela grande` : ''}`)
console.log('[fixture] linhas por tabela (origem -> fixture):')
for (const t of tabelas) console.log(`  ${t.padEnd(24)} ${String(antes[t]).padStart(6)} -> ${String(depois[t]).padStart(6)}`)
const trocadas = Object.entries(trocas).filter(([, n]) => n > 0)
console.log(`[fixture] colunas anonimizadas: ${trocadas.length ? trocadas.map(([k, n]) => `${k}=${n}`).join(' ') : 'nenhuma linha com dado a trocar'}`)
const varridasLista = Object.entries(varridas)
console.log(`[fixture] e-mails varridos de texto livre: ${varridasLista.length ? varridasLista.map(([k, n]) => `${k}=${n}`).join(' ') : 'nenhum'}`)
if (bytes > LIMITE_COMMITAVEL) {
  console.log(`[fixture] ATENCAO: ${(bytes / 1048576).toFixed(2)} MB passa do limite commitavel de 2 MB${REDUZIR ? '; baixe --linhas' : '; rode com --reduzir'}`)
  process.exit(3)
}
process.exit(0)
