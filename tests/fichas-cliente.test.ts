/**
 * AS FICHAS NO CLIENTE (`src/lib/livros/fichas.ts`): o índice diz quem tem ficha (sem ele, nenhum arquivo é pedido),
 * a ficha passa pelo validador e pela régua de quem lê (`fichaParaLeitor`), e o menor não recebe a ficha do livro que
 * a vitrine esconde dele.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const FICHA = JSON.parse(readFileSync(join(__dirname, '..', 'public/catalogo/fichas/pg-1513.json'), 'utf8'))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

function servir(arquivos: Record<string, unknown>) {
  const pedidos: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    pedidos.push(url)
    const corpo = arquivos[url]
    return corpo === undefined
      ? { ok: false, status: 404, json: async () => null }
      : { ok: true, status: 200, json: async () => corpo }
  })
  return pedidos
}

describe('carregarFicha', () => {
  it('adulto: a ficha validada, sem spoiler quando não pediu', async () => {
    servir({
      '/catalogo/fichas/indice.json': { versao: 1, fichas: ['pg-1513'] },
      '/catalogo/fichas/pg-1513.json': FICHA,
    })
    const { carregarFicha } = await import('../src/lib/livros/fichas')
    const f = await carregarFicha(
      { id: 'pg-1513', classificacao: null },
      { teto: '18', mostrarSpoilers: false, livroVisivel: () => true },
    )
    expect(f?.livroId).toBe('pg-1513')
    expect(f?.curiosidades.every((c) => !c.spoiler)).toBe(true)
  })

  it('menor: livro "a revisar" não tem ficha; livro fora do índice nem é pedido', async () => {
    const pedidos = servir({ '/catalogo/fichas/indice.json': { versao: 1, fichas: ['pg-1513'] } })
    const { carregarFicha } = await import('../src/lib/livros/fichas')
    expect(
      await carregarFicha(
        { id: 'pg-1513', classificacao: null },
        { teto: '12', mostrarSpoilers: false, livroVisivel: () => true },
      ),
    ).toBeNull()
    expect(
      await carregarFicha(
        { id: 'pg-9', classificacao: 'livre' },
        { teto: '12', mostrarSpoilers: false, livroVisivel: () => true },
      ),
    ).toBeNull()
    expect(pedidos.some((p) => p.endsWith('pg-9.json'))).toBe(false)
  })

  it('ficha fora da forma não aparece', async () => {
    servir({
      '/catalogo/fichas/indice.json': { versao: 1, fichas: ['pg-1513'] },
      '/catalogo/fichas/pg-1513.json': { ...FICHA, procedencia: { ...FICHA.procedencia, aviso: 'outro' } },
    })
    const { carregarFicha } = await import('../src/lib/livros/fichas')
    expect(
      await carregarFicha(
        { id: 'pg-1513', classificacao: 'livre' },
        { teto: '18', mostrarSpoilers: true, livroVisivel: () => true },
      ),
    ).toBeNull()
  })
})
