/**
 * GAP-002 (auditoria 2026-09-13, provado em openspec/audits/2026-09-13-pre-deploy/evidencias/poc-ssrf.txt).
 *
 * O guard `assertPublicUrl` (server/ai/ssrf.ts) protege o proxy BYOK e o import web contra SSRF.
 * A auditoria provou que ele deixava passar 6 de 8 vetores de destino interno: IPv4 mapeado em IPv6
 * (`::ffff:127.0.0.1` → o servidor normaliza para `::ffff:7f00:1` e o guard não reconhecia o loopback),
 * o endereço de METADADOS da nuvem por essa via (`::ffff:169.254.169.254`), CGNAT `100.64/10`,
 * benchmark `198.18/15` e NAT64 `64:ff9b::/96`.
 *
 * Vetores por IP literal de propósito: sem DNS, o teste é hermético (não depende de rede).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { assertPublicUrl, ehDestinoBloqueado, fetchSeguro } from '../../server/ai/ssrf'

const DEVE_BLOQUEAR: Array<[string, string]> = [
  ['http://127.0.0.1:11434', 'loopback IPv4'],
  ['http://169.254.169.254/latest/meta-data/', 'metadata cloud IPv4'],
  ['http://[::ffff:127.0.0.1]', 'IPv4-mapped loopback'],
  ['http://[::ffff:169.254.169.254]', 'IPv4-mapped metadata'],
  ['http://[::ffff:a9fe:a9fe]', 'IPv4-mapped metadata (hex)'],
  ['http://100.100.100.200', 'CGNAT 100.64/10 (metadata Alibaba/Oracle)'],
  ['http://198.18.0.1', 'benchmark 198.18/15'],
  ['http://[64:ff9b::7f00:1]', 'NAT64 → 127.0.0.1'],
]

const DEVE_PERMITIR: Array<[string, string]> = [
  ['https://8.8.8.8', 'IP público'],
  ['https://1.1.1.1', 'IP público'],
]

describe('GAP-002 — guard anti-SSRF cobre IPv4-mapped e faixas internas', () => {
  it.each(DEVE_BLOQUEAR)('bloqueia %s (%s)', async (url) => {
    await expect(assertPublicUrl(url)).rejects.toSatisfy(ehDestinoBloqueado)
  })

  it.each(DEVE_PERMITIR)('permite %s (%s)', async (url) => {
    await expect(assertPublicUrl(url)).resolves.toBeUndefined()
  })
})

/**
 * O MESMO GUARD NO WORKER (Task 11 da Fase 2). Lá não há `node:dns`: o nome é resolvido por DNS-over-HTTPS
 * (`https://cloudflare-dns.com/dns-query`, `accept: application/dns-json`), e TODO endereço da resposta
 * passa pela mesma lista de bloqueio. O gancho `BABEL_RUNTIME=worker` faz o Node responder como o Worker;
 * o `fetch` global é um dublê que responde como o DoH.
 */
