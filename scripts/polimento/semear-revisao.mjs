#!/usr/bin/env node
/**
 * SEMEIA UM BANCO DE TESTE PARA VER A REVISÃO ENXUTA E AS PRÁTICAS (`docs/prototipos/cartoes-enxuto.html`):
 * uma sessão COM ÁUDIO e com quem falou (a cena do verso e a "Fala original"), uma sessão sem áudio,
 * palavras soltas, um baralho do Anki com uma palavra que também foi capturada ("Juntar a cena") e uma
 * palavra com 8 erros (a linha "não está entrando").
 *
 *     PORT=4340 DATABASE_URL=file:<tmp>/revisao.db AUDIO_DIR=<tmp>/audio node subir-dev.mjs
 *     node scripts/polimento/semear-revisao.mjs --base=http://localhost:4340 --db=<tmp>/revisao.db [--zerar]
 *
 * NUNCA aponte para `data/babel.db`: o script recusa. Tudo entra pelas rotas de verdade; só o passado
 * (vencimento, estabilidade, erros) é escrito direto no banco de teste, como em `semear-cartoes.mjs`.
 * O áudio é um tom gerado aqui (WAV de 70 s): serve para o trecho tocar, não para ser ouvido.
 */
import { readFile } from 'node:fs/promises'

import Database from 'libsql'

const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`))
  return a ? a.slice(n.length + 3) : d
}
const BASE = arg('base', 'http://localhost:4340')
const ARQUIVO = arg('db', '')
if (!ARQUIVO || /data[\\/]babel\.db$/i.test(ARQUIVO)) {
  console.error('uso: node scripts/polimento/semear-revisao.mjs --base=<url> --db=<arquivo de TESTE>')
  process.exit(2)
}

const json = async (caminho, metodo, corpo) => {
  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  if (!r.ok) throw new Error(`${metodo} ${caminho} devolveu ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

/** Um WAV mono de 8 kHz com um tom que muda a cada fala: dá para ouvir que o trecho certo tocou. */
function tom(segundos) {
  const taxa = 8000
  const n = taxa * segundos
  const b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + n * 2, 4)
  b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(taxa, 24)
  b.writeUInt32LE(taxa * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    const f = 220 + 55 * Math.floor(i / taxa / 5)
    b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * f * i) / taxa) * 6000), 44 + i * 2)
  }
  return b
}

/* `--zerar`: esvazia os cartões, as sessões e as revisões do banco de teste antes de semear (os
   roteiros que percorrem a sessão até o fim dão notas, e o seguinte precisa da fila cheia de novo). */
if (process.argv.includes('--zerar')) {
  const limpo = new Database(ARQUIVO)
  limpo.exec('PRAGMA foreign_keys = OFF')
  for (const tabela of [
    'review_logs',
    'exercise_results',
    'estado_por_item',
    'agregados_diarios',
    'estado_dos_agregados',
    'vocab_occurrences',
    'anki_notes',
    'anki_decks',
    'anki_imports',
    'vocab_cards',
    'utterances',
    'sessions',
  ])
    limpo.exec(`DELETE FROM ${tabela}`)
  limpo.close()
}

await json('/api/settings', 'PUT', { ui: { onboarded: true, providerMode: 'local', credentialId: null } })

/* [palavra, tradução, frase, tradução da frase, quem falou] — as falas do protótipo (`cartoes.js:66-136`). */
const REUNIAO = [
  ['complain', 'reclamar', "That's a big deal. Customers were complaining about it.", 'Isso é importante. Os clientes estavam reclamando disso.', 'Ana'],
  ['dashboard', 'painel', 'We ship it today, but the dashboard needs one more review.', 'Entregamos hoje, mas o painel precisa de mais uma revisão.', 'Leo'],
  ['roadmap', 'roteiro, plano de entregas', 'So, are we still shipping the roadmap today?', 'Então, ainda vamos entregar o roteiro hoje?', 'Ana'],
  ['walk through', 'explicar passo a passo', 'Fair enough. Can you walk me through the changes?', 'Justo. Você pode me explicar as mudanças passo a passo?', 'Leo'],
  ['onboarding', 'entrada, primeiros passos', 'We rewrote the onboarding and cut the loading time in half.', 'Reescrevemos a entrada e cortamos o tempo de carga pela metade.', 'Ana'],
  ['release', 'lançamento', "Then let's celebrate after the release.", 'Então vamos comemorar depois do lançamento.', 'Leo'],
  ['put off', 'adiar', "We can't put off the release again.", 'Não podemos adiar o lançamento de novo.', 'Leo'],
  ['thorough', 'minucioso, completo', 'The review was thorough, but the team was small.', 'A revisão foi minuciosa, mas a equipe era pequena.', 'Ana'],
  ['thorough', 'minucioso, completo', 'She gave the plan a thorough reading.', 'Ela leu o plano com cuidado.', 'Leo'],
]
const PODCAST = [
  ['nap', 'cochilo', 'A short nap can restore your attention for hours.', 'Um cochilo curto pode restaurar a sua atenção por horas.', 'Narrador'],
  ['deprive', 'privar', 'If you deprive the brain of sleep, memory is the first to suffer.', 'Se você priva o cérebro de sono, a memória é a primeira a sofrer.', 'Narrador'],
  ['drowsy', 'sonolento', 'You feel drowsy after lunch for a reason.', 'Você fica sonolento depois do almoço por um motivo.', 'Narrador'],
  ['though', 'embora; no entanto', 'It works, though nobody knows exactly why.', 'Funciona, embora ninguém saiba exatamente por quê.', 'Narrador'],
]
const SOLTAS = [
  ['commute', 'trajeto até o trabalho', 'Without the commute, people gained almost an hour a day.'],
  ['shelf', 'prateleira', 'The book is on the top shelf.'],
  ['towel', 'toalha', 'Bring a towel if you want to swim.'],
]

