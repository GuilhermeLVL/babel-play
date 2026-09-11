// Remove do data/babel.db SOMENTE o que a suite E2E semeou pela porta 3100 em 2026-09-11.
// Backup tirado antes: data/babel.db.bak-antes-limpeza-e2e-*. Tudo aqui e idempotente.
import { createClient } from '@libsql/client'
const c = createClient({ url: 'file:data/babel.db' })
const hoje = 1789140000000
const SESSAO_E2E = '73c216da-1062-4f30-972b-cc9e2b5e51c5'
const PALAVRAS = [
  'apple',
  'house',
  'water',
  'bread',
  'chair',
  'table',
  'garden',
  'window',
  'flower',
  'yellow',
  'kitchen',
  'morning',
  'river',
  'stone',
  'cloud',
  'forest',
  'bridge',
  'candle',
]
const lista = PALAVRAS.map((p) => `'${p}'`).join(',')
const cardsE2e = `select id from vocab_cards where src_lang='en' and created_at>${hoje} and word in (${lista})`

const antes = async (s) => (await c.execute(s)).rows[0].n
console.log('sessao e2e:', await antes(`select count(*) n from sessions where id='${SESSAO_E2E}'`))
console.log('utterances da sessao:', await antes(`select count(*) n from utterances where session_id='${SESSAO_E2E}'`))
console.log('cartoes e2e:', await antes(`select count(*) n from vocab_cards where id in (${cardsE2e})`))
console.log(
  'occurrences:',
  await antes(
    `select count(*) n from vocab_occurrences where card_id in (${cardsE2e}) or utterance_id in (select id from utterances where session_id='${SESSAO_E2E}')`,
  ),
)
console.log(
  'review_logs dos cartoes:',
  await antes(`select count(*) n from review_logs where card_id in (${cardsE2e})`),
)
console.log(
  'exercise_results da sessao/cartoes:',
  await antes(`select count(*) n from exercise_results where session_id='${SESSAO_E2E}' or card_id in (${cardsE2e})`),
)

await c.batch(
  [
    `delete from vocab_occurrences where card_id in (${cardsE2e}) or utterance_id in (select id from utterances where session_id='${SESSAO_E2E}')`,
    `delete from review_logs where card_id in (${cardsE2e})`,
    `delete from exercise_results where session_id='${SESSAO_E2E}' or card_id in (${cardsE2e})`,
    `delete from vocab_cards where id in (${cardsE2e})`,
    `delete from utterances where session_id='${SESSAO_E2E}'`,
    `delete from sessions where id='${SESSAO_E2E}'`,
  ],
  'write',
)

// O teste de tema terminou devolvendo o claro; o dono usava o escuro (capturas de tela do dia).
const ui = JSON.parse(String((await c.execute('select ui from settings limit 1')).rows[0].ui))
ui.darkMode = true
await c.execute({ sql: 'update settings set ui=?, updated_at=?', args: [JSON.stringify(ui), Date.now()] })

console.log('--- depois')
console.log(
  'sessoes:',
  await antes('select count(*) n from sessions'),
  'cartoes:',
  await antes('select count(*) n from vocab_cards'),
  'darkMode:',
  JSON.parse(String((await c.execute('select ui from settings limit 1')).rows[0].ui)).darkMode,
)
console.log('integrity:', (await c.execute('pragma integrity_check')).rows[0])
