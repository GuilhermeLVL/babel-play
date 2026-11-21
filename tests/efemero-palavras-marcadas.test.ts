// @vitest-environment jsdom
/**
 * SEM CONTA, AS PALAVRAS MARCADAS FICAM NO APARELHO (`src/data/efemero/rotas/palavrasMarcadas.ts`): as mesmas rotas
 * `/api/vocab/marcadas` do servidor, no `localStorage`, com a mesma redução de idioma e chave. Sem `localStorage`,
 * nada quebra: a lista vem vazia.
 */
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { servidorEfemero } from '../src/data/efemero/servidor'

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

  it('sem localStorage: lista vazia, sem erro', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(await listar()).toEqual([])
  })
})