async function sessao(titulo, falas, comAudio) {
  const { id } = await json('/api/sessions', 'POST', {
    title: titulo,
    kind: 'mic',
    sourceLang: 'en',
    targetLang: 'pt-BR',
    status: 'done',
    durationMs: 70_000,
    utterances: falas.map(([, , frase, traducao, quem], idx) => ({
      idx,
      source: 'mic',
      speakerName: quem,
      sourceLang: 'en',
      targetLang: 'pt-BR',
      sourceText: frase,
      translatedText: traducao,
      tStartMs: 38_000 + idx * 5000 - (idx ? 33_000 : 0),
      tEndMs: 38_000 + idx * 5000 - (idx ? 33_000 : 0) + 4000,
    })),
  })
  if (comAudio) {
    const r = await fetch(`${BASE}/api/sessions/${id}/audio`, {
      method: 'POST',
      headers: { 'content-type': 'audio/wav' },
      body: tom(70),
    })
    if (!r.ok) throw new Error(`POST áudio devolveu ${r.status}: ${(await r.text()).slice(0, 200)}`)
  }
  /* Uma entrada por fala: a mesma palavra em duas falas vira um cartão com duas ocorrências. */
  for (const [word, back, sentence] of falas)
    await json('/api/vocab/bulk-add', 'POST', {
      cards: [{ word, back, sentence, srcLang: 'en', tgtLang: 'pt-BR', sessionId: id }],
    })
  return id
}

/* O Anki primeiro: "put off" e as outras palavras do baralho entram sem sessão. */
const apkg = await readFile('tests/fixtures/baralho-moderno.apkg')
const imp = await fetch(`${BASE}/api/import/anki`, {
  method: 'POST',
  headers: { 'content-type': 'application/octet-stream', 'x-filename': 'baralho-moderno.apkg', 'x-src-lang': 'en' },
  body: new Uint8Array(apkg),
})
if (!imp.ok) throw new Error(`POST /api/import/anki devolveu ${imp.status}`)
/* Uma palavra colada à mão que DEPOIS aparece numa captura: o convite "Juntar a cena". */
await json('/api/vocab/bulk-add', 'POST', {
  cards: [{ word: 'put off', back: 'adiar', sentence: 'Never put off until tomorrow what you can do today.', srcLang: 'en', tgtLang: 'pt-BR' }],
})
await sessao('Reunião de produto', REUNIAO, true)
await sessao('Podcast: The science of sleep', PODCAST, false)
await json('/api/vocab/bulk-add', 'POST', {
  cards: SOLTAS.map(([word, back, sentence]) => ({ word, back, sentence, srcLang: 'en', tgtLang: 'pt-BR' })),
})

/* O passado, direto no banco de teste: tudo vence agora; "complain" abre a fila e "thorough" tem 8 erros. */
const db = new Database(ARQUIVO)
const agora = Date.now()
const cartoes = db
  .prepare('SELECT id, word FROM vocab_cards WHERE deleted_at IS NULL AND due_at IS NOT NULL ORDER BY word')
  .all()
const gravar = db.prepare(
  'UPDATE vocab_cards SET due_at = ?, stability = ?, difficulty = ?, reps = ?, lapses = ?, last_review = ?, updated_at = ? WHERE id = ?',
)
const ORDEM = ['complain', 'thorough', 'put off', 'dashboard', 'nap', 'walk through', 'commute']
db.exec('BEGIN')
cartoes.forEach((c, i) => {
  const lugar = ORDEM.indexOf(c.word)
  const due = agora - (lugar >= 0 ? (ORDEM.length - lugar) * 3_600_000 * 24 : 3_600_000 + i * 60_000)
  if (c.word === 'towel' || c.word === 'shelf') return // novas: ficam como a rota gravou
  gravar.run(due, 4 + i, 5, 3, c.word === 'thorough' ? 7 : i % 2, agora - 3 * 86_400_000, agora, c.id)
})
db.exec('COMMIT')
db.close()
console.log(`${cartoes.length} cartões prontos para a revisão`)
