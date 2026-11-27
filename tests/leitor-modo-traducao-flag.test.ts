/**
 * A FLAG DO MODO TRADUÇÃO (openspec `leitura-assistida`, fatia B): `leitor_modo_traducao` nasce DESLIGADA, sem regra de
 * plano, por semente idempotente nas duas cadeias (números reservados à fatia: PG 0045, SQLite 0084). Também cobre as
 * traduções guardadas no aparelho (teto e isolamento por livro).
 */
// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { FLAG_LEITOR_MODO_TRADUCAO } from '../src/core/planos'
import { guardarTraducao, lerTraducoesGuardadas } from '../src/lib/leitor/traducoesGuardadas'

function migracao(pasta: string) {
  const dir = path.resolve('server/db', pasta)
  const arquivo = readdirSync(dir).find((n) => n.endsWith('.sql') && n.includes('flag_leitor_modo_traducao'))
  expect(arquivo, `migração flag_leitor_modo_traducao em ${pasta}`).toBeTruthy()
  const tag = arquivo!.replace(/\.sql$/, '')
  return {
    tag,
    sql: readFileSync(path.join(dir, arquivo!), 'utf8'),
    journal: JSON.parse(readFileSync(path.join(dir, 'meta/_journal.json'), 'utf8')) as {
      entries: { tag: string; when: number }[]
    },
    snapshot: JSON.parse(readFileSync(path.join(dir, `meta/${tag.slice(0, 4)}_snapshot.json`), 'utf8')) as {
      id: string
      prevId: string
    },
  }
}

describe('migrações da flag leitor_modo_traducao', () => {
  it('usa os números reservados à fatia B', () => {
    expect(migracao('migrations-pg').tag.slice(0, 4)).toBe('0045')
    expect(migracao('migrations-sqlite').tag.slice(0, 4)).toBe('0084')
  })

  for (const pasta of ['migrations-pg', 'migrations-sqlite']) {
    it(`${pasta}: no journal, com when crescente e snapshot encadeado`, () => {
      const m = migracao(pasta)
      const i = m.journal.entries.findIndex((e) => e.tag === m.tag)
      expect(i).toBeGreaterThan(0)
      expect(m.journal.entries[i].when).toBeGreaterThan(m.journal.entries[i - 1].when)
      expect(m.snapshot.id).not.toBe(m.snapshot.prevId)
    })

    it(`${pasta}: semeia a chave desligada, sem regra, sem sobrescrever`, () => {
      const m = migracao(pasta)
      expect(m.sql).toContain(`'${FLAG_LEITOR_MODO_TRADUCAO}',`)
      expect(m.sql).toContain(pasta === 'migrations-pg' ? "false, '{}'" : "0, '{}'")
      expect(m.sql).toMatch(
        pasta === 'migrations-pg' ? /ON CONFLICT \(chave\) DO NOTHING/ : /INSERT OR IGNORE INTO flags/,
      )
      expect(m.sql).toMatch(/REVERS(?:A|Ã)O:/)
    })
  }

  it('docs/flags.md e o painel citam a chave', () => {
    expect(readFileSync('docs/flags.md', 'utf8')).toContain('| `leitor_modo_traducao`')
    expect(readFileSync('src/components/views/admin/PainelFlags.tsx', 'utf8')).toMatch(/'leitor_modo_traducao',/)
  })
})

describe('traduções guardadas no aparelho', () => {
  beforeEach(() => localStorage.clear())

  it('guarda por livro e normaliza espaços', () => {
    guardarTraducao('a', 'The  cat\nsat', 'O gato sentou')
    expect(lerTraducoesGuardadas('a')).toEqual({ 'The cat sat': 'O gato sentou' })
    expect(lerTraducoesGuardadas('b')).toEqual({})
  })

  it('mantém no máximo 200 trechos (os mais antigos saem)', () => {
    for (let i = 0; i < 205; i++) guardarTraducao('a', `trecho ${i}`, `t${i}`)
    const todas = lerTraducoesGuardadas('a')
    expect(Object.keys(todas)).toHaveLength(200)
    expect(todas['trecho 0']).toBeUndefined()
    expect(todas['trecho 204']).toBe('t204')
  })

  it('ignora trecho ou tradução gigante e JSON corrompido', () => {
    guardarTraducao('a', 'x'.repeat(2000), 'y')
    guardarTraducao('a', 'ok', 'y'.repeat(2000))
    expect(lerTraducoesGuardadas('a')).toEqual({})
    localStorage.setItem('leitor:traducoes:a', '{nao json')
    expect(lerTraducoesGuardadas('a')).toEqual({})
  })
})
