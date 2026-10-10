#!/usr/bin/env node
/**
 * SEMEIA UM BANCO DE TESTE PARA VER A TELA CARTÕES com dados parecidos com os do protótipo
 * (`cartoes.js:66-136`): duas sessões com cartões, palavras soltas em dois idiomas, um baralho do Anki
 * e 12 semanas de revisões.
 *
 *     PORT=3203 DATABASE_URL=file:<tmp>/cartoes.db AUDIO_DIR=<tmp>/audio node subir-dev.mjs
 *     node scripts/polimento/semear-cartoes.mjs --base=http://localhost:3203 --db=<tmp>/cartoes.db [--estado=normal]
 *
 * NUNCA aponte para `data/babel.db`: o script recusa. Os cartões e as sessões entram pelas rotas de
 * verdade (as mesmas das fixtures dos e2e); só o PASSADO (datas de vencimento, estabilidade e o
 * histórico de revisões) é escrito direto no banco, porque nenhuma rota grava revisão com data antiga.
 *
 * `--estado`: `normal` (padrão: há o que vence agora), `feito` (nada vence), `primeiro` (cartões sem
 * nenhuma revisão) ou `vazio` (só marca o tour como visto).
 */
import { readFile } from 'node:fs/promises'

import Database from 'libsql'

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`))
  return a ? a.slice(n.length + 3) : d
}
const BASE = arg('base', 'http://localhost:3203')
const ARQUIVO = arg('db', '')
const ESTADO = arg('estado', 'normal')
if (!ARQUIVO || /data[\\/]babel\.db$/i.test(ARQUIVO)) {
  console.error('uso: node scripts/polimento/semear-cartoes.mjs --base=<url> --db=<arquivo de TESTE> [--estado=...]')
  process.exit(2)
}

const DIA = 86_400_000
const json = async (caminho, metodo, corpo) => {
  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  if (!r.ok) throw new Error(`${metodo} ${caminho} devolveu ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

await json('/api/settings', 'PUT', { ui: { onboarded: true, providerMode: 'local', credentialId: null } })
if (ESTADO === 'vazio') {
  console.log('banco sem cartões: só o tour foi marcado como visto')
  process.exit(0)
}

/* As sessões e as palavras do protótipo (`CT_BARALHOS` e `CT_CARTOES`). */
const SESSOES = [
  {
    titulo: 'Reunião de produto: roadmap do trimestre',
    lang: 'en',
    cartoes: [
      ['dashboard', 'painel', 'We ship it today, but the dashboard needs one more review.'],
      ['roadmap', 'roteiro, plano de entregas', 'So, are we still shipping the roadmap today?'],
      ['walk through', 'explicar passo a passo', 'Fair enough. Can you walk me through the changes?'],
      ['onboarding', 'entrada, primeiros passos', 'We rewrote the onboarding and cut the loading time in half.'],
      ['complain', 'reclamar', "That's a big deal. Customers were complaining about it."],
      ['release', 'lançamento', "Then let's celebrate after the release."],
      ['ship', 'entregar, lançar', 'We ship it today, but the dashboard needs one more review.'],
      ['customers', 'clientes', "That's a big deal. Customers were complaining about it."],
    ],
  },
  {
    titulo: 'Podcast: The science of sleep',
    lang: 'en',
    cartoes: [
      ['thorough', 'minucioso, completo', 'The study was thorough, but the group was small.'],
      ['nap', 'cochilo', 'A short nap can restore your attention for hours.'],
      ['deprive', 'privar', 'If you deprive the brain of sleep, memory is the first to suffer.'],
      ['drowsy', 'sonolento', 'You feel drowsy after lunch for a reason.'],
      ['overnight', 'durante a noite', 'Memories are consolidated overnight.'],
      ['though', 'embora; no entanto', 'It works, though nobody knows exactly why.'],
    ],
  },
  {
    titulo: 'Aula de espanhol: pretérito perfeito',
    lang: 'es',
    cartoes: [
      ['madrugar', 'acordar muito cedo', 'Hoy he madrugado para estudiar antes del trabajo.'],
      ['todavía', 'ainda', 'Todavía no he terminado la tarea.'],
      ['tarea', 'tarefa, lição', 'Todavía no he terminado la tarea.'],
    ],
  },
]
const SOLTAS = [
  ['commute', 'trajeto até o trabalho', 'Without the commute, people gained almost an hour a day.'],
  ['burnout', 'esgotamento', 'Remote work did not end burnout; it moved it home.'],
  ['shelf', 'prateleira', 'The book is on the top shelf.'],
  ['towel', 'toalha', 'Bring a towel if you want to swim.'],
  ['layout', 'disposição dos elementos', 'We tried four layouts before this one felt right.'],
]

