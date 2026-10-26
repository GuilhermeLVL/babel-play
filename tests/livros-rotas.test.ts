/**
 * AS ROTAS DA TELA LIVROS: `/livros` (o catálogo), `/livros/<id>` (o detalhe) e `/livros/<id>/ler` (a leitura).
 * Ida e volta pelo mesmo par de funções puras das outras telas (`lib/rotas.ts`).
 */
import { describe, expect, it } from 'vitest'

import { estadoParaUrl, urlParaEstado } from '../src/lib/rotas'

describe('rotas de Livros', () => {
  it('o catálogo, o detalhe e a leitura', () => {
    expect(estadoParaUrl({ view: 'livros' })).toBe('/livros')
    expect(estadoParaUrl({ view: 'livros', livroId: 'pg-1342' })).toBe('/livros/pg-1342')
    expect(estadoParaUrl({ view: 'livros', livroId: 'ws-pt-dom-casmurro', lendo: true })).toBe(
      '/livros/ws-pt-dom-casmurro/ler',
    )
  })

  it('ida e volta', () => {
    for (const caminho of ['/livros', '/livros/se-bram-stoker-dracula', '/livros/meu-3f2a9c1d0b7e/ler']) {
      expect(estadoParaUrl(urlParaEstado(caminho))).toBe(caminho)
    }
    expect(urlParaEstado('/livros/pg-11/ler')).toEqual({ view: 'livros', livroId: 'pg-11', lendo: true })
  })

  it('id que não tem forma de id de livro degrada para o catálogo, nunca para o 404', () => {
    expect(urlParaEstado('/livros/%3Cscript%3E')).toEqual({ view: 'livros' })
    expect(estadoParaUrl({ view: 'livros', livroId: '../../etc' })).toBe('/livros')
  })

  it('debaixo de /app (o app no Worker) é a mesma rota', () => {
    expect(urlParaEstado('/app/livros/pg-11')).toEqual({ view: 'livros', livroId: 'pg-11' })
  })
})
