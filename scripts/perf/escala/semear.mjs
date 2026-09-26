#!/usr/bin/env node
/**
 * SEMEIA UM BANCO SINTÉTICO para a medição de escala (auditoria de prontidão, Fase 2).
 *
 *   DATABASE_URL=file:<tmp>/escala.db npx tsx server/db/migrate.ts     # schema real, migrations reais
 *   node scripts/perf/escala/semear.mjs --db=<tmp>/escala.db [--pesados=200] [--leves=2000] [--medios=0]
 *
 * Tamanhos calibrados pelo banco real (data/babel.db, lido só com readonly em 25/09/2026):
 * 2.901 cartões do dono; comprimento médio word 6,6 · back 44 · sentence 64 · cloze_prompt 68 ·
 * source_text 45 · translated_text 27; 79% das ocorrências são `anki`.
 *
 * PERFIS (ids determinísticos, para os geradores de carga acharem cartão e usuário sem consultar):
 *   local-owner   "mega": 3.000 cartões, 200 sessões × 100 falas, 5.000 revisões, 5.000 exercícios
 *                 (o único usuário do modo self-host; é o caso d. da medição).
 *   u-p-NNNN      "pesado típico": 3.000 cartões, 20 sessões × 100 falas, 1.000 revisões, 1.000 exercícios.
 *   u-m-NNNN      "médio" (só com --medios=N): 150 cartões, 2 sessões × 40 falas, 100 revisões, 100 exercícios.
 *   u-l-NNNN      "leve": 20 cartões, 1 sessão × 20 falas — pool de tokens para as rotas de escrita
 *                 (o writeLimiter é 120/min POR USUÁRIO; um pool evita medir só 429).
 * Todo usuário ganha `idades_declaradas` adulta (sem ela `exigirContaLiberada` recusa no modo público).
 *
 * Usa o driver `libsql` síncrono direto, em transação — é só semeadura, não medição.
 */
import Database from 'libsql'

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`))
  return a ? a.slice(n.length + 3) : d
}
const arquivo = arg('db', '')
if (!arquivo) {
  console.error('uso: node scripts/perf/escala/semear.mjs --db=<arquivo.db> [--pesados=200] [--leves=2000]')
  process.exit(2)
}
const PESADOS = Number(arg('pesados', 200))
const LEVES = Number(arg('leves', 2000))
/* `u-m-NNNN` "médio" (Fase 4, suíte de carga): 150 cartões, 2 sessões × 40 falas, 100 revisões e 100
   exercícios — o usuário que a mistura realista usa na maior parte dos VUs. Padrão 0: a medição da
   Fase 2 não muda. */
const MEDIOS = Number(arg('medios', 0))
const MEGA_SESSOES = Number(arg('mega-sessoes', 200))

const db = new Database(arquivo)
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=OFF;')

// Gerador determinístico (mulberry32) — duas semeaduras dão o mesmo banco.
let s = 0x9e3779b9
const rnd = () => {
  s |= 0
  s = (s + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const SIL = ['ka', 'lo', 'mer', 'ti', 'sun', 'da', 're', 'po', 'vin', 'ghe', 'the', 'and', 'ing', 'wor', 'ld']
const palavra = () =>
  Array.from({ length: 2 + Math.floor(rnd() * 2) }, () => SIL[Math.floor(rnd() * SIL.length)]).join('')
const texto = (chars) => {
  let t = ''
  while (t.length < chars) t += (t ? ' ' : '') + palavra()
  return t.slice(0, chars)
}
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', null]
const AGORA = Date.now()
const DIA = 86_400_000

const ins = {
  user: db.prepare(
    `insert into users (id, created_at, updated_at, email, role, status) values (?, ?, ?, ?, 'user', 'active')`,
  ),
  idade: db.prepare(
    `insert into idades_declaradas (id, created_at, updated_at, user_id, nascimento) values (?, ?, ?, ?, '1990-01-01')`,
  ),
  sessao:
    db.prepare(`insert into sessions (id, created_at, updated_at, user_id, title, kind, started_at, ended_at, source_lang, target_lang, duration_ms, word_count, status, meta)
                      values (?, ?, ?, ?, ?, 'live', ?, ?, 'en', 'pt', ?, ?, 'done', '{"fonte":"mic","modelo":"whisper-base","versao":2,"x":"yyyyyyyyyyyyyyyyyyyyy"}')`),
  fala: db.prepare(`insert into utterances (id, created_at, updated_at, user_id, session_id, idx, t_start_ms, t_end_ms, speaker_id, source, source_lang, source_text, target_lang, translated_text, status, engine, confidence)
                    values (?, ?, ?, ?, ?, ?, ?, ?, 's1', ?, 'en', ?, 'pt', ?, 'final', 'whisper', 0.9)`),
  cartao:
    db.prepare(`insert into vocab_cards (id, created_at, updated_at, user_id, session_id, word, back, sentence, src_lang, tgt_lang, in_deck, box, due_at, stability, difficulty, reps, lapses, last_review,
                        cloze_prompt, cloze_answer, cefr_level, cefr_confidence, added_at, norm_key, occurrences, first_seen_at, last_seen_at, cefr_source, difficulty_score, difficulty_at)
                      values (?, ?, ?, ?, ?, ?, ?, ?, 'en', 'pt', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.4, ?, ?, 1, ?, ?, 'lista', ?, ?)`),
  ocorrencia: db.prepare(
    `insert into vocab_occurrences (id, created_at, updated_at, user_id, card_id, occurred_at, origin_kind, origin_ref, sentence) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ),
  revisao: db.prepare(
    `insert into review_logs (id, created_at, updated_at, user_id, card_id, reviewed_at, grade, prev_stability, new_stability, prev_due, new_due, elapsed_days) values (?, ?, ?, ?, ?, ?, ?, 1.2, 3.4, ?, ?, 2)`,
  ),
  exercicio:
    db.prepare(`insert into exercise_results (id, created_at, updated_at, user_id, kind, correct, score, exercise_kind, round_id, item_ref, attempts, ms, origem, card_id)
                         values (?, ?, ?, ?, 'memory', ?, 100, 'memory', ?, ?, 1, 1200, 'perf', ?)`),
}

