/**
 * A CÓPIA DO SQLITE PARA O POSTGRES (Fase 1, Tarefa 8) não pode perder dado: cada tabela do schema é
 * lida dos dois lados e comparada por checksum. Aqui a origem é um SQLite migrado pela cadeia legada
 * (`server/db/migrations-sqlite/`) e semeado com três contas, e o destino é um PGlite em memória migrado
 * pela cadeia do Postgres. Os gatilhos do SQLite rodam na semeadura, então as tabelas derivadas
 * (`versoes_de_dados`, `agregados_diarios`, `estado_por_item`, `estado_dos_agregados`) também têm linhas.
 */
import { is, sql } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import * as schema from '../../server/db/schema'
import { type EphemeralDb, setupEphemeralDb } from '../harness/ephemeralDb'
import { abrirSqliteLegado, type SqliteLegado } from '../harness/sqliteLegado'

type ModuloDb = typeof import('../../server/db/db')
type ModuloMigracao = typeof import('../../scripts/migracao/sqlite-para-postgres')

const T0 = 1_790_000_000_000

/** Um SQLite legado com 3 usuários: sessões, falas, cartões, ocorrências, revisões, resultados, Anki,
 *  credencial com segredo e flags mexidas pelo operador. Floats com dízima, texto com acento, emoji,
 *  aspas e quebra de linha, nulos e uma linha soft-deletada: o que costuma divergir numa cópia. */
