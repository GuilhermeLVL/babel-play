/**
 * A FLAG DA LEITURA COM VOZ LOCAL (openspec `leitura-ativa-com-moonshine`): `leitura_voz_local` nasce DESLIGADA, sem regra de plano, por
 * semente idempotente nas duas cadeias (PG e SQLite legado), com os snapshots do drizzle encadeados.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { FLAG_LEITURA_VOZ_LOCAL } from '../src/core/planos'
import { type EphemeralDb, setupEphemeralDb } from './harness/ephemeralDb'

function migracao(pasta: string) {
  const dir = path.resolve('server/db', pasta)
  const arquivo = readdirSync(dir).find((n) => n.endsWith('.sql') && n.includes('flag_leitura_voz_local'))
  expect(arquivo, `migração flag_leitura_voz_local em ${pasta}`).toBeTruthy()
  const tag = arquivo!.replace(/\.sql$/, '')
  const num = tag.slice(0, 4)
  const anterior = String(Number(num) - 1).padStart(4, '0')
  const snap = (n: string) => JSON.parse(readFileSync(path.join(dir, `meta/${n}_snapshot.json`), 'utf8'))
  return {
    tag,
    sql: readFileSync(path.join(dir, arquivo!), 'utf8'),
    journal: JSON.parse(readFileSync(path.join(dir, 'meta/_journal.json'), 'utf8')) as {
      entries: { tag: string; when: number }[]
    },
    snapshot: snap(num),
    snapshotAnterior: snap(anterior),
  }
}

describe('migrações da flag leitura_voz_local', () => {
  for (const pasta of ['migrations-pg', 'migrations-sqlite']) {
    it(`${pasta}: registrada no journal, when crescente, snapshot encadeado`, () => {
      const m = migracao(pasta)
      const i = m.journal.entries.findIndex((e) => e.tag === m.tag)
      expect(i).toBeGreaterThan(0)
      expect(m.journal.entries[i].when).toBeGreaterThan(m.journal.entries[i - 1].when)
      if (m.journal.entries[i + 1]) expect(m.journal.entries[i + 1].when).toBeGreaterThan(m.journal.entries[i].when)
      expect(m.snapshot.prevId).toBe(m.snapshotAnterior.id)
      expect(m.snapshot.id).not.toBe(m.snapshotAnterior.id)
    })

    it(`${pasta}: semeia a chave desligada, sem regra, sem sobrescrever`, () => {
      const m = migracao(pasta)
      expect(m.sql).toContain(`'${FLAG_LEITURA_VOZ_LOCAL}',`)
      expect(m.sql).toContain(pasta === 'migrations-pg' ? "false, '{}'" : "0, '{}'")
      expect(m.sql).toMatch(
        pasta === 'migrations-pg' ? /ON CONFLICT \(chave\) DO NOTHING/ : /INSERT OR IGNORE INTO flags/,
      )
    })
  }

  it('docs/flags.md e o painel (flag sensível) citam a chave', () => {
    expect(readFileSync('docs/flags.md', 'utf8')).toContain('| `leitura_voz_local`')
    expect(readFileSync('src/components/views/admin/PainelFlags.tsx', 'utf8')).toMatch(/'leitura_voz_local',/)
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
    const ler = async () =>
      linhas<{ habilitada: boolean; regras: string }>(
        await db.execute(sql`select habilitada, regras from flags where chave = 'leitura_voz_local'`),
      )
    expect(await ler()).toEqual([{ habilitada: false, regras: '{}' }])
    await db.execute(sql`update flags set habilitada = true where chave = 'leitura_voz_local'`)
    await db.execute(sql.raw(migracao('migrations-pg').sql))
    expect((await ler())[0].habilitada).toBe(true)
  })
})
