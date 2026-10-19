/**
 * O `--zerar` de `semear-revisao.mjs`: esvazia cartões, sessões, revisões e Anki do banco de teste.
 * Em módulo próprio para o teste exercitar a ORDEM dos DELETEs contra o schema real: no Postgres a FK é
 * checada na hora, então todo filho tem de sair antes do pai (`anki_imports` e `anki_notes` antes de
 * `anki_decks`; `vocab_cards` e `utterances` antes de `sessions`).
 */
export const TABELAS_A_ZERAR = [
  'review_logs',
  'exercise_results',
  'estado_por_item',
  'agregados_diarios',
  'estado_dos_agregados',
  'vocab_occurrences',
  'anki_notes',
  'anki_imports',
  'anki_decks',
  'vocab_cards',
  'utterances',
  'sessions',
]

/** `banco.consultar(sql)` como o de `_banco.mjs`. */
export async function zerarBanco(banco) {
  for (const tabela of TABELAS_A_ZERAR) await banco.consultar(`DELETE FROM ${tabela}`)
}
