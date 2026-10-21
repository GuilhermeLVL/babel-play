/**
 * A CSP DOS ANÚNCIOS NO WORKER (rulings R31 e R32). A CSP do `_headers` é fixa no build; com a flag
 * `anuncios` ligada E `ANUNCIOS_ORIGEM` configurada, o Worker sobrepõe o `Content-Security-Policy` das
 * respostas `text/html` acrescentando a origem de anúncios em `frame-src` — e só ali. A flag é lida uma
 * vez por isolate a cada 60 s. Flag desligada (ou sem origem): a resposta do `ASSETS` sai intacta.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mundo = vi.hoisted(() => ({ flag: false, leituras: 0, falhar: false }))

vi.mock('cloudflare:node', () => ({ httpServerHandler: () => ({ fetch: vi.fn() }) }))
vi.mock('node:http', () => ({ createServer: () => ({ listen: () => undefined }) }))
vi.mock('../../server/http/app', () => ({ criarApp: () => ({ use: () => undefined }) }))
vi.mock('../../server/boot/portaoDoWorker', () => ({ conferirBootDoWorker: () => null }))
vi.mock('../../server/db/manutencao', () => ({ schemaPresente: async () => true }))
vi.mock('../../server/db/clientePorRequisicao', () => ({ abrirClienteDoHyperdrive: async () => ({}) }))
vi.mock('../../server/lib/escopoDaRequisicao', () => ({
  rodarNoEscopoDaRequisicao: async (_e: unknown, _c: unknown, fn: () => Promise<[unknown, Promise<void>]>) =>
    (await fn())[0],
}))
vi.mock('../../server/lib/flags', () => ({
  definicoesDasFlags: async () => {
    mundo.leituras++
    if (mundo.falhar) throw new Error('banco caiu')
    return [{ chave: 'anuncios', descricao: '', habilitada: mundo.flag, regras: {}, payload: null }]
  },
}))

const ORIGEM = 'https://ads.frasy.com.br'
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; connect-src 'self'; frame-ancestors 'self'"

function html(): Response {
  return new Response('<html>spa</html>', {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': CSP,
      'cross-origin-embedder-policy': 'credentialless',
    },
  })
}

let assetsFetch = vi.fn(async () => html())
const ctx = { waitUntil: () => undefined }

async function chamar(caminho: string, headers: Record<string, string> = {}) {
  const { default: worker } = await import('../../worker')
  const env = { HYPERDRIVE: { connectionString: 'postgres://x' }, MIDIA: {} as never, ASSETS: { fetch: assetsFetch } }
  return worker.fetch(new Request(`https://app.test${caminho}`, { headers }), env, ctx)
}

const frameSrc = (csp: string | null) =>
  csp
    ?.split(/;\s*/)
    .find((d) => d.startsWith('frame-src '))
    ?.split(' ')
    .slice(1) ?? null
const scriptSrc = (csp: string | null) => csp?.split(/;\s*/).find((d) => d.startsWith('script-src ')) ?? null

beforeEach(async () => {
  Object.assign(mundo, { flag: false, leituras: 0, falhar: false })
  assetsFetch = vi.fn(async () => html())
  delete process.env.ANUNCIOS_ORIGEM
  const { _zerarCacheDosAnuncios } = await import('../../server/http/anunciosNoWorker')
  _zerarCacheDosAnuncios()
})
afterEach(() => {
  delete process.env.ANUNCIOS_ORIGEM
  vi.useRealTimers()
})