for (const s of SESSOES) {
  const { id } = await json('/api/sessions', 'POST', {
    title: s.titulo,
    kind: 'mic',
    sourceLang: s.lang,
    targetLang: 'pt-BR',
    status: 'done',
    durationMs: 38 * 60_000,
    utterances: s.cartoes.map(([, , frase], idx) => ({
      idx,
      source: 'mic',
      sourceLang: s.lang,
      targetLang: 'pt-BR',
      sourceText: frase,
      translatedText: frase,
      tStartMs: idx * 5000,
      tEndMs: idx * 5000 + 4000,
    })),
  })
  await json('/api/vocab/bulk-add', 'POST', {
    cards: s.cartoes.map(([word, back, sentence]) => ({
      word,
      back,
      sentence,
      srcLang: s.lang,
      tgtLang: 'pt-BR',
      sessionId: id,
    })),
  })
}
await json('/api/vocab/bulk-add', 'POST', {
  cards: SOLTAS.map(([word, back, sentence]) => ({ word, back, sentence, srcLang: 'en', tgtLang: 'pt-BR' })),
})
const apkg = await readFile('tests/fixtures/baralho-moderno.apkg')
const imp = await fetch(`${BASE}/api/import/anki`, {
  method: 'POST',
  headers: { 'content-type': 'application/octet-stream', 'x-filename': 'baralho-moderno.apkg', 'x-src-lang': 'en' },
  body: new Uint8Array(apkg),
})
if (!imp.ok) throw new Error(`POST /api/import/anki devolveu ${imp.status}`)

if (ESTADO === 'primeiro') {
  console.log('cartões semeados, nenhuma revisão')
  process.exit(0)
}

/* O PASSADO, direto no banco de teste. Um gerador fixo, para o desenho não mudar a cada semeadura. */
let semente = 7
const sorteio = () => ((semente = (semente * 9301 + 49297) % 233280), semente / 233280)
const db = new Database(ARQUIVO)
const agora = Date.now()
const hoje = new Date(agora)
hoje.setHours(0, 0, 0, 0)
const inicioDoDia = hoje.getTime()
const cartoes = db
  .prepare(
    'SELECT id, user_id AS userId FROM vocab_cards WHERE deleted_at IS NULL AND due_at IS NOT NULL ORDER BY word',
  )
  .all()
const gravarCartao = db.prepare(
  'UPDATE vocab_cards SET due_at = ?, stability = ?, difficulty = ?, reps = ?, lapses = ?, last_review = ?, updated_at = ? WHERE id = ?',
)
const gravarRevisao = db.prepare(
  'INSERT INTO review_logs (id, created_at, updated_at, user_id, card_id, reviewed_at, grade, prev_stability, new_stability, prev_due, new_due, elapsed_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
)
/* Quantos vencem agora. A pilha não precisa de outro banco: basta baixar os limites da rodada no navegador
   (`revisao.novasPorDia`, `revisao.revisoesPorDia`), como os roteiros `cartoes-hoje-pilha*.json` fazem. */
const novasAgora = ESTADO === 'feito' ? 0 : 5
const aprendendoAgora = ESTADO === 'feito' ? 0 : 3
const revisarAgora = ESTADO === 'feito' ? 0 : 9
let n = 0
db.exec('BEGIN')
cartoes.forEach((c, i) => {
  if (i < novasAgora) return // nova: fica como a rota gravou (vence agora, sem estabilidade)
  const aprendendo = i < novasAgora + 3
  const vence = aprendendo ? i < novasAgora + aprendendoAgora : i < novasAgora + 3 + revisarAgora
  const estabilidade = aprendendo ? 0.6 + sorteio() : 2 + Math.floor(sorteio() * 40)
  const repeticoes = aprendendo ? 1 : 2 + Math.floor(sorteio() * 6)
  const lapsos = i % 9 === 0 ? 8 : Math.floor(sorteio() * 3)
  const due = vence
    ? agora - Math.floor(sorteio() * 2 * DIA) - 60_000
    : inicioDoDia + (1 + Math.floor(sorteio() * 28)) * DIA + 9 * 3_600_000
  const ultima = agora - (1 + Math.floor(sorteio() * 6)) * DIA
  gravarCartao.run(due, estabilidade, 3 + sorteio() * 5, repeticoes, lapsos, ultima, agora, c.id)
  /* O histórico: revisões espalhadas pelas 12 semanas, mais densas nas últimas; "Errei" em 1 de 9. */
  const quantas = aprendendo ? 1 : 6 + Math.floor(sorteio() * 10)
  for (let k = 0; k < quantas; k++) {
    const atras = Math.floor(Math.pow(sorteio(), 1.6) * 80) + (ESTADO === 'feito' && k === 0 ? 0 : 1)
    const quando = inicioDoDia - atras * DIA + Math.floor(sorteio() * 14 * 3_600_000) + 7 * 3_600_000
    const r = sorteio()
    const nota = r < 0.11 ? 1 : r < 0.2 ? 2 : r < 0.88 ? 3 : 4
    gravarRevisao.run(`sem-${++n}`, quando, quando, c.userId, c.id, quando, nota, 1, estabilidade, quando, due, 1)
  }
})
db.exec('COMMIT')
db.close()
console.log(`${cartoes.length} cartões com passado, ${n} revisões (${ESTADO})`)
