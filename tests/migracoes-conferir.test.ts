/**
 * O portão de migrations expand/contract (`scripts/migracoes/conferir.mjs`) reprova o que deve e
 * deixa passar o que deve. Uma regra de portão que nunca reprova tem a mesma cara de "tudo limpo".
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  conferirContratoSozinho,
  conferirJournal,
  conferirMigracao,
  conferirPasta,
  semComentarios,
} from '../scripts/migracoes/conferir.mjs'

const REV = '-- REVERSAO: DROP INDEX x.\n'

describe('conferirMigracao — expand por padrão', () => {
  it('aditiva com REVERSAO passa', () => {
    expect(conferirMigracao('0031_a.sql', `${REV}CREATE INDEX IF NOT EXISTS x ON t (a);`).erros).toEqual([])
    expect(
      conferirMigracao('0031_a.sql', `-- REVERSÃO: DROP COLUMN.\nALTER TABLE t ADD c TEXT NOT NULL DEFAULT '';`).erros,
    ).toEqual([])
  })

  it.each([
    ['DROP TABLE', 'DROP TABLE t;'],
    ['DROP COLUMN', 'ALTER TABLE t DROP COLUMN c;'],
    ['RENAME', 'ALTER TABLE t RENAME TO u;'],
    ['RENAME', 'ALTER TABLE t RENAME COLUMN a TO b;'],
    ['NOT NULL sem DEFAULT', 'ALTER TABLE t ADD c TEXT NOT NULL;'],
  ])('reprova %s sem marcador de contrato', (nome, sql) => {
    const { erros } = conferirMigracao('0031_a.sql', REV + sql)
    expect(erros).toHaveLength(1)
    expect(erros[0]).toContain(nome.split(' ')[0])
  })

  it('a recriação de tabela do drizzle (__new_x + DROP + RENAME) é destrutiva', () => {
    const sql = `${REV}CREATE TABLE __new_t (a TEXT);\n--> statement-breakpoint\nINSERT INTO __new_t SELECT a FROM t;\n--> statement-breakpoint\nDROP TABLE t;\n--> statement-breakpoint\nALTER TABLE __new_t RENAME TO t;`
    expect(conferirMigracao('0031_a.sql', sql).erros[0]).toMatch(/DROP TABLE, RENAME/)
  })

  it('comentário não conta como SQL (o REVERSAO costuma citar DROP)', () => {
    expect(
      conferirMigracao('0031_a.sql', '-- REVERSAO: DROP TABLE t;\n/* DROP COLUMN */\nCREATE TABLE t (a TEXT);').erros,
    ).toEqual([])
    expect(semComentarios('a -- DROP TABLE\nb')).not.toMatch(/DROP/)
  })

  it('com `-- CONTRATO:` justificado a destrutiva passa; marcador vazio não vale', () => {
    const ok = conferirMigracao(
      '0031_a.sql',
      `${REV}-- CONTRATO: coluna x sem leitura desde a 0.4.0\nALTER TABLE t DROP COLUMN x;`,
    )
    expect(ok.erros).toEqual([])
    expect(ok.contrato).toBe('coluna x sem leitura desde a 0.4.0')
    expect(conferirMigracao('0031_a.sql', `${REV}-- CONTRATO: x\nDROP TABLE t;`).erros[0]).toMatch(/justificativa/)
  })

  it('exige REVERSAO', () => {
    expect(conferirMigracao('0031_a.sql', 'CREATE TABLE t (a TEXT);').erros[0]).toMatch(/REVERSAO/)
  })
})

describe('conferirContratoSozinho — contrato vem num diff só dele', () => {
  const contratos = ['0031_remove_x.sql']
  it('passa quando só migration, snapshot e schema.ts mudaram', () => {
    expect(
      conferirContratoSozinho(
        [
          'server/db/migrations/0031_remove_x.sql',
          'server/db/migrations/meta/0031_snapshot.json',
          'server/db/schema.ts',
          'docs/runbook.md',
        ],
        contratos,
      ),
    ).toEqual([])
  })
  it('reprova quando código de servidor ou cliente veio junto', () => {
    const erros = conferirContratoSozinho(
      ['server/db/migrations/0031_remove_x.sql', 'server/routes/vocab.ts', 'src/App.tsx'],
      contratos,
    )
    expect(erros[0]).toMatch(/server\/routes\/vocab\.ts, src\/App\.tsx/)
  })
  it('não se aplica se o contrato não está no diff', () => {
    expect(conferirContratoSozinho(['server/routes/vocab.ts'], contratos)).toEqual([])
  })
})

describe('conferirJournal e a pasta inteira', () => {
  let dir = ''
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))

  it('arquivo fora do journal e entrada sem arquivo são erro', () => {
    expect(conferirJournal(['0000_a.sql', '0001_b.sql'], ['0000_a', '0002_c'])).toEqual([
      '0001_b.sql não está no meta/_journal.json — nunca vai rodar',
      'o journal cita 0002_c e o arquivo 0002_c.sql não existe',
    ])
  })

  it('as migrations do repositório passam hoje', () => {
    const r = conferirPasta()
    expect(r.erros).toEqual([])
    expect(r.conferidas).toBeGreaterThanOrEqual(1)
  })

  it('numa pasta com migration nova destrutiva, reprova; migrations antigas (< 0030) não são cobradas', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'migracoes-'))
    mkdirSync(path.join(dir, 'meta'))
    writeFileSync(path.join(dir, '0026_antiga.sql'), 'DROP TABLE velha;')
    writeFileSync(path.join(dir, '0031_nova.sql'), `${REV}ALTER TABLE t DROP COLUMN c;`)
    writeFileSync(
      path.join(dir, 'meta', '_journal.json'),
      JSON.stringify({ entries: [{ tag: '0026_antiga' }, { tag: '0031_nova' }] }),
    )
    const r = conferirPasta(dir)
    expect(r.erros).toHaveLength(1)
    expect(r.erros[0]).toMatch(/^0031_nova\.sql: DROP COLUMN/)
  })
})
