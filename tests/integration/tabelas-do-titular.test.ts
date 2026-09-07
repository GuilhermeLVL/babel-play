/**
 * INVARIANTE: toda tabela do schema com coluna `user_id` entra na exclusão e na exportação da conta.
 *
 * Por que existe: a lista de `contaRepo` era escrita à mão, e a auditoria de 2026-09-07 (achado
 * A06) encontrou seis tabelas com `user_id` fora dela — `seed_credits`, `credit_purchases`,
 * `credit_spends`, `presencas`, `anki_media`, `anki_note_media`. Dado do titular sobrevivia a
 * `DELETE /api/me` sem nenhum teste reclamar, porque o teste de LGPD também usava uma lista à mão.
 *
 * Este teste lê o SCHEMA, não uma lista: uma migration que criar tabela nova com `user_id` sem
 * atualizar a ordem de exclusão falha aqui, citando o nome.
 */
import { describe, it, expect } from 'vitest'
import { is, getTableColumns, getTableName } from 'drizzle-orm'
import { SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as schema from '../../server/db/schema'
import { NOMES_DAS_TABELAS_DO_TITULAR, TABELAS_TRATADAS_A_PARTE } from '../../server/db/repositories/conta'

/** Tabelas com `user_id` no schema, pelo nome da exportação (a chave do módulo). */
function tabelasComUserIdNoSchema(): string[] {
  return Object.entries(schema)
    .filter(([, v]) => is(v, SQLiteTable))
    .filter(([, t]) => 'userId' in getTableColumns(t as SQLiteTable))
    .map(([nome]) => nome)
    .sort()
}

describe('tabelas do titular', () => {
  it('toda tabela com user_id está na lista de exclusão/exportação', () => {
    const noSchema = tabelasComUserIdNoSchema()
    const cobertas = [...NOMES_DAS_TABELAS_DO_TITULAR, ...TABELAS_TRATADAS_A_PARTE]
    const faltando = noSchema.filter((n) => !cobertas.includes(n))
    expect(faltando, `tabelas com user_id fora de TABELAS_DO_TITULAR: ${faltando.join(', ')}`).toEqual([])
    // `secrets` é a única tratada à parte, e por um motivo escrito (chave própria + FK).
    expect(TABELAS_TRATADAS_A_PARTE).toEqual(['secrets'])
  })

  it('a lista não cita tabela que não existe ou não tem user_id', () => {
    const noSchema = tabelasComUserIdNoSchema()
    const sobrando = NOMES_DAS_TABELAS_DO_TITULAR.filter((n) => !noSchema.includes(n))
    expect(sobrando, `na lista sem user_id no schema: ${sobrando.join(', ')}`).toEqual([])
  })

  it('as seis tabelas do achado A06 estão cobertas', () => {
    for (const nome of ['seedCredits', 'creditPurchases', 'creditSpends', 'presencas', 'ankiMedia', 'ankiNoteMedia']) {
      expect(NOMES_DAS_TABELAS_DO_TITULAR, nome).toContain(nome)
    }
  })

  it('a ordem respeita as FOREIGN KEY (filho antes do pai)', () => {
    const posicao = (n: string) => NOMES_DAS_TABELAS_DO_TITULAR.indexOf(n)
    const antes = (filho: string, pai: string) =>
      expect(posicao(filho), `${filho} precisa vir antes de ${pai}`).toBeLessThan(posicao(pai))
    antes('utterances', 'sessions')
    antes('vocabOccurrences', 'vocabCards')
    antes('vocabOccurrences', 'utterances')
    antes('reviewLogs', 'vocabCards')
    antes('exerciseResults', 'vocabCards')
    antes('exerciseResults', 'sessions')
    antes('analyses', 'sessions')
    antes('ankiNoteMedia', 'ankiNotes')
    antes('ankiNoteMedia', 'ankiMedia')
    antes('ankiNotes', 'ankiDecks')
    antes('ankiNotes', 'vocabCards')
    antes('ankiImports', 'ankiDecks')
    antes('vocabCards', 'sessions')
    // Nome real no banco, para o relatório de exclusão bater com o que o titular vê.
    expect(getTableName(schema.ankiNoteMedia)).toBe('anki_note_media')
  })
})
