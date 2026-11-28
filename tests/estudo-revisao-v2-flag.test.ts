/**
 * A FLAG DO REVISÃO V2 (openspec `cartoes` e `modelo-do-aluno-e-dados`): `estudo_revisao_v2` nasce DESLIGADA, sem regra
 * de plano, por semente idempotente nas duas cadeias (PG 0049 e SQLite 0088, números reservados à fatia).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FLAG_ESTUDO_REVISAO_V2 } from '../src/core/planos'
import { type EphemeralDb, setupEphemeralDb } from './harness/ephemeralDb'

const MIGRACOES = {
  'migrations-pg': '0049_flag_estudo_revisao_v2',
  'migrations-sqlite': '0088_flag_estudo_revisao_v2',
} as const

const ler = (pasta: string, rel: string) => readFileSync(path.resolve('server/db', pasta, rel), 'utf8')

describe('migrações da flag estudo_revisao_v2', () => {
  for (const [pasta, tag] of Object.entries(MIGRACOES)) {
    it(`${pasta}: no journal com when crescente e snapshot encadeado`, () => {
      const journal = JSON.parse(ler(pasta, 'meta/_journal.json')) as { entries: { tag: string; when: number }[] }
      const i = journal.entries.findIndex((e) => e.tag === tag)
      expect(i).toBeGreaterThan(0)
      expect(journal.entries[i].when).toBeGreaterThan(journal.entries[i - 1].when)
      const snap = JSON.parse(ler(pasta, `meta/${tag.slice(0, 4)}_snapshot.json`))
      const anterior = JSON.parse(ler(pasta, `meta/${journal.entries[i - 1].tag.slice(0, 4)}_snapshot.json`))
      expect(snap.prevId).toBe(anterior.id)
      expect(snap.id).not.toBe(anterior.id)
    })

    it(`${pasta}: semeia a chave desligada, sem regra, sem sobrescrever`, () => {
      const m = ler(pasta, `${tag}.sql`)
      expect(m).toContain(`'${FLAG_ESTUDO_REVISAO_V2}',`)
      expect(m).toContain(pasta === 'migrations-pg' ? "false, '{}'" : "0, '{}'")
      expect(m).toMatch(pasta === 'migrations-pg' ? /ON CONFLICT \(chave\) DO NOTHING/ : /INSERT OR IGNORE INTO flags/)
      expect(m).toMatch(/REVERS[ÃA]O/)
    })
  }

  it('docs/flags.md e o painel citam a chave', () => {
    expect(readFileSync('docs/flags.md', 'utf8')).toContain('| `estudo_revisao_v2`')
    expect(readFileSync('src/components/views/admin/PainelFlags.tsx', 'utf8')).toMatch(/'estudo_revisao_v2',/)
  })
})

describe('a cadeia PG aplicada (PGlite em memória)', () => {
  let h: EphemeralDb
  beforeAll(async () => {
    h = await setupEphemeralDb()
  })
  afterAll(async () => {
    await h.cleanup()
  })

  it('nasce desligada com regras {}; reaplicar não desliga a que o operador ligou', async () => {
    const { db, linhas } = await h.load<typeof import('../server/db/db')>('../../server/db/db')
    const consultar = async () =>
      linhas<{ habilitada: boolean; regras: string }>(
        await db.execute(sql`select habilitada, regras from flags where chave = 'estudo_revisao_v2'`),
      )
    expect(await consultar()).toEqual([{ habilitada: false, regras: '{}' }])
    await db.execute(sql`update flags set habilitada = true where chave = 'estudo_revisao_v2'`)
    await db.execute(sql.raw(ler('migrations-pg', `${MIGRACOES['migrations-pg']}.sql`)))
    expect((await consultar())[0].habilitada).toBe(true)
  })
})