function semearUsuario(uid, p) {
  const t0 = AGORA - 180 * DIA
  ins.user.run(uid, t0, t0, `${uid}@exemplo.test`)
  ins.idade.run(`idade-${uid}`, t0, t0, uid)
  const sessoes = []
  for (let si = 0; si < p.sessoes; si++) {
    const sid = `s-${uid}-${si}`
    const ts = t0 + Math.floor(rnd() * 180 * DIA)
    ins.sessao.run(sid, ts, ts, uid, `Sessão ${si} ${texto(20)}`, ts, ts + 600_000, 600_000, p.falas * 8)
    sessoes.push(sid)
    for (let fi = 0; fi < p.falas; fi++) {
      ins.fala.run(
        `f-${uid}-${si}-${fi}`,
        ts,
        ts,
        uid,
        sid,
        fi,
        fi * 5000,
        fi * 5000 + 4200,
        fi % 2 ? 'tab' : 'mic',
        texto(45),
        texto(27),
      )
    }
  }
  for (let ci = 0; ci < p.cartoes; ci++) {
    const cid = `c-${uid}-${ci}`
    const ta = t0 + Math.floor(rnd() * 180 * DIA)
    const w = `${palavra()}${ci}`
    const revisado = rnd() < 0.6
    ins.cartao.run(
      cid,
      ta,
      ta,
      uid,
      sessoes.length ? sessoes[ci % sessoes.length] : null,
      w,
      texto(44),
      texto(64),
      1 + Math.floor(rnd() * 5),
      revisado ? AGORA + Math.floor((rnd() - 0.3) * 30 * DIA) : null,
      revisado ? 1 + rnd() * 20 : null,
      revisado ? 1 + rnd() * 9 : null,
      revisado ? Math.floor(rnd() * 10) : 0,
      revisado ? Math.floor(rnd() * 3) : 0,
      revisado ? ta + DIA : null,
      texto(68),
      texto(7),
      CEFR[Math.floor(rnd() * CEFR.length)],
      ta,
      w.toLowerCase(),
      ta,
      ta,
      rnd(),
      ta,
    )
    const anki = rnd() < 0.79
    ins.ocorrencia.run(
      `o-${uid}-${ci}`,
      ta,
      ta,
      uid,
      cid,
      ta,
      anki ? 'anki' : 'sessao',
      anki ? `deck-${uid}-${ci % 3}` : (sessoes[0] ?? null),
      texto(64),
    )
  }
  for (let ri = 0; ri < p.revisoes; ri++) {
    const tr = t0 + Math.floor(rnd() * 180 * DIA)
    ins.revisao.run(
      `r-${uid}-${ri}`,
      tr,
      tr,
      uid,
      `c-${uid}-${ri % p.cartoes}`,
      tr,
      1 + Math.floor(rnd() * 4),
      tr,
      tr + 3 * DIA,
    )
  }
  for (let ei = 0; ei < p.exercicios; ei++) {
    const te = t0 + Math.floor(rnd() * 180 * DIA)
    const card = `c-${uid}-${ei % p.cartoes}`
    ins.exercicio.run(
      `e-${uid}-${ei}`,
      te,
      te,
      uid,
      rnd() < 0.7 ? 1 : 0,
      `rodada-${uid}-${Math.floor(ei / 10)}`,
      card,
      card,
    )
  }
}

const MEGA = { sessoes: MEGA_SESSOES, falas: 100, cartoes: 3000, revisoes: 5000, exercicios: 5000 }
const PESADO = { sessoes: 20, falas: 100, cartoes: 3000, revisoes: 1000, exercicios: 1000 }
const LEVE = { sessoes: 1, falas: 20, cartoes: 20, revisoes: 0, exercicios: 0 }
const MEDIO = { sessoes: 2, falas: 40, cartoes: 150, revisoes: 100, exercicios: 100 }

const t = performance.now()
const lote = db.transaction((fn) => fn())
lote(() => semearUsuario('local-owner', MEGA))
for (let i = 0; i < PESADOS; i++) lote(() => semearUsuario(`u-p-${String(i).padStart(4, '0')}`, PESADO))
for (let i = 0; i < LEVES; i++) lote(() => semearUsuario(`u-l-${String(i).padStart(4, '0')}`, LEVE))
for (let i = 0; i < MEDIOS; i++) lote(() => semearUsuario(`u-m-${String(i).padStart(4, '0')}`, MEDIO))
db.exec('PRAGMA wal_checkpoint(TRUNCATE); ANALYZE;')
const cont = (tb) => db.prepare(`select count(*) n from ${tb}`).get().n
console.log(
  JSON.stringify({
    arquivo,
    ms: Math.round(performance.now() - t),
    users: cont('users'),
    sessions: cont('sessions'),
    utterances: cont('utterances'),
    vocab_cards: cont('vocab_cards'),
    review_logs: cont('review_logs'),
    exercise_results: cont('exercise_results'),
    bytes: db.prepare('select page_count*page_size b from pragma_page_count(), pragma_page_size()').get().b,
  }),
)
db.close()
