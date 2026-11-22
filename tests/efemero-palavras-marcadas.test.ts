// @vitest-environment jsdom
/**
 * SEM CONTA, AS PALAVRAS MARCADAS FICAM NO APARELHO (`src/data/efemero/rotas/palavrasMarcadas.ts`): as mesmas rotas
 * `/api/vocab/marcadas` do servidor, no `localStorage`, com a mesma redução de idioma e chave. Sem `localStorage`,
 * nada quebra: a lista vem vazia.
 */
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { servidorEfemero } from '../src/data/efemero/servidor'
import { limparTudo } from '../src/data/efemero/store'

const put = (corpo: unknown) =>
  servidorEfemero('/api/vocab/marcadas', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
const listar = async (lang?: string) =>
  (
    (await (await servidorEfemero(`/api/vocab/marcadas${lang ? `?lang=${lang}` : ''}`)).json()) as {
      marcadas: Array<{ lang: string; chave: string; estado: string }>
    }
  ).marcadas

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('espelho sem conta das palavras marcadas', () => {
  it('marca (upsert), lista por idioma e desmarca', async () => {
    expect((await put({ lang: 'en-US', chave: 'Hello!', estado: 'conhecida' })).status).toBe(200)
    await put({ lang: 'en', chave: 'hello', estado: 'ignorada' })
    await put({ lang: 'es', chave: 'Hola', estado: 'conhecida' })
    expect((await listar('en')).map((m) => [m.chave, m.estado])).toEqual([['hello', 'ignorada']])
    expect((await listar()).length).toBe(2)
    const del = await servidorEfemero('/api/vocab/marcadas?lang=en&chave=Hello', { method: 'DELETE' })
    expect(del.status).toBe(204)
    expect((await listar()).map((m) => m.chave)).toEqual(['hola'])
  })

  it('entrada inválida é 400, como no servidor', async () => {
    expect((await put({ lang: '1', chave: 'hi', estado: 'conhecida' })).status).toBe(400)
    expect((await put({ lang: 'en', chave: '...', estado: 'conhecida' })).status).toBe(400)
    expect((await put({ lang: 'en', chave: 'hi', estado: 'dominada' })).status).toBe(400)
  })

  it('DELETE /api/vocab/marcadas não cai em "apagar o cartão"', async () => {
    const r = await servidorEfemero('/api/vocab/marcadas?lang=en&chave=nada', { method: 'DELETE' })
    expect(r.status).toBe(204)
  })

  it('"esquecer este navegador" (limparTudo) apaga as marcadas', async () => {
    await put({ lang: 'en', chave: 'hello', estado: 'conhecida' })
    await limparTudo()
    expect(localStorage.getItem('babel.efemero.palavrasMarcadas')).toBeNull()
    expect(await listar()).toEqual([])
  })

  it('sem localStorage: lista vazia, sem erro', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(await listar()).toEqual([])
  })
})

describe('espelho sem conta: marcação em lote (teste de vocabulário)', () => {
  const lote = (corpo: unknown) =>
    servidorEfemero('/api/vocab/marcadas/lote', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
  const desfazer = (corpo: unknown) =>
    servidorEfemero('/api/vocab/marcadas/lote/desfazer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })

  it('grava só conhecida, reduz e tira repetidas, e não sobrescreve ignorada', async () => {
    await put({ lang: 'en', chave: 'ghost', estado: 'ignorada' })
    const r = await lote({ lang: 'en-US', chaves: ['Hello!', 'hello', 'ghost', 'World', '...'] })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ criadas: ['hello', 'world'], ignoradas: 1, jaConhecidas: 0 })
    const todas = await listar('en')
    expect(todas.find((m) => m.chave === 'ghost')?.estado).toBe('ignorada')
    expect(
      todas
        .filter((m) => m.estado === 'conhecida')
        .map((m) => m.chave)
        .sort(),
    ).toEqual(['hello', 'world'])
    expect(await (await lote({ lang: 'en', chaves: ['hello'] })).json()).toMatchObject({ criadas: [], jaConhecidas: 1 })
  })

  it('valida: idioma, lista vazia, só pontuação e lote acima de 3.000 dão 400', async () => {
    expect((await lote({ lang: '1', chaves: ['hi'] })).status).toBe(400)
    expect((await lote({ lang: 'en', chaves: [] })).status).toBe(400)
    expect((await lote({ lang: 'en', chaves: ['!!!'] })).status).toBe(400)
    expect((await lote({ lang: 'en', chaves: Array.from({ length: 3001 }, (_, i) => `w${i}`) })).status).toBe(400)
  })

  it('o teto é atômico: lote que não cabe não grava nada', async () => {
    const cheia = Array.from({ length: 19_999 }, (_, i) => ({
      lang: 'en',
      chave: `k${i}`,
      estado: 'conhecida',
      atualizadoEm: 1,
    }))
    localStorage.setItem('babel.efemero.palavrasMarcadas', JSON.stringify(cheia))
    expect((await lote({ lang: 'en', chaves: ['nova', 'outra'] })).status).toBe(409)
    expect(await listar('en')).toHaveLength(19_999)
    expect((await lote({ lang: 'en', chaves: ['nova'] })).status).toBe(200)
  })

  it('desfaz em lote só as conhecidas das chaves dadas', async () => {
    await put({ lang: 'en', chave: 'ghost', estado: 'ignorada' })
    await lote({ lang: 'en', chaves: ['a1', 'b1'] })
    const r = await desfazer({ lang: 'en', chaves: ['a1', 'ghost', 'nada'] })
    expect(await r.json()).toEqual({ removidas: ['a1'] })
    expect((await listar('en')).map((m) => m.chave).sort()).toEqual(['b1', 'ghost'])
  })
})
