/**
 * O SITE PÚBLICO NO WORKER (`server/http/siteNoWorker.ts`, Tarefa 1 da spec do site público): a raiz é o
 * site estático, o app mora em `/app`, `/auth/callback` continua servindo o app, os endereços antigos do app
 * vão para `/app/…`, `www.` vai ao domínio sem `www`, caminho desconhecido é 404 de verdade (o `ASSETS`
 * devolve a `404.html`), e fora do host de produção tudo sai com `X-Robots-Tag: noindex` e o robots bloqueia.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SEGMENTOS_DO_APP } from '../../server/http/siteNoWorker'
import { estadoParaUrl, type ViewDeRota } from '../../src/lib/rotas'

const expressFetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))

vi.mock('cloudflare:node', () => ({ httpServerHandler: () => ({ fetch: expressFetch }) }))
vi.mock('node:http', () => ({ createServer: () => ({ listen: () => undefined }) }))
vi.mock('../../server/http/app', () => ({ criarApp: () => ({ use: () => undefined }) }))
vi.mock('../../server/boot/portaoDoWorker', () => ({ conferirBootDoWorker: () => null }))
vi.mock('../../server/db/manutencao', () => ({ schemaPresente: async () => true }))
vi.mock('../../server/db/clientePorRequisicao', () => ({ abrirClienteDoHyperdrive: async () => ({}) }))
vi.mock('../../server/lib/escopoDaRequisicao', () => ({
  rodarNoEscopoDaRequisicao: async (_e: unknown, _c: unknown, fn: () => Promise<[unknown, Promise<void>]>) =>
    (await fn())[0],
}))

/** Um `ASSETS` de mentira com o que o build gera: o app em `/`, a home em `/inicio`, uma página e a 404. */
const ARQUIVOS: Record<string, string> = {
  '/': '<html>app shell</html>',
  '/inicio': '<html>home pública</html>',
  '/planos': '<html>planos</html>',
  '/sitemap.xml': '<?xml version="1.0"?><urlset/>',
  '/robots.txt': 'User-agent: *\nDisallow: /api/\n',
}
const assetsFetch = vi.fn(async (r: Request) => {
  const corpo = ARQUIVOS[new URL(r.url).pathname]
  return corpo !== undefined
    ? new Response(corpo, { status: 200, headers: { 'content-type': 'text/html' } })
    : new Response('<html>404 do site</html>', { status: 404, headers: { 'content-type': 'text/html' } })
})
const env = { HYPERDRIVE: { connectionString: 'postgres://x' }, MIDIA: {} as never, ASSETS: { fetch: assetsFetch } }
const ctx = { waitUntil: () => undefined }

async function chamar(url: string) {
  const { default: worker } = await import('../../worker')
  return worker.fetch(new Request(url), env, ctx)
}
const pedidoAoAssets = () => new URL((assetsFetch.mock.calls.at(-1)![0] as Request).url)

beforeEach(() => {
  assetsFetch.mockClear()
  expressFetch.mockClear()
  process.env.HOST_DE_PRODUCAO = 'frasy.com.br'
})
afterEach(() => {
  delete process.env.HOST_DE_PRODUCAO
})

