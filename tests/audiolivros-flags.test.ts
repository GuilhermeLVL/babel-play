/**
 * AS FLAGS DOS AUDIOLIVROS (F2, spec §9.1): `audiolivros`, `audiolivros_nuvem` e `audiolivros_elenco` nascem
 * DESLIGADAS, sem regra de plano, por semente idempotente nas duas cadeias (PG e SQLite legado). O teste não fixa o
 * número da migração: acha o arquivo pelo nome.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type EphemeralDb, setupEphemeralDb } from './harness/ephemeralDb'

const CHAVES = ['audiolivros', 'audiolivros_nuvem', 'audiolivros_elenco'] as const

function migracao(pasta: string): { tag: string; sql: string; journal: { entries: { tag: string; when: number }[] } } {
  const dir = path.resolve('server/db', pasta)
  const arquivo = readdirSync(dir).find((n) => n.endsWith('.sql') && n.includes('flags_audiolivros'))
  expect(arquivo, `migração flags_audiolivros em ${pasta}`).toBeTruthy()
  return {
    tag: arquivo!.replace(/\.sql$/, ''),
    sql: readFileSync(path.join(dir, arquivo!), 'utf8'),
    journal: JSON.parse(readFileSync(path.join(dir, 'meta/_journal.json'), 'utf8')),
  }
}

describe('migrações das flags dos audiolivros', () => {
  for (const pasta of ['migrations-pg', 'migrations-sqlite']) {
    it(`${pasta}: o journal registra a migração, com when crescente em relação às vizinhas`, () => {
      const m = migracao(pasta)
      const entradas = m.journal.entries
      const i = entradas.findIndex((e) => e.tag === m.tag)
      /* Não precisa ser a última: migrações posteriores (ex.: `voz_no_aparelho`) entram depois dela. */
      expect(i).toBeGreaterThan(0)
      expect(entradas[i].when).toBeGreaterThan(entradas[i - 1].when)
      if (entradas[i + 1]) expect(entradas[i + 1].when).toBeGreaterThan(entradas[i].when)
    })

    it(`${pasta}: semeia as 3 chaves desligadas, sem regra, sem sobrescrever`, () => {
      const m = migracao(pasta)
      const inserts = m.sql.match(/INSERT (OR IGNORE )?INTO flags/g) ?? []
      expect(inserts).toHaveLength(3)
      for (const chave of CHAVES) expect(m.sql).toContain(`'${chave}',`)
      const desligada = pasta === 'migrations-pg' ? "false, '{}'" : "0, '{}'"
      expect(m.sql.split(desligada).length - 1).toBe(3)
      if (pasta === 'migrations-pg') expect(m.sql.match(/ON CONFLICT \(chave\) DO NOTHING/g)).toHaveLength(3)
      else expect(m.sql.match(/INSERT OR IGNORE INTO flags/g)).toHaveLength(3)
    })
  }

  it('docs/flags.md cita as 3 chaves e as constantes de planos.ts batem com elas', async () => {
    const doc = readFileSync('docs/flags.md', 'utf8')
    for (const chave of CHAVES) expect(doc).toContain(`| \`${chave}\``)
    const p = await import('../src/core/planos')
    expect([p.FLAG_AUDIOLIVROS, p.FLAG_AUDIOLIVROS_NUVEM, p.FLAG_AUDIOLIVROS_ELENCO]).toEqual([...CHAVES])
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

  it('as 3 flags nascem desligadas com regras {}; reaplicar não desliga a que o operador ligou', async () => {
    const { db, linhas } = await h.load<typeof import('../server/db/db')>('../../server/db/db')
    const ler = async () =>
      linhas<{ chave: string; habilitada: boolean; regras: string }>(
        await db.execute(
          sql`select chave, habilitada, regras from flags where chave in ('audiolivros', 'audiolivros_nuvem', 'audiolivros_elenco') order by chave`,
        ),
      )
    const antes = await ler()
    expect(antes.map((f) => f.chave)).toEqual(['audiolivros', 'audiolivros_elenco', 'audiolivros_nuvem'])
    for (const f of antes) {
      expect(f.habilitada).toBe(false)
      expect(f.regras).toBe('{}')
    }
    await db.execute(sql`update flags set habilitada = true where chave = 'audiolivros'`)
    for (const comando of migracao('migrations-pg').sql.split('--> statement-breakpoint'))
      await db.execute(sql.raw(comando))
    const depois = await ler()
    expect(depois.find((f) => f.chave === 'audiolivros')?.habilitada).toBe(true)
    expect(depois.filter((f) => f.habilitada)).toHaveLength(1)
  })
})