describe('CSP dos anúncios no Worker', () => {
  it('sem ANUNCIOS_ORIGEM: o cabeçalho sai intacto e a flag nem é lida', async () => {
    mundo.flag = true
    const r = await chamar('/')
    expect(r.headers.get('content-security-policy')).toBe(CSP)
    expect(mundo.leituras).toBe(0)
  })

  it('flag desligada (com a origem): o cabeçalho sai intacto', async () => {
    process.env.ANUNCIOS_ORIGEM = ORIGEM
    const r = await chamar('/')
    expect(r.headers.get('content-security-policy')).toBe(CSP)
    expect(await r.text()).toBe('<html>spa</html>')
  })

  it('flag ligada + origem: frame-src leva a origem; script-src não muda', async () => {
    process.env.ANUNCIOS_ORIGEM = ORIGEM
    mundo.flag = true
    const r = await chamar('/biblioteca')
    const csp = r.headers.get('content-security-policy')
    expect(frameSrc(csp)).toEqual(["'self'", ORIGEM])
    expect(scriptSrc(csp)).toBe(scriptSrc(CSP))
    expect(csp).not.toMatch(/doubleclick|googlesyndication/)
    // os outros cabeçalhos do ASSETS continuam
    expect(r.headers.get('cross-origin-embedder-policy')).toBe('credentialless')
    expect(await r.text()).toBe('<html>spa</html>')
  })

  it('resposta que não é HTML não é tocada', async () => {
    process.env.ANUNCIOS_ORIGEM = ORIGEM
    mundo.flag = true
    assetsFetch = vi.fn(
      async () =>
        new Response('{}', { headers: { 'content-type': 'application/json', 'content-security-policy': CSP } }),
    )
    const r = await chamar('/i18n/en.json')
    expect(r.headers.get('content-security-policy')).toBe(CSP)
  })

  /* R35: a página de anúncios não mora no app. `/anuncios/espaco.html` aqui é um caminho comum da SPA: sai o
     `index.html` com a CSP DO APP (e, com a flag, só o `frame-src` a mais), nunca a CSP larga da página. */
  it('/anuncios/espaco.html no Worker do app é caminho comum da SPA, com a CSP do app', async () => {
    process.env.ANUNCIOS_ORIGEM = ORIGEM
    const r = await chamar('/anuncios/espaco.html')
    expect(assetsFetch).toHaveBeenCalledTimes(1)
    expect(r.headers.get('content-security-policy')).toBe(CSP)
    expect(r.headers.get('cross-origin-embedder-policy')).toBe('credentialless')
    mundo.flag = true
    const { _zerarCacheDosAnuncios } = await import('../../server/http/anunciosNoWorker')
    _zerarCacheDosAnuncios()
    const ligada = await chamar('/anuncios/espaco.html')
    expect(scriptSrc(ligada.headers.get('content-security-policy'))).toBe(scriptSrc(CSP))
    expect(frameSrc(ligada.headers.get('content-security-policy'))).toEqual(["'self'", ORIGEM])
  })

  it('R35: ANUNCIOS_ORIGEM igual à origem do app é recusada (CSP intacta, flag nem lida)', async () => {
    process.env.ANUNCIOS_ORIGEM = 'https://app.test'
    mundo.flag = true
    const r = await chamar('/')
    expect(r.headers.get('content-security-policy')).toBe(CSP)
    expect(mundo.leituras).toBe(0)
  })

  it('documento pelo Sec-Fetch-Dest, mesmo sem content-type (o 304 da revalidação)', async () => {
    process.env.ANUNCIOS_ORIGEM = ORIGEM
    mundo.flag = true
    assetsFetch = vi.fn(async () => new Response(null, { status: 304, headers: { 'content-security-policy': CSP } }))
    const r = await chamar('/', { 'sec-fetch-dest': 'document' })
    expect(r.status).toBe(304)
    expect(frameSrc(r.headers.get('content-security-policy'))).toEqual(["'self'", ORIGEM])
    // o mesmo 304 sem ser documento (um script revalidando) não é tocado
    const s = await chamar('/sw.js', { 'sec-fetch-dest': 'script' })
    expect(s.headers.get('content-security-policy')).toBe(CSP)
  })

  it('falha ao ler a flag: fica a CSP estreita', async () => {
    process.env.ANUNCIOS_ORIGEM = ORIGEM
    mundo.flag = true
    mundo.falhar = true
    const r = await chamar('/')
    expect(r.headers.get('content-security-policy')).toBe(CSP)
  })

  it('a flag é lida uma vez a cada 60 s por isolate', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    process.env.ANUNCIOS_ORIGEM = ORIGEM
    mundo.flag = true
    await chamar('/')
    await chamar('/jogos')
    expect(mundo.leituras).toBe(1)
    mundo.flag = false
    vi.setSystemTime(Date.now() + 61_000)
    const r = await chamar('/')
    expect(mundo.leituras).toBe(2)
    expect(r.headers.get('content-security-policy')).toBe(CSP)
  })
})
