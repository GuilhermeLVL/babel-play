import { describe, expect, it } from 'vitest'

import {
  compararContagens,
  destinoLivre,
  tabelaMarkdown,
  validarRestaurado,
} from '../scripts/backup/compararContagens.mjs'

describe('compararContagens', () => {
  it('contagens iguais: ok', () => {
    const r = compararContagens({ a: 3, b: 0, __drizzle_migrations: 7 }, { a: 3, b: 0, __drizzle_migrations: 7 })
    expect(r).toEqual({ ok: true, divergentes: [], faltantes: [] })
  })

  it('tabela a menos no restaurado: entra em faltantes e reprova', () => {
    const r = compararContagens({ a: 1, b: 2 }, { a: 1 })
    expect(r.ok).toBe(false)
    expect(r.faltantes).toEqual(['b'])
    expect(r.divergentes).toEqual([])
  })

  it('contagem diferente: divergentes traz os dois números', () => {
    const r = compararContagens({ a: 10, b: 2 }, { a: 9, b: 2 })
    expect(r.ok).toBe(false)
    expect(r.divergentes).toEqual([{ tabela: 'a', origem: 10, restaurado: 9 }])
    expect(r.faltantes).toEqual([])
  })

  it('tabela extra no restaurado não reprova', () => {
    expect(compararContagens({ a: 1 }, { a: 1, extra: 5 }).ok).toBe(true)
  })

  it('origem vazia reprova (nada a comparar não é prova)', () => {
    expect(compararContagens({}, { a: 1 }).ok).toBe(false)
  })
})

describe('validarRestaurado (sem banco de origem)', () => {
  it('exige ao menos uma tabela e __drizzle_migrations >= 1', () => {
    expect(validarRestaurado({ a: 0, __drizzle_migrations: 3 })).toEqual({ ok: true, motivos: [] })
    expect(validarRestaurado({}).ok).toBe(false)
    expect(validarRestaurado({ a: 1 }).ok).toBe(false)
    expect(validarRestaurado({ a: 1, __drizzle_migrations: 0 }).ok).toBe(false)
  })
})

describe('tabelaMarkdown', () => {
  it('imprime só contagens, com a marca de divergência', () => {
    const md = tabelaMarkdown({ a: 1, b: 2 }, { a: 1, b: 3 })
    expect(md).toContain('| Tabela | Origem | Restaurado | Situação |')
    expect(md).toContain('| a | 1 | 1 | ok |')
    expect(md).toContain('| b | 2 | 3 | DIVERGE |')
  })

  it('sem origem, mostra só o restaurado', () => {
    const md = tabelaMarkdown(null, { a: 4 })
    expect(md).toContain('| a | 4 |')
    expect(md).not.toContain('Origem')
  })
})

describe('destinoLivre (a recusa do drill)', () => {
  it.each([
    ['0', true],
    ['0\n', true],
    ['0 ', true],
    ['', false],
    ['NaN', false],
    ['3', false],
    ['00', false],
  ])('%j -> %s', (saida, esperado) => {
    expect(destinoLivre(saida)).toBe(esperado)
  })
})
