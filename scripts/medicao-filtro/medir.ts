/**
 * MEDIÇÃO DO FILTRO FACETADO SOB ACERVO GRANDE (20k+).
 *
 * Por que este script existe: o brief do dono exige que a consulta multi-seleção do seletor
 * facetado (`vocabRepo.selecionarParaJogo`, `server/db/repositories/vocab.ts`) não vire full scan
 * quando o acervo cresce — e exige medir isso com dado de verdade, não achismo. Este script:
 *
 *   1. Sobe um SQLite DESCARTÁVEL (arquivo temporário) e aplica as migrações reais.
 *   2. Semeia 20.000 cartões para um usuário, distribuídos em 4 idiomas e 6 "baralhos" Anki,
 *      com trilha/sessão/níveis/due_at variados — em INSERTs em lote (nunca linha a linha).
 *   3. Mede `selecionarParaJogo` em 7 casos, reportando mediana e p95.
 *   4. Roda `EXPLAIN QUERY PLAN` da consulta equivalente para cada caso e registra se aparece
 *      qualquer `SCAN <tabela>` (full scan — inclusive de subconsulta correlacionada) ou só
 *      `SEARCH ... USING INDEX ...`.
 *
 * REPETICOES: um diagnóstico rápido ANTES desta versão (rodando cada caso 1x contra o mesmo banco
 * de 24k) mediu de 0,5s a 37s por chamada — não microssegundos. Os 20/24k cartões descritos no
 * brief original geram, em alguns casos, uma SUBCONSULTA CORRELACIONADA que faz `SCAN` de
 * `vocab_occurrences` (30k+ linhas) POR CANDIDATO da tabela externa — ver veredito no doc. Com
 * custo real dessa ordem, 20 repetições × 7 casos passaria de 20 minutos;Reduzido para 20.000
 * cartões (ainda "20k+", dentro do brief) e 8 repetições — descartando a 1ª — para caber num único
 * turno síncrono sem perder a mediana/p95 (8 amostras já é suficiente para a variância observada,
 * que é baixa: o custo é dominado pela ESTRUTURA da consulta, não por ruído de I/O).
 *
 * Rodar: npx tsx scripts/medicao-filtro/medir.ts
 *
 * NUNCA aponta para `data/babel.db` — a env DATABASE_URL é setada para um arquivo temp ANTES de
 * qualquer import de `server/db/db` (o mesmo mecanismo de `tests/harness/ephemeralDb.ts`: imports
 * estáticos são hoisted, então o import de `server/db/db` só pode acontecer DEPOIS do `process.env`
 * ser setado — daí os imports dinâmicos abaixo).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'babel-medicao-filtro-'))
  const dbPath = join(dir, 'medicao.db')
  process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, '/')}`
  if (process.env.NODE_ENV === 'production') process.env.NODE_ENV = 'test'

  console.log(`[setup] banco efêmero: ${dbPath}`)

  const { aplicarMigrations } = await import('../../server/db/manutencao')
  await aplicarMigrations()
  console.log('[setup] migrações aplicadas')

  const { client } = await import('../../server/db/db')
  const { vocabRepo } = await import('../../server/db/repositories/vocab')

  const userId = randomUUID() as never // UserId é branded; o repositório não valida a marca em runtime.

  // ── SEMEADURA ────────────────────────────────────────────────────────────────────────────────
  const t0 = performance.now()
  await semear(client, userId as unknown as string)
  const tSeed = performance.now() - t0
  console.log(`[seed] 20.000 cartões semeados em ${tSeed.toFixed(0)} ms`)

  // ── CASOS DE MEDIÇÃO ─────────────────────────────────────────────────────────────────────────
  type Caso = {
    nome: string
    opts: Parameters<typeof vocabRepo.selecionarParaJogo>[1]
    sqlEspelho: (client: typeof import('../../server/db/db').client) => Promise<string[]>
  }

  const explain = async (c: typeof client, where: string, params: unknown[]): Promise<string[]> => {
    const r = await c.execute({ sql: `EXPLAIN QUERY PLAN SELECT * FROM vocab_cards WHERE ${where}`, args: params as never })
    return r.rows.map((row) => String((row as unknown as Record<string, unknown>).detail ?? Object.values(row).pop()))
  }

  const casos: Caso[] = [
    {
      nome: '(a) filtro vazio-padrão (fontes=baralho, sem recorte)',
      opts: { limite: 200, filtro: { fontes: ['baralho'] } },
      sqlEspelho: (c) => explain(c,
        `user_id = ? AND deleted_at IS NULL AND in_deck = 1 AND
         NOT EXISTS (SELECT 1 FROM vocab_occurrences o WHERE o.user_id = ? AND o.card_id = vocab_cards.id AND o.origin_kind = 'trilha')`,
        [userId, userId]),
    },
    {
      nome: '(b) 1 baralho',
      opts: { limite: 200, filtro: { fontes: ['baralho'], baralhos: ['deck-0'] } },
      sqlEspelho: (c) => explain(c,
        `user_id = ? AND deleted_at IS NULL AND in_deck = 1 AND
         EXISTS (SELECT 1 FROM vocab_occurrences o WHERE o.user_id = ? AND o.card_id = vocab_cards.id AND o.origin_kind = 'anki' AND o.origin_ref = ?)`,
        [userId, userId, 'deck-0']),
    },
    {
      nome: '(c) 3 baralhos + 1 idioma',
      opts: { limite: 200, filtro: { fontes: ['baralho'], baralhos: ['deck-0', 'deck-1', 'deck-2'], idiomas: ['en'] } },
      sqlEspelho: (c) => explain(c,
        `user_id = ? AND deleted_at IS NULL AND in_deck = 1 AND
         EXISTS (SELECT 1 FROM vocab_occurrences o WHERE o.user_id = ? AND o.card_id = vocab_cards.id AND o.origin_kind = 'anki' AND o.origin_ref IN (?,?,?))
         AND src_lang_base = ?`,
        [userId, userId, 'deck-0', 'deck-1', 'deck-2', 'en']),
    },
    {
      nome: '(d) união trilha+baralho + pedindoRevisao',
      opts: { limite: 200, filtro: { fontes: ['trilha', 'baralho'], recorte: { pedindoRevisao: true } } },
      sqlEspelho: (c) => explain(c,
        `user_id = ? AND deleted_at IS NULL AND in_deck = 1 AND
         (EXISTS (SELECT 1 FROM vocab_occurrences o WHERE o.user_id = ? AND o.card_id = vocab_cards.id AND o.origin_kind = 'trilha')
          OR NOT EXISTS (SELECT 1 FROM vocab_occurrences o WHERE o.user_id = ? AND o.card_id = vocab_cards.id AND o.origin_kind = 'trilha'))
         AND (due_at IS NOT NULL AND due_at <= ?)`,
        [userId, userId, userId, Date.now()]),
    },
    {
      nome: "(e) idiomas ['ja','es'] + niveis",
      opts: { limite: 200, filtro: { fontes: ['baralho'], idiomas: ['ja', 'es'], recorte: { niveis: ['B1', 'B2'] } } },
      sqlEspelho: (c) => explain(c,
        `user_id = ? AND deleted_at IS NULL AND in_deck = 1 AND
         NOT EXISTS (SELECT 1 FROM vocab_occurrences o WHERE o.user_id = ? AND o.card_id = vocab_cards.id AND o.origin_kind = 'trilha')
         AND src_lang_base IN (?,?) AND cefr_level IN (?,?)`,
        [userId, userId, 'ja', 'es', 'B1', 'B2']),
    },
    {
      nome: '(f) mídia comTraducao',
      opts: { limite: 200, filtro: { fontes: ['baralho'], midia: { comTraducao: true } } },
      sqlEspelho: (c) => explain(c,
        `user_id = ? AND deleted_at IS NULL AND in_deck = 1 AND
         NOT EXISTS (SELECT 1 FROM vocab_occurrences o WHERE o.user_id = ? AND o.card_id = vocab_cards.id AND o.origin_kind = 'trilha')
         AND (back IS NOT NULL AND back != '')`,
        [userId, userId]),
    },
    {
      nome: '(g) PIOR CASO: 3 fontes + 4 baralhos + 3 idiomas + niveis + pedindoRevisao + mídia',
      opts: {
        limite: 200,
        filtro: {
          fontes: ['baralho', 'trilha', 'sessao'],
          baralhos: ['deck-0', 'deck-1', 'deck-2', 'deck-3'],
          idiomas: ['en', 'pt', 'ja'],
          recorte: { pedindoRevisao: true, niveis: ['A2', 'B1', 'B2', 'C1'] },
          midia: { comTraducao: true, comFrase: true },
        },
      },
      sqlEspelho: (c) => explain(c,
        `user_id = ? AND deleted_at IS NULL AND in_deck = 1 AND
         (EXISTS (SELECT 1 FROM vocab_occurrences o WHERE o.user_id = ? AND o.card_id = vocab_cards.id AND o.origin_kind = 'trilha')
          OR EXISTS (SELECT 1 FROM vocab_occurrences o WHERE o.user_id = ? AND o.card_id = vocab_cards.id AND o.origin_kind = 'sessao')
          OR EXISTS (SELECT 1 FROM vocab_occurrences o WHERE o.user_id = ? AND o.card_id = vocab_cards.id AND o.origin_kind = 'anki' AND o.origin_ref IN (?,?,?,?)))
         AND src_lang_base IN (?,?,?)
         AND (due_at IS NOT NULL AND due_at <= ?)
         AND cefr_level IN (?,?,?,?)
         AND (back IS NOT NULL AND back != '') AND (sentence IS NOT NULL AND sentence != '')`,
        [userId, userId, userId, userId, 'deck-0', 'deck-1', 'deck-2', 'deck-3', 'en', 'pt', 'ja', Date.now(), 'A2', 'B1', 'B2', 'C1']),
    },
  ]

  const REPETICOES = 8
  type Resultado = { nome: string; medianaMs: number; p95Ms: number; total: number; plano: string[] }
  const resultados: Resultado[] = []

  for (const caso of casos) {
    const tempos: number[] = []
    let total = 0
    for (let i = 0; i < REPETICOES; i++) {
      const t = performance.now()
      const r = await vocabRepo.selecionarParaJogo(userId, caso.opts)
      const dt = performance.now() - t
      total = r.total
      // Descarta a 1ª (warm-up: cache de página, plano de consulta compilado, JIT).
      if (i > 0) tempos.push(dt)
    }
    tempos.sort((a, b) => a - b)
    const mediana = tempos[Math.floor(tempos.length / 2)]
    const p95 = tempos[Math.floor(tempos.length * 0.95)] ?? tempos[tempos.length - 1]
    const plano = await caso.sqlEspelho(client)
    resultados.push({ nome: caso.nome, medianaMs: mediana, p95Ms: p95, total, plano })
    console.log(`[medir] ${caso.nome}`)
    console.log(`        mediana=${mediana.toFixed(2)}ms  p95=${p95.toFixed(2)}ms  total=${total}`)
    console.log(`        plano: ${plano.join(' | ')}`)
  }

  // ── SAÍDA MACHINE-READABLE (para o doc copiar sem digitar número) ─────────────────────────────
  console.log('\n=== RESUMO (copiar para docs/pesquisa/medicao-filtro-20k.md) ===')
  console.log(`custo da semeadura: ${tSeed.toFixed(0)} ms para 20.000 cartões`)
  for (const r of resultados) {
    // Qualquer linha que comece com "SCAN" (tabela externa OU subconsulta correlacionada, ex.:
    // "SCAN o" sobre vocab_occurrences) é full scan — não só o caso óbvio de SCAN vocab_cards.
    const fullScan = r.plano.some((p) => /^\s*SCAN\s+\S/i.test(p))
    console.log(`${r.nome} | mediana=${r.medianaMs.toFixed(2)}ms | p95=${r.p95Ms.toFixed(2)}ms | total=${r.total} | ${fullScan ? 'FULL SCAN (REPROVADO)' : 'usa índice'} | ${r.plano.join(' / ')}`)
  }

  await client.close()
  // No Windows o handle do arquivo WAL às vezes ainda não soltou quando chegamos aqui (EPERM);
  // é limpeza de temp dir, não dado do usuário — não vale derrubar o script por isso.
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* best-effort */ }
}

