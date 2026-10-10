/**
 * A BUSCA LIVRE DA FOLHA DA PALAVRA (`buscarImagensLivres`) — quando ela vai direto ao Openverse.
 *
 * O Openverse dá 200 pedidos por dia a quem não tem chave. `searchImages` (a capa da sessão) refaz a
 * busca direto quando o proxy devolve lista vazia; para a folha da palavra isso dobraria o gasto
 * justamente nas palavras sem imagem. Aqui lista vazia é resposta; só a falha leva ao caminho direto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const proxy = vi.hoisted(() => ({ responder: null as unknown as () => Promise<Response> }))
vi.mock('../src/data/funil', () => ({ apiFetch: () => proxy.responder() }))

import { buscarImagensLivres } from '../src/data/rotas/imagens'

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

let diretas: string[] = []
beforeEach(() => {
  diretas = []
  vi.stubGlobal('fetch', async (entrada: RequestInfo | URL) => {
    diretas.push(String(entrada))
    return json({
      results: [
        {
          id: 'a',
          url: 'https://ex/a.jpg',
          thumbnail: 'https://ex/a-t.jpg',
          title: 'Banco',
          creator: 'patosincharco',
          source: 'flickr',
          license: 'pdm',
          license_version: '1.0',
          foreign_landing_url: 'https://ex/pagina',
          width: 1024,
          height: 691,
          tags: [{ name: 'banco' }],
        },
        { id: 'b', url: 'https://ex/b.jpg', title: 'adulto', mature: true },
      ],
    })
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buscarImagensLivres', () => {
  it('o proxy respondeu, mesmo com lista vazia: é a resposta, e nada vai direto ao Openverse', async () => {
    proxy.responder = async () => json({ results: [] })
    expect(await buscarImagensLivres('saudade')).toEqual([])
    expect(diretas).toEqual([])
  })

  it('o proxy falhou (501 de quem não tem conta, erro no corpo, rede): vai direto, com os campos do filtro', async () => {
    for (const falha of [
      async () => json({ error: 'conta necessária' }, 501),
      async () => json({ results: [], error: 'openverse 429' }),
      async () => {
        throw new TypeError('Failed to fetch')
      },
    ]) {
      diretas = []
      proxy.responder = falha
      const imagens = await buscarImagensLivres('banco')
      expect(diretas).toHaveLength(1)
      expect(diretas[0]).toContain('https://api.openverse.org/v1/images/?q=banco&page_size=20&mature=false')
      // A imagem marcada como adulta não passa, mesmo que o provedor a devolva.
      expect(imagens).toEqual([
        {
          id: 'a',
          url: 'https://ex/a.jpg',
          thumbnail: 'https://ex/a-t.jpg',
          title: 'Banco',
          creator: 'patosincharco',
          source: 'flickr',
          license: 'pdm',
          licenseVersion: '1.0',
          landingUrl: 'https://ex/pagina',
          width: 1024,
          height: 691,
          filetype: undefined,
          category: undefined,
          tags: ['banco'],
        },
      ])
    }
  })

  it('Openverse fora do ar também: lista vazia, sem erro', async () => {
    proxy.responder = async () => json({}, 500)
    vi.stubGlobal('fetch', async () => new Response('caiu', { status: 503 }))
    expect(await buscarImagensLivres('banco')).toEqual([])
  })
})