describe('Worker (BABEL_RUNTIME=worker) — resolução por DoH, mesma lista de bloqueio', () => {
  const guarda = process.env.BABEL_RUNTIME
  type Respostas = Record<string, { A?: string[]; AAAA?: string[]; Status?: number }>
  let consultas: string[] = []

  /** Dublê do DoH: responde às consultas `?name=&type=` com o mapa dado; qualquer outro destino é erro. */
  function dublêDoDoh(respostas: Respostas) {
    consultas = []
    return vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(entrada instanceof Request ? entrada.url : entrada))
      if (url.origin + url.pathname !== 'https://cloudflare-dns.com/dns-query') {
        throw new Error(`o guard não devia conectar em ${url.href}`)
      }
      expect(new Headers(init?.headers).get('accept')).toBe('application/dns-json')
      const nome = url.searchParams.get('name') ?? ''
      const tipo = url.searchParams.get('type') as 'A' | 'AAAA'
      consultas.push(`${nome}/${tipo}`)
      const r = respostas[nome]
      const Answer = (r?.[tipo] ?? []).map((data) => ({ name: nome, type: tipo === 'A' ? 1 : 28, TTL: 30, data }))
      return Response.json({ Status: r ? (r.Status ?? 0) : 3, Answer })
    })
  }

  beforeEach(() => {
    process.env.BABEL_RUNTIME = 'worker'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    if (guarda === undefined) delete process.env.BABEL_RUNTIME
    else process.env.BABEL_RUNTIME = guarda
  })

  it.each(DEVE_BLOQUEAR)('bloqueia %s (%s) sem consultar DNS', async (url) => {
    const f = dublêDoDoh({})
    vi.stubGlobal('fetch', f)
    await expect(assertPublicUrl(url)).rejects.toSatisfy(ehDestinoBloqueado)
    expect(f).not.toHaveBeenCalled()
  })

  it.each(DEVE_PERMITIR)('permite %s (%s)', async (url) => {
    vi.stubGlobal('fetch', dublêDoDoh({}))
    await expect(assertPublicUrl(url)).resolves.toBeUndefined()
  })

  it.each<[string, Respostas[string]]>([
    ['loopback', { A: ['127.0.0.1'] }],
    ['metadata', { A: ['169.254.169.254'] }],
    ['privado 10/8', { A: ['10.0.0.7'] }],
    ['privado 172.16/12', { A: ['172.20.1.1'] }],
    ['privado 192.168/16', { A: ['192.168.0.10'] }],
    ['CGNAT', { A: ['100.64.0.1'] }],
    ['0.0.0.0', { A: ['0.0.0.0'] }],
    ['IPv6 loopback', { AAAA: ['::1'] }],
    ['ULA fc00::/7 (rede privada do Fly)', { AAAA: ['fdaa:0:1::3'] }],
    ['link-local IPv6', { AAAA: ['fe80::1'] }],
    ['um público E um privado', { A: ['93.184.216.34', '10.1.2.3'] }],
    ['público no A, loopback mapeado no AAAA', { A: ['93.184.216.34'], AAAA: ['::ffff:127.0.0.1'] }],
    ['resposta que não é IP', { A: ['nao-e-ip'] }],
  ])('DoH devolvendo %s → recusa', async (_rotulo, resposta) => {
    vi.stubGlobal('fetch', dublêDoDoh({ 'alvo.exemplo': resposta }))
    await expect(assertPublicUrl('https://alvo.exemplo/v1')).rejects.toSatisfy(ehDestinoBloqueado)
    expect(consultas.sort()).toEqual(['alvo.exemplo/A', 'alvo.exemplo/AAAA'])
  })

  it('DoH devolvendo só IP público → permite (e quem resolve é o DoH, não o DNS do sistema)', async () => {
    /* `localtest.me` no DNS público é 127.0.0.1 e seria recusado: passar aqui prova que o Worker não usa `node:dns`. */
    vi.stubGlobal('fetch', dublêDoDoh({ 'localtest.me': { A: ['93.184.216.34'], AAAA: ['2606:2800:220:1::1'] } }))
    await expect(assertPublicUrl('https://localtest.me/')).resolves.toBeUndefined()
  })

  it('nome que não existe (NXDOMAIN) → recusa, sem conectar', async () => {
    vi.stubGlobal('fetch', dublêDoDoh({}))
    await expect(assertPublicUrl('https://nao-existe.exemplo/')).rejects.toThrow()
  })

  it('DoH fora do ar → recusa (fail-closed)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    )
    await expect(assertPublicUrl('https://alvo.exemplo/')).rejects.toThrow()
  })
})

/**
 * `localhost` E SEUS SUBDOMÍNIOS são recusados PELO NOME (RFC 6761: `*.localhost` é loopback por definição),
 * nos dois runtimes e sem consultar DNS — no Worker o DoH público não resolveria `localhost` para loopback,
 * e o nome nunca é um destino legítimo do proxy.
 */
describe('localhost pelo nome, nos dois runtimes', () => {
  const guarda = process.env.BABEL_RUNTIME
  afterEach(() => {
    vi.unstubAllGlobals()
    if (guarda === undefined) delete process.env.BABEL_RUNTIME
    else process.env.BABEL_RUNTIME = guarda
  })

  for (const runtime of ['node', 'worker'] as const) {
    it.each(['http://localhost/', 'http://LOCALHOST:9091/metrics', 'http://api.localhost/', 'http://localhost./'])(
      `${runtime}: recusa %s sem consultar DNS`,
      async (url) => {
        if (runtime === 'worker') process.env.BABEL_RUNTIME = 'worker'
        else delete process.env.BABEL_RUNTIME
        const f = vi.fn(async () => Response.json({ Status: 0, Answer: [{ type: 1, data: '93.184.216.34' }] }))
        vi.stubGlobal('fetch', f)
        await expect(assertPublicUrl(url)).rejects.toSatisfy(ehDestinoBloqueado)
        await expect(fetchSeguro(url, {})).rejects.toSatisfy(ehDestinoBloqueado)
        expect(f).not.toHaveBeenCalled()
      },
    )
  }
})

/**
 * NO NODE, `fetchSeguro` CONFERE IP LITERAL SOZINHO (fix round 1 da Task 11). O `lookup` do despachante só roda
 * para NOME: com `http://127.0.0.1:9091/` não há resolução, e o socket conectaria direto. A conferência
 * síncrona de dentro do `fetchSeguro` recusa antes de conectar — mesmo para quem não chamou `assertPublicUrl`.
 */
describe('Node: fetchSeguro recusa IP literal interno sem depender de assertPublicUrl', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    'http://127.0.0.1/',
    'http://127.0.0.1:9091/metrics',
    'http://[::1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::ffff:127.0.0.1]/',
    'http://10.0.0.7/',
    'file:///etc/passwd',
    'data:text/plain,oi',
  ])('recusa %s sem conectar', async (url) => {
    const f = vi.fn(async () => new Response('não devia chegar aqui'))
    vi.stubGlobal('fetch', f)
    await expect(fetchSeguro(url, {})).rejects.toSatisfy(ehDestinoBloqueado)
    expect(f).not.toHaveBeenCalled()
  })

  it('IP literal público segue para o fetch com o despachante', async () => {
    const f = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', f)
    const r = await fetchSeguro('https://1.1.1.1/', {})
    expect(r.status).toBe(200)
    expect(f).toHaveBeenCalledTimes(1)
  })
})
