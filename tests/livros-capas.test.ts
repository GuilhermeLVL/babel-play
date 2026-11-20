/**
 * AS CAPAS DO CATÁLOGO (spec docs/specs/2026-10-28-livros-capas.md): só a Standard Ebooks (CC0) tem imagem; o
 * campo `capa` malformado é descartado; o resto do catálogo não muda.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { capaDoStandardEbooks, capaValida } from '../src/core/livros/capas'
import type { Catalogo, LivroDoCatalogo } from '../src/core/livros/tipos'
import { validarCatalogo } from '../src/lib/livros/catalogo'

const CAPA = {
  origem: 'standard-ebooks',
  url: 'https://standardebooks.org/ebooks/herman-melville/moby-dick/downloads/cover-thumbnail.jpg',
  licenca: 'CC0',
  credito: 'Capa: Standard Ebooks (CC0)',
}

describe('capaValida', () => {
  it('aceita a miniatura do Standard Ebooks com licença CC0', () => {
    expect(capaValida(CAPA)).toEqual(CAPA)
  })

  it.each([
    ['ausente', undefined],
    ['texto', 'https://standardebooks.org/x'],
    ['origem desconhecida', { ...CAPA, origem: 'gutenberg' }],
    ['licença diferente', { ...CAPA, licenca: 'CC-BY' }],
    ['host de terceiros', { ...CAPA, url: 'https://exemplo.com/ebooks/a/b/downloads/cover-thumbnail.jpg' }],
    ['http sem TLS', { ...CAPA, url: CAPA.url.replace('https', 'http') }],
    ['host parecido', { ...CAPA, url: CAPA.url.replace('standardebooks.org', 'standardebooks.org.evil.com') }],
    ['credenciais ou consulta', { ...CAPA, url: `${CAPA.url}?x=1` }],
    ['outro arquivo', { ...CAPA, url: CAPA.url.replace('cover-thumbnail.jpg', 'x.svg') }],
    ['sem crédito', { ...CAPA, credito: '  ' }],
    ['url não é texto', { ...CAPA, url: 3 }],
  ])('descarta capa malformada: %s', (_nome, valor) => {
    expect(capaValida(valor)).toBeNull()
  })
})

describe('capaDoStandardEbooks', () => {
  it('monta a URL estável da miniatura a partir do caminho da fonte', () => {
    expect(capaDoStandardEbooks('herman-melville/moby-dick')?.url).toBe(CAPA.url)
    expect(capaDoStandardEbooks('leo-tolstoy/war-and-peace/louise-maude_aylmer-maude')?.url).toContain('_aylmer')
  })
  it('recusa caminho estranho (nada de ../ nem de URL no lugar do caminho)', () => {
    expect(capaDoStandardEbooks('../x/y')).toBeNull()
    expect(capaDoStandardEbooks('https://evil.com/a')).toBeNull()
    expect(capaDoStandardEbooks('')).toBeNull()
    expect(capaDoStandardEbooks('so-um-nivel')).toBeNull()
  })
})

describe('validarCatalogo com capa', () => {
  const base = (o: Partial<LivroDoCatalogo>): LivroDoCatalogo =>
    ({
      id: 'se-a',
      titulo: 'A',
      autores: [{ nome: 'Ela', anoMorte: 1900, idiomas: ['en'] }],
      tradutores: [],
      idioma: 'en',
      fonte: 'standard-ebooks',
      fonteId: 'ela/a',
      formatos: {},
      categorias: [],
      classificacao: 'livre',
      nivel: null,
      palavras: 100,
      minutosEstimados: 1,
      popularidade: 0,
      downloads: 0,
      credito: '',
      licenca: '',
      ...o,
    }) as LivroDoCatalogo
  const bruto = (livros: unknown[]) => ({ versao: 1, ano: 2026, anoLimite: 1955, geradoEm: '', livros, exclusoes: [] })
  const agora = new Date('2026-10-28T12:00:00-03:00')

  it('mantém a capa válida e descarta a malformada sem derrubar o livro', () => {
    const c = validarCatalogo(
      bruto([
        base({ id: 'a', capa: CAPA as never }),
        base({ id: 'b', capa: { ...CAPA, licenca: 'x' } as never }),
        base({ id: 'c' }),
      ]),
      agora,
    )
    expect(c.livros.map((l) => [l.id, l.capa?.url ?? null])).toEqual([
      ['a', CAPA.url],
      ['b', null],
      ['c', null],
    ])
    expect('capa' in c.livros[1]).toBe(false)
  })
})

describe('o catálogo publicado', () => {
  const catalogo = JSON.parse(readFileSync('public/catalogo/livros.json', 'utf8')) as Catalogo

  it('só os livros do Standard Ebooks têm capa, e todas são válidas', () => {
    const com = catalogo.livros.filter((l) => l.capa)
    expect(com.length).toBe(catalogo.livros.filter((l) => l.fonte === 'standard-ebooks').length)
    expect(com.length).toBeGreaterThanOrEqual(60)
    for (const l of com) {
      expect(l.fonte).toBe('standard-ebooks')
      expect(capaValida(l.capa)).toEqual(l.capa)
      expect(l.capa?.url).toBe(capaDoStandardEbooks(l.fonteId)?.url)
    }
  })

  it('o cliente aceita o catálogo inteiro e não perde nenhuma capa', () => {
    const c = validarCatalogo(catalogo, new Date('2026-10-28T12:00:00-03:00'))
    expect(c.livros.filter((l) => l.capa).length).toBe(catalogo.livros.filter((l) => l.capa).length)
  })
})
