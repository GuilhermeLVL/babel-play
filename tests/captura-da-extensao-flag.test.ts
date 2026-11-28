/**
 * A FLAG DA CAPTURA PELA EXTENSÃO (openspec `captura-em-um-clique`, fatia 2): `captura_da_extensao` nasce DESLIGADA, sem regra
 * de plano, por semente idempotente nas duas cadeias (PG 0053 e SQLite 0092, faixa reservada da onda 2).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FLAG_CAPTURA_DA_EXTENSAO } from '../src/core/planos'
import { type EphemeralDb, setupEphemeralDb } from './harness/ephemeralDb'

const MIGRACOES = {
  'migrations-pg': '0053_flag_captura_da_extensao',
  'migrations-sqlite': '0092_flag_captura_da_extensao',
} as const

const ler = (pasta: string, rel: string) => readFileSync(path.resolve('server/db', pasta, rel), 'utf8')

describe('migrações da flag captura_da_extensao', () => {
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
      expect(m).toContain(`'${FLAG_CAPTURA_DA_EXTENSAO}',`)
      expect(m).toContain(pasta === 'migrations-pg' ? "false, '{}'" : "0, '{}'")
      expect(m).toMatch(pasta === 'migrations-pg' ? /ON CONFLICT \(chave\) DO NOTHING/ : /INSERT OR IGNORE INTO flags/)
      expect(m).toMatch(/REVERS[ÃA]O/)
    })
  }

  it('docs/flags.md e o painel citam a chave', () => {
    expect(readFileSync('docs/flags.md', 'utf8')).toContain('| `captura_da_extensao`')
    expect(readFileSync('src/components/views/admin/PainelFlags.tsx', 'utf8')).toMatch(/'captura_da_extensao',/)
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
        await db.execute(sql`select habilitada, regras from flags where chave = 'captura_da_extensao'`),
      )
    expect(await consultar()).toEqual([{ habilitada: false, regras: '{}' }])
    await db.execute(sql`update flags set habilitada = true where chave = 'captura_da_extensao'`)
    await db.execute(sql.raw(ler('migrations-pg', `${MIGRACOES['migrations-pg']}.sql`)))
    expect((await consultar())[0].habilitada).toBe(true)
  })
})