async function criarSqliteSemeado(opts: { orfa?: boolean } = {}): Promise<SqliteLegado> {
  const legado = await abrirSqliteLegado()
  const c = legado.client
  const ex = (q: string, args: Array<string | number | null> = []) => c.execute({ sql: q, args })

  for (let u = 1; u <= 3; u++) {
    const uid = `user-${u}`
    const t = T0 + u * 1000
    await ex(
      `INSERT INTO users (id, created_at, updated_at, email, role, status, display_name, locale, bio, onboarded_at)
       VALUES (?, ?, ?, ?, 'user', 'active', ?, 'pt-BR', ?, ?)`,
      [
        uid,
        t,
        t,
        `u${u}@exemplo.com`,
        `Usuária ${u} "Ação" 🎬`,
        u === 2 ? null : 'linha 1\nlinha 2',
        u === 3 ? null : t,
      ],
    )
    // Antes das revisões e resultados: os gatilhos do SQLite somam em `marca_bruto` de quem tem linha aqui.
    await ex(`INSERT INTO estado_dos_agregados (user_id, fuso, reconstruido_em) VALUES (?, 'America/Sao_Paulo', ?)`, [
      uid,
      t,
    ])
    await ex(`INSERT INTO settings (id, created_at, updated_at, user_id, ui) VALUES (?, ?, ?, ?, ?)`, [
      `set-${u}`,
      t,
      t,
      uid,
      JSON.stringify({ captureSourceLang: 'en', tema: 'escuro' }),
    ])
    await ex(`INSERT INTO secrets (ref, value_encrypted, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?)`, [
      `ref-${u}`,
      'v1:cifrado==',
      t,
      t,
      uid,
    ])
    await ex(
      `INSERT INTO provider_credentials (id, created_at, updated_at, user_id, label, kind, secret_ref)
       VALUES (?, ?, ?, ?, 'Minha chave', 'openrouter', ?)`,
      [`cred-${u}`, t, t, uid, `ref-${u}`],
    )
    for (let s = 1; s <= 2; s++) {
      const sid = `sess-${u}-${s}`
      await ex(
        `INSERT INTO sessions (id, created_at, updated_at, user_id, deleted_at, title, kind, started_at, ended_at,
           source_lang, target_lang, duration_ms, word_count, status, meta)
         VALUES (?, ?, ?, ?, ?, ?, 'captura', ?, ?, 'en-US', 'pt-BR', ?, ?, 'ended', ?)`,
        [
          sid,
          t + s,
          t + s,
          uid,
          s === 2 && u === 1 ? t + 99 : null,
          `Série ${s}: l'épisode`,
          t,
          t + 60_000,
          60_000,
          42,
          '{"a":1}',
        ],
      )
      for (let f = 0; f < 3; f++) {
        await ex(
          `INSERT INTO utterances (id, created_at, updated_at, user_id, session_id, idx, t_start_ms, t_end_ms, source,
             source_lang, source_text, target_lang, translated_text, status, engine, confidence)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'mic', 'en', ?, 'pt', ?, 'final', 'whisper', ?)`,
          [
            `utt-${u}-${s}-${f}`,
            t + f,
            t + f,
            uid,
            sid,
            f,
            f * 1000,
            f * 1000 + 900,
            `Hello "world" ${f}`,
            `Olá, mundo ${f} — ç`,
            0.1 + 0.2 * f,
          ],
        )
      }
    }
    for (let k = 0; k < 4; k++) {
      const cid = `card-${u}-${k}`
      await ex(
        `INSERT INTO vocab_cards (id, created_at, updated_at, user_id, session_id, word, back, src_lang, tgt_lang, in_deck,
           box, due_at, stability, difficulty, reps, lapses, last_review, cefr_level, cefr_confidence, norm_key, occurrences)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pt', 1, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 1)`,
        [
          cid,
          t + k,
          t + k,
          uid,
          `sess-${u}-1`,
          ['straße', 'naïve', 'Água', 'rain'][k],
          'tradução',
          k === 3 ? null : 'EN-gb',
          k,
          t + 86_400_000,
          k === 0 ? null : 1 / 3 + k,
          1e-7 * k,
          k,
          k === 1 ? null : t,
          k === 2 ? null : 'B1',
          0.30000000000000004,
          `k${k}`,
        ],
      )
      await ex(
        `INSERT INTO vocab_occurrences (id, created_at, updated_at, user_id, card_id, occurred_at, origin_kind, sentence, utterance_id)
         VALUES (?, ?, ?, ?, ?, ?, 'sessao', ?, ?)`,
        [`occ-${u}-${k}`, t, t, uid, cid, t + k, 'uma frase', `utt-${u}-1-0`],
      )
      await ex(
        `INSERT INTO review_logs (id, created_at, updated_at, user_id, card_id, reviewed_at, grade, prev_stability,
           new_stability, elapsed_days, origem, formato, resposta_ms, meta_retencao, retencao_prevista)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'jogo', 'cloze', ?, 0.9, ?)`,
        [`rev-${u}-${k}`, t, t, uid, cid, t + k * 3_600_000, 1 + (k % 4), 2.5, 3.75 + k, 0.5 * k, 1500 + k, 0.87654321],
      )
      await ex(
        `INSERT INTO estado_por_item (user_id, card_id, jogo, acertos, erros, ultimo_resultado, ultimo_em) VALUES (?, ?, 'memory', ?, 1, ?, ?)`,
        [uid, cid, k, k % 2, t + k],
      )
      await ex(
        `INSERT INTO exercise_results (id, created_at, updated_at, user_id, session_id, kind, correct, score, exercise_kind,
           round_id, item_ref, attempts, ms, hinted, origem, card_id, combo, nivel)
         VALUES (?, ?, ?, ?, ?, 'memory', ?, ?, 'memory', ?, ?, 1, ?, 0, 'jogo', ?, ?, 'A2')`,
        [`ex-${u}-${k}`, t + k, t + k, uid, `sess-${u}-1`, k % 2, k / 7, `round-${u}`, cid, 800 + k, cid, k],
      )
    }
    await ex(
      `INSERT INTO agregados_diarios (user_id, idioma, dia, revisoes, acertos, nota3, soma_prevista, itens_de_jogo, atualizado_em)
       VALUES (?, 'en', 20380, 4, 3, 2, ?, 4, ?)`,
      [uid, 0.87654321 * 4, t],
    )
    await ex(
      `INSERT INTO anki_decks (id, created_at, updated_at, user_id, nome, arquivo_origem, estado) VALUES (?, ?, ?, ?, ?, ?, 'ativo')`,
      [`deck-${u}`, t, t, uid, 'Meu baralho', `deck-${u}.apkg`],
    )
    await ex(
      `INSERT INTO anki_imports (id, created_at, updated_at, user_id, deck_id, arquivo, bytes, estado, notas_lidas, por_motivo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'concluida', 2, ?)`,
      [`imp-${u}`, t, t, uid, `deck-${u}`, `deck-${u}.apkg`, 123_456, '{"vazia":0}'],
    )
    await ex(
      `INSERT INTO anki_notes (id, created_at, updated_at, user_id, deck_id, guid, frente, verso, estado, projected_card_id, import_id)
       VALUES (?, ?, ?, ?, ?, ?, 'front', 'back', 'projetada', ?, ?)`,
      [`note-${u}`, t, t, uid, `deck-${u}`, `guid-${u}`, `card-${u}-0`, `imp-${u}`],
    )
    await ex(
      `INSERT INTO seed_credits (id, created_at, updated_at, user_id, credito_id, amount, xp, reason) VALUES (?, ?, ?, ?, ?, ?, ?, 'missao')`,
      [`sc-${u}`, t, t, uid, `cr-${u}`, 10 * u, 5],
    )
    await ex(
      `INSERT INTO usage_counters (id, created_at, updated_at, user_id, metric, window, count) VALUES (?, ?, ?, ?, 'stt', '2026-10', ?)`,
      [`uc-${u}`, t, t, uid, 7 * u],
    )
  }

  // Tabelas globais (sem user_id).
  await ex(
    `INSERT INTO rank (id, criado_em, jogo, apelido, pontos, combo) VALUES ('rank-1', ?, 'termo', 'Zé', 900, 3)`,
    [T0],
  )
  await ex(
    `INSERT INTO gasto_de_ia (mes, micro_usd, chamadas, alerta_80_em, atualizado_em) VALUES ('2026-10', 1234567, 89, ?, ?)`,
    [T0, T0],
  )
  await ex(`INSERT INTO marcas_de_teste (marca, criado_em) VALUES ('hmac-1', ?)`, [T0])
  await ex(
    `INSERT INTO cache_de_traducao (chave, origem, destino, modelo, versao_prompt, traducao, criado_em, usado_em, acertos)
     VALUES ('c1', 'en', 'pt', 'm', 'v1', 'olá', ?, ?, 4)`,
    [T0, T0],
  )
  // O operador mexeu nas flags no banco antigo: a escolha dele tem de sobreviver à semente do Postgres.
  await ex(`UPDATE flags SET habilitada = 1, atualizado_por = 'admin-1', atualizado_em = ? WHERE chave = 'anuncios'`, [
    T0,
  ])
  await ex(`UPDATE flags SET habilitada = 0, atualizado_por = 'admin-1' WHERE chave = 'oferta_planos'`)

  if (opts.orfa) {
    // Uma fala apontando para uma sessão que não existe: o Postgres recusa pela FOREIGN KEY.
    await ex('PRAGMA foreign_keys = OFF')
    await ex(
      `INSERT INTO utterances (id, created_at, updated_at, user_id, session_id, idx) VALUES ('utt-orfa', ?, ?, 'user-1', 'sess-inexistente', 0)`,
      [T0, T0],
    )
  }
  return legado
}