describe('site público no Worker', () => {
  it('/ serve a home pública (inicio.html), indexável na produção', async () => {
    const r = await chamar('https://frasy.com.br/')
    expect(r.status).toBe(200)
    expect(await r.text()).toBe('<html>home pública</html>')
    expect(pedidoAoAssets().pathname).toBe('/inicio')
    expect(r.headers.get('x-robots-tag')).toBeNull()
  })

  it.each(['/app', '/app/', '/app/jogar', '/app/plano/assinado?x=1', '/auth/callback', '/auth/callback/'])(
    '%s serve o app (index.html)',
    async (caminho) => {
      const r = await chamar(`https://frasy.com.br${caminho}`)
      expect(r.status).toBe(200)
      expect(await r.text()).toBe('<html>app shell</html>')
      expect(pedidoAoAssets().pathname).toBe('/')
    },
  )

  it('a busca acompanha o app (o callback do OAuth traz o código na busca)', async () => {
    await chamar('https://frasy.com.br/auth/callback?code=abc')
    expect(pedidoAoAssets().search).toBe('?code=abc')
  })

  it('caminho desconhecido: 404 com a página 404 (sem soft 404)', async () => {
    const r = await chamar('https://frasy.com.br/nao-existe')
    expect(r.status).toBe(404)
    expect(await r.text()).toBe('<html>404 do site</html>')
  })

  it('/ads.txt sem o arquivo no build: 404', async () => {
    expect((await chamar('https://frasy.com.br/ads.txt')).status).toBe(404)
  })

  it('páginas e sitemap saem do ASSETS como estão', async () => {
    expect(await (await chamar('https://frasy.com.br/planos')).text()).toBe('<html>planos</html>')
    expect(pedidoAoAssets().pathname).toBe('/planos')
    expect((await chamar('https://frasy.com.br/sitemap.xml')).status).toBe(200)
  })

  it('www → domínio sem www, 301, mesmo caminho e busca (API inclusive)', async () => {
    const r = await chamar('https://www.frasy.com.br/guias/x?y=1')
    expect(r.status).toBe(301)
    expect(r.headers.get('location')).toBe('https://frasy.com.br/guias/x?y=1')
    const api = await chamar('https://www.frasy.com.br/api/me')
    expect(api.status).toBe(301)
    expect(expressFetch).not.toHaveBeenCalled()
  })

  it.each([
    ['/jogar?baralho=A', '/app/jogar?baralho=A'],
    ['/plano/assinado', '/app/plano/assinado'],
    ['/responsavel?token=t', '/app/responsavel?token=t'],
  ])('endereço antigo do app %s → 302 para %s', async (de, para) => {
    const r = await chamar(`https://frasy.com.br${de}`)
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe(`https://frasy.com.br${para}`)
  })

  it('/inicio e /index.html → 301 para /', async () => {
    for (const c of ['/inicio', '/index.html']) {
      const r = await chamar(`https://frasy.com.br${c}`)
      expect(r.status).toBe(301)
      expect(r.headers.get('location')).toBe('https://frasy.com.br/')
    }
  })

  it('/api/* continua no Express', async () => {
    await chamar('https://frasy.com.br/api/me')
    expect(expressFetch).toHaveBeenCalledTimes(1)
    expect(assetsFetch).not.toHaveBeenCalled()
  })
})

describe('indexação fora da produção', () => {
  it('staging: X-Robots-Tag noindex em páginas, app e 404', async () => {
    for (const c of ['/', '/app', '/nao-existe']) {
      const r = await chamar(`https://frasy-staging.exemplo.workers.dev${c}`)
      expect(r.headers.get('x-robots-tag'), c).toBe('noindex, nofollow')
    }
  })

  it('staging: robots.txt com Disallow: / (sem consultar o ASSETS)', async () => {
    const r = await chamar('https://frasy-staging.exemplo.workers.dev/robots.txt')
    expect(await r.text()).toBe('User-agent: *\nDisallow: /\n')
    expect(assetsFetch).not.toHaveBeenCalled()
  })

  it('produção: o robots.txt do build', async () => {
    const r = await chamar('https://frasy.com.br/robots.txt')
    expect(await r.text()).toContain('Disallow: /api/')
    expect(r.headers.get('x-robots-tag')).toBeNull()
  })

  it('sem HOST_DE_PRODUCAO nenhum host é indexável', async () => {
    delete process.env.HOST_DE_PRODUCAO
    const r = await chamar('https://frasy.com.br/')
    expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })
})

describe('os segmentos do app que o Worker manda para /app', () => {
  it('cobrem toda tela do app, menos as que colidem com páginas públicas', () => {
    const views: ViewDeRota[] = [
      'capture',
      'interprete',
      'play',
      'library',
      'livros',
      'cartoes',
      'settings',
      'profile',
      'loja',
      'planos',
      'estatisticas',
      'diagnostico',
      'admin',
      'analysis',
    ]
    for (const view of views) {
      const segmento = estadoParaUrl({ view }).split('/')[1]
      expect(SEGMENTOS_DO_APP as readonly string[], view).toContain(segmento)
    }
    /* Sobre e Ajuda são páginas públicas: o app as tem em /app/sobre e /app/ajuda. */
    expect(SEGMENTOS_DO_APP).not.toContain('sobre')
    expect(SEGMENTOS_DO_APP).not.toContain('ajuda')
  })
})
