// @vitest-environment jsdom
/**
 * "MEUS LIVROS": o teto do que fica guardado no aparelho (contagem e total, com saída do usado há mais tempo),
 * o teto da memória, e o filtro do que um perfil protegido pode ver na lista.
 */
import { describe, expect, it } from 'vitest'

import {
  filtrarMeusLivrosVisiveis,
  guardarEmMemoria,
  lerDaMemoria,
  type MeuLivro,
  quemSaiParaCaber,
  tamanhoDoConteudo,
  TETO_DE_BYTES_GUARDADOS,
  TETO_DE_LIVROS_GUARDADOS,
} from '../src/lib/livros/meusLivros'

const MB = 1024 * 1024
const meta = (id: string, tamanho: number, usadoEm: number) => ({ id, tamanho, usadoEm })

describe('o teto do IndexedDB (LRU)', () => {
  it('abaixo dos tetos, ninguém sai', () => {
    expect(quemSaiParaCaber([meta('a', MB, 1), meta('b', MB, 2)], meta('c', MB, 3))).toEqual([])
  })

  it('pela contagem: sai o usado há mais tempo', () => {
    const guardados = Array.from({ length: TETO_DE_LIVROS_GUARDADOS }, (_, i) => meta(`l${i}`, 1, 100 - i))
    // `l29` foi usado há mais tempo (usadoEm 71).
    expect(quemSaiParaCaber(guardados, meta('novo', 1, 1000))).toEqual([`l${TETO_DE_LIVROS_GUARDADOS - 1}`])
  })

  it('pelo total: saem quantos precisar, do mais antigo ao mais novo', () => {
    const guardados = [meta('velho', 60 * MB, 1), meta('medio', 60 * MB, 2), meta('novo', 20 * MB, 3)]
    expect(quemSaiParaCaber(guardados, meta('chegou', 100 * MB, 4), 30, TETO_DE_BYTES_GUARDADOS)).toEqual([
      'velho',
      'medio',
    ])
  })

  it('o livro que volta a ser guardado não conta duas vezes', () => {
    expect(quemSaiParaCaber([meta('a', 140 * MB, 1)], meta('a', 140 * MB, 2))).toEqual([])
  })

  it('o tamanho conta o arquivo e o texto', () => {
    const c = { id: 'x', arquivo: new Blob(['abcd']), capitulos: [{ titulo: 'T', texto: 'oi' }] }
    expect(tamanhoDoConteudo(c)).toBe(4 + (2 + 1) * 2)
  })
})

describe('a memória da aba', () => {
  it('guarda só os 2 mais recentes', () => {
    for (const id of ['m1', 'm2', 'm3']) guardarEmMemoria({ id, capitulos: [] })
    expect(lerDaMemoria('m1')).toBeNull()
    expect(lerDaMemoria('m2')).not.toBeNull()
    expect(lerDaMemoria('m3')).not.toBeNull()
  })
})

describe('o que o perfil vê na lista', () => {
  const l = (id: string, origem: MeuLivro['origem']): MeuLivro => ({
    id,
    titulo: id,
    origem,
    adicionadoEm: 0,
    status: 'quero-ler',
    etiquetas: [],
    progresso: null,
  })

  it('o do catálogo que o perfil não vê some; o trazido pela pessoa fica', () => {
    const lista = [l('adulto', 'catalogo'), l('infantil', 'catalogo'), l('meu-1', 'arquivo'), l('meu-2', 'link')]
    expect(filtrarMeusLivrosVisiveis(lista, (id) => id === 'infantil').map((x) => x.id)).toEqual([
      'infantil',
      'meu-1',
      'meu-2',
    ])
  })
})