let h: EphemeralDb
let mdb: ModuloDb
let mig: ModuloMigracao
let origem: SqliteLegado

beforeAll(async () => {
  h = await setupEphemeralDb()
  mdb = await h.load<ModuloDb>('../../server/db/db')
  mig = await h.load<ModuloMigracao>('../../scripts/migracao/sqlite-para-postgres')
  origem = await criarSqliteSemeado()
}, 60_000)

afterAll(async () => {
  origem?.fechar()
  await h?.cleanup()
})

async function contar(consulta: ReturnType<typeof sql>): Promise<number> {
  return mdb.linhas<{ n: number }>(await mdb.db.execute(consulta))[0].n
}

/** Gatilhos de usuário (não os internos das FOREIGN KEYs) que não estão ligados. */
const gatilhosDesligados = () =>
  contar(sql`select count(*)::int as n from pg_trigger where not tgisinternal and tgenabled <> 'O'`)

describe('migração SQLite → Postgres', () => {
  it('migra um SQLite semeado e os checksums por tabela batem', async () => {
    const r = await mig.migrarSqliteParaPostgres({ origem: origem.url, destino: mdb.db })
    expect(r.ok).toBe(true)
    for (const t of r.tabelas) {
      expect(t.checksumDestino, t.nome).toBe(t.checksumOrigem)
      expect(t.linhasDestino, t.nome).toBe(t.linhasOrigem)
    }
    const porNome = Object.fromEntries(r.tabelas.map((t) => [t.nome, t]))
    // A semeadura chegou: não é paridade de duas tabelas vazias.
    expect(porNome.users.linhasDestino).toBe(3)
    expect(porNome.utterances.linhasDestino).toBe(18)
    expect(porNome.vocab_cards.linhasDestino).toBe(12)
    expect(porNome.versoes_de_dados.linhasDestino).toBe(3)
    expect(porNome.estado_por_item.linhasDestino).toBe(12)
    expect(porNome.agregados_diarios.linhasDestino).toBe(3)
    expect(porNome.estado_dos_agregados.linhasDestino).toBe(3)
    // A escolha do operador venceu a semente do Postgres.
    const anuncios = mdb.linhas<{ habilitada: boolean; atualizado_por: string }>(
      await mdb.db.execute(sql`select habilitada, atualizado_por from flags where chave = 'anuncios'`),
    )[0]
    expect(anuncios).toEqual({ habilitada: true, atualizado_por: 'admin-1' })
    // A coluna gerada foi calculada pelo Postgres (e entra no checksum dos dois lados).
    const base = mdb.linhas<{ src_lang_base: string }>(
      await mdb.db.execute(sql`select src_lang_base from vocab_cards where id = 'card-1-0'`),
    )[0]
    expect(base.src_lang_base).toBe('en')
    expect(await gatilhosDesligados()).toBe(0)
  })

  it('cobre todas as tabelas do schema: uma tabela nova não fica para trás em silêncio', async () => {
    const r = await mig.migrarSqliteParaPostgres({ origem: origem.url, destino: mdb.db })
    const doSchema = Object.values(schema)
      .filter((v) => is(v, PgTable))
      .map((t) => getTableConfig(t as PgTable).name)
      .sort()
    expect(doSchema.length).toBeGreaterThanOrEqual(38)
    expect(r.tabelas.map((t) => t.nome).sort()).toEqual(doSchema)
  })

  it('a segunda execução é idempotente (ON CONFLICT DO NOTHING) e o relatório continua ok', async () => {
    const antes = await contar(sql`select count(*)::int as n from utterances`)
    const r = await mig.migrarSqliteParaPostgres({ origem: origem.url, destino: mdb.db, tamanhoDoLote: 7 })
    expect(r.ok).toBe(true)
    expect(await contar(sql`select count(*)::int as n from utterances`)).toBe(antes)
    for (const t of r.tabelas) expect(t.checksumDestino, t.nome).toBe(t.checksumOrigem)
  })

  it('uma linha alterada no destino aparece no relatório como divergência da tabela', async () => {
    // `users` não tem gatilho: a alteração fica só nela (numa tabela bruta, o gatilho mexeria também em `versoes_de_dados`).
    await mdb.db.execute(sql`update users set bio = 'linha 1\nlinha 2 ' where id = 'user-1'`)
    const r = await mig.migrarSqliteParaPostgres({ origem: origem.url, destino: mdb.db })
    expect(r.ok).toBe(false)
    const divergentes = r.tabelas.filter((t) => !t.ok).map((t) => t.nome)
    expect(divergentes).toEqual(['users'])
  })

  it('uma carga que falha desfaz tudo e deixa os gatilhos ligados', async () => {
    const comOrfa = await criarSqliteSemeado({ orfa: true })
    try {
      const antes = await contar(sql`select count(*)::int as n from utterances`)
      await expect(mig.migrarSqliteParaPostgres({ origem: comOrfa.url, destino: mdb.db })).rejects.toThrow(/utterances/)
      expect(await contar(sql`select count(*)::int as n from utterances`)).toBe(antes)
      expect(await gatilhosDesligados()).toBe(0)
    } finally {
      comOrfa.fechar()
    }
  })
})