/**
 * Semeia 20.000 cartões em lote — linha a linha levaria uma eternidade (20k round-trips).
 * Estratégia: monta INSERTs multi-row (VALUES (?,?,...),(?,?,...),...) em chunks de 500 linhas
 * e despacha tudo via `client.batch(..., 'write')`, que reusa a MESMA conexão/transação em vez de
 * abrir uma por statement (ver comentário de performance em `server/db/db.ts:115`).
 */
async function semear(client: import('@libsql/client').Client, userId: string): Promise<void> {
  const LANGS = ['en', 'pt', 'ja', 'es']
  const DECKS = ['deck-0', 'deck-1', 'deck-2', 'deck-3', 'deck-4', 'deck-5']
  const NIVEIS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  const N = 20_000
  const now = Date.now()

  type Stmt = { sql: string; args: unknown[] }
  const cardStmts: Stmt[] = []
  const occStmts: Stmt[] = []
  const CHUNK = 500

  const cardCols = [
    'id', 'created_at', 'updated_at', 'user_id', 'session_id', 'word', 'back', 'phonetics', 'sentence',
    'src_lang', 'tgt_lang', 'frequency', 'in_deck', 'box', 'due_at', 'stability', 'difficulty', 'reps',
    'lapses', 'last_review', 'cloze_prompt', 'cloze_answer', 'cefr_level', 'cefr_confidence', 'added_at',
    'norm_key', 'occurrences', 'first_seen_at', 'last_seen_at', 'cefr_source', 'difficulty_score', 'difficulty_at',
  ]
  const occCols = ['id', 'created_at', 'updated_at', 'user_id', 'deleted_at', 'card_id', 'occurred_at', 'origin_kind', 'origin_ref', 'sentence', 'utterance_id']

  const cardIds: string[] = []
  for (let i = 0; i < N; i++) cardIds.push(randomUUID())

  const flush = (tabela: string, cols: string[], rows: unknown[][], out: Stmt[]) => {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const bloco = rows.slice(i, i + CHUNK)
      const placeholders = bloco.map(() => `(${cols.map(() => '?').join(',')})`).join(',')
      out.push({
        sql: `INSERT INTO ${tabela} (${cols.join(',')}) VALUES ${placeholders}`,
        args: bloco.flat(),
      })
    }
  }

  const cardRows: unknown[][] = []
  for (let i = 0; i < N; i++) {
    const id = cardIds[i]
    const lang = LANGS[i % LANGS.length]
    const nivel = NIVEIS[i % NIVEIS.length]
    // due_at: 1/3 nulo (nunca vista), 1/3 passado (pedindo revisão), 1/3 futuro.
    const mod3 = i % 3
    const dueAt = mod3 === 0 ? null : mod3 === 1 ? now - 86_400_000 * (1 + (i % 30)) : now + 86_400_000 * (1 + (i % 30))
    const temBack = i % 10 < 8 // ~80% com tradução
    const temFrase = i % 5 < 3 // ~60% com frase
    cardRows.push([
      id, now, now, userId, null, `palavra-${lang}-${i}`,
      temBack ? `traducao-${i}` : null, null, temFrase ? `frase de exemplo ${i}` : null,
      lang, 'pt', null, 1, 1, dueAt, null, null, null, null, null, null, null,
      nivel, null, now,
      `${lang}|palavra-${lang}-${i}`, 1, now, now, 'wordlist', null, null,
    ])
  }
  flush('vocab_cards', cardCols, cardRows, cardStmts)

  // Ocorrências: TODO cartão tem 1 ocorrência 'anki' (define o baralho, ~3.333 por baralho, 6 baralhos = 20.000).
  // ~15% ganha TAMBÉM uma ocorrência 'trilha'; ~10% ganha TAMBÉM uma ocorrência 'sessao'.
  const occRows: unknown[][] = []
  for (let i = 0; i < N; i++) {
    const id = cardIds[i]
    const deck = DECKS[i % DECKS.length]
    occRows.push([randomUUID(), now, now, userId, null, id, now, 'anki', deck, null, null])
    if (i % 100 < 15) occRows.push([randomUUID(), now, now, userId, null, id, now, 'trilha', LANGS[i % LANGS.length], null, null])
    if (i % 100 < 10) occRows.push([randomUUID(), now, now, userId, null, id, now, 'sessao', `sessao-${i % 50}`, null, null])
  }
  flush('vocab_occurrences', occCols, occRows, occStmts)

  // Um `batch` por tabela: card precisa existir antes da ocorrência (FK — PRAGMA foreign_keys=ON
  // em server/db/db.ts), então não dá para intercalar os dois batches num só.
  for (let i = 0; i < cardStmts.length; i += 40) {
    await client.batch(cardStmts.slice(i, i + 40).map((s) => ({ sql: s.sql, args: s.args as never })), 'write')
  }
  for (let i = 0; i < occStmts.length; i += 40) {
    await client.batch(occStmts.slice(i, i + 40).map((s) => ({ sql: s.sql, args: s.args as never })), 'write')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
