/**
 * SSRF POR DNS REBINDING (auditoria de segurança 2026-09-26, CWE-918 / CWE-367).
 *
 * `assertPublicUrl` resolve o nome e recusa IP interno — e depois o `fetch` resolve o MESMO nome
 * de novo, por conta própria, na hora de conectar. Entre as duas resoluções o dono do domínio
 * troca a resposta (TTL 0): a guarda vê um IP público, a conexão vai para 127.0.0.1, para a rede
 * privada do Fly (6PN, `fdaa::/16`) ou para a porta interna de métricas. É a classe de bypass que
 * as correções do GAP-002 não fecharam, porque elas validam o NOME e não a CONEXÃO.
 *
 * A correção valida o IP no `lookup` do próprio socket (`despachanteSeguro` em
 * `server/ai/ssrf.ts`): o endereço conferido é, por construção, o endereço conectado.
 *
 * Os casos simulam o rebinding do jeito mais honesto possível sem DNS de laboratório: a guarda de
 * nome é neutralizada (é o que um rebinding bem-sucedido faz com ela) e o alvo é `localhost` — um
 * NOME, para o `lookup` do socket ser chamado, apontando para um servidor local.
 */
import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../server/ai/ssrf', async (original) => {
  const real = await original<typeof import('../../server/ai/ssrf')>()
  /* A guarda de NOME deixa passar — como deixaria no instante em que o domínio do atacante ainda
     resolvia para um IP público. O resto do módulo (o despachante) é o real. */
  return { ...real, assertPublicUrl: vi.fn(async () => {}) }
})

import {
  despachanteSeguro,
  ehDestinoBloqueado,
  esquecerCacheDeDoh,
  fetchSeguro,
  lookupSoPublico,
} from '../../server/ai/ssrf'
import { extractArticle } from '../../server/import/web'

let alvo: Server
let porta = 0
let visitas = 0

beforeAll(async () => {
  alvo = createServer((_req, res) => {
    visitas++
    res.setHeader('content-type', 'text/html')
    res.end('<html><body><article><p>segredo interno do servidor, que nao podia sair daqui</p></article></body></html>')
  })
  await new Promise<void>((ok) => alvo.listen(0, '127.0.0.1', () => ok()))
  const e = alvo.address()
  porta = typeof e === 'object' && e ? e.port : 0
})

afterAll(async () => {
  await new Promise<void>((ok) => alvo.close(() => ok()))
})

describe('o IP é conferido na CONEXÃO, não só no nome', () => {
  it('lookupSoPublico recusa um nome que resolve para loopback', async () => {
    const erro = await new Promise<unknown>((ok) => lookupSoPublico('localhost', {}, (err) => ok(err)))
    expect(ehDestinoBloqueado(erro)).toBe(true)
  })

  it('fetch com o despachante seguro não chega a um servidor em localhost', async () => {
    const antes = visitas
    const erro = await fetch(`http://localhost:${porta}/`, {
      dispatcher: despachanteSeguro,
    } as RequestInit).then(
      () => null,
      (e: unknown) => e,
    )
    expect(erro, 'a conexão com loopback deveria ter sido recusada').toBeTruthy()
    expect(ehDestinoBloqueado(erro), 'o motivo tem de ser a guarda de SSRF, não um erro de rede qualquer').toBe(true)
    expect(visitas, 'o servidor interno recebeu a requisição').toBe(antes)
  })

  it('importação de página: com a guarda de nome enganada, a conexão ainda é recusada', async () => {
    const antes = visitas
    await expect(extractArticle(`http://localhost:${porta}/artigo`)).rejects.toThrow()
    expect(visitas, 'o conteúdo interno foi buscado').toBe(antes)
  })
})

describe('todo fetch para URL escolhida pelo usuário usa o despachante', () => {
  /* Estrutural, e de propósito: as rotas BYOK têm dezenas de testes que trocam o `fetch` global
     por um dublê, e um dublê não conecta em nada. O que se trava aqui é a LIGAÇÃO — cada guarda de
     nome no arquivo tem o seu fetch com o despachante ao lado. */
  /* Desde o B6 da Fase B o `fetch` do STT (BYOK e chave do DONO) mora na cascata: `cascataDeStt.ts`
     guarda o destino de cada perna e chama logo depois. O `sttProxy.ts` fica sem `fetch` nenhum. */
  for (const arquivo of ['server/ai/proxy.ts', 'server/ai/cascataDeStt.ts', 'server/import/web.ts']) {
    it(arquivo, () => {
      const fonte = readFileSync(arquivo, 'utf8')
      const guardas = fonte.match(/await assertPublicUrl\(/g)?.length ?? 0
      const despachos = fonte.match(/dispatcher: despachanteSeguro/g)?.length ?? 0
      expect(guardas).toBeGreaterThan(0)
      expect(despachos, 'fetch depois de assertPublicUrl sem `dispatcher: despachanteSeguro`').toBe(guardas)
      /* E sem seguir redirect: um 302 para IP LITERAL (`http://169.254.169.254/`) não passa pelo
         `lookup` do socket, então só a recusa de seguir fecha esse caminho. O STT com credencial
         própria seguia (achado desta auditoria; o GAP-002 corrigiu só o proxy de chat). */
      const manuais = fonte.match(/redirect: 'manual'/g)?.length ?? 0
      expect(manuais, 'fetch para URL do usuário seguindo redirect').toBeGreaterThanOrEqual(guardas)
    })
  }

  it('server/ai/sttProxy.ts não chama provedor por conta própria (a cascata do STT chama)', () => {
    expect(readFileSync('server/ai/sttProxy.ts', 'utf8')).not.toMatch(/\bfetch\(/)
  })
})

/**
 * NO WORKER NÃO HÁ `node:dns` NEM `undici.Agent` (Task 11 da Fase 2), e o `lookup` do socket não existe
 * para conferir o IP na conexão. `fetchSeguro` é a mesma porta para os dois runtimes: no Node ela põe o
 * `despachanteSeguro` (acima); no Worker ela resolve o nome por DoH IMEDIATAMENTE antes de conectar,
 * passa TODO endereço pela lista de bloqueio, e nunca segue redirect — quem segue (a importação de
 * página) chama `fetchSeguro` de novo a cada salto, e cada salto é conferido de novo.
 *
 * Aqui a guarda de NOME exportada continua enganada (o `vi.mock` do topo): o que barra é a conferência
 * de dentro do `fetchSeguro`, que não passa pelo export.
 */
describe('Worker (BABEL_RUNTIME=worker): fetchSeguro confere por DoH a cada conexão', () => {
  const guarda = process.env.BABEL_RUNTIME
  let alvosConectados: string[] = []

  /** `fetch` global dublê: o DoH responde pelo mapa; os outros destinos são registrados e respondidos por `alvo`. */
  function dublê(dns: Record<string, string[]>, alvo: (url: string) => Response = () => new Response('ok')) {
    alvosConectados = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (entrada: string | URL | Request) => {
        const url = new URL(String(entrada instanceof Request ? entrada.url : entrada))
        if (url.origin + url.pathname === 'https://cloudflare-dns.com/dns-query') {
          const nome = url.searchParams.get('name') ?? ''
          const tipo = url.searchParams.get('type')
          const ips = (dns[nome] ?? []).filter((ip) => (tipo === 'AAAA') === ip.includes(':'))
          return Response.json({
            Status: dns[nome] ? 0 : 3,
            Answer: ips.map((data) => ({ name: nome, type: tipo === 'AAAA' ? 28 : 1, TTL: 0, data })),
          })
        }
        alvosConectados.push(url.href)
        return alvo(url.href)
      }),
    )
  }

  beforeEach(() => {
    process.env.BABEL_RUNTIME = 'worker'
    esquecerCacheDeDoh()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    if (guarda === undefined) delete process.env.BABEL_RUNTIME
    else process.env.BABEL_RUNTIME = guarda
  })

  it('DoH devolvendo IP privado → recusa, e o destino nunca é buscado', async () => {
    dublê({ 'rebind.exemplo': ['127.0.0.1'] })
    const erro = await fetchSeguro('http://rebind.exemplo/segredo', { redirect: 'manual' }).then(
      () => null,
      (e: unknown) => e,
    )
    expect(ehDestinoBloqueado(erro), 'a recusa tem de ser a guarda de SSRF').toBe(true)
    expect(alvosConectados).toEqual([])
  })

  it('IP literal privado → recusa sem consultar DNS', async () => {
    dublê({})
    await expect(fetchSeguro('http://169.254.169.254/latest/meta-data/', {})).rejects.toSatisfy(ehDestinoBloqueado)
    expect(alvosConectados).toEqual([])
  })

  it('DoH devolvendo IP público → busca, sem seguir redirect e sem `dispatcher` (o Worker não tem undici)', async () => {
    dublê({ 'api.exemplo': ['93.184.216.34'] })
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    const r = await fetchSeguro('https://api.exemplo/v1/chat', {
      method: 'POST',
      dispatcher: despachanteSeguro,
    } as never)
    expect(r.status).toBe(200)
    expect(alvosConectados).toEqual(['https://api.exemplo/v1/chat'])
    const init = f.mock.calls.find((c) => String(c[0]).startsWith('https://api.exemplo'))?.[1] as Record<
      string,
      unknown
    >
    expect(init.redirect).toBe('manual')
    expect(init.method).toBe('POST')
    expect('dispatcher' in init).toBe(false)
  })

  it('importação de página: 302 de um host público para IP privado → recusa no salto, sem buscar o alvo', async () => {
    dublê({ 'publico.exemplo': ['93.184.216.34'] }, (url) =>
      url.startsWith('http://publico.exemplo')
        ? new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } })
        : new Response('<html><body><article><p>metadados da nuvem</p></article></body></html>'),
    )
    await expect(extractArticle('http://publico.exemplo/artigo')).rejects.toSatisfy(ehDestinoBloqueado)
    expect(alvosConectados).toEqual(['http://publico.exemplo/artigo'])
  })

  it('importação de página: 302 para um NOME que o DoH resolve para a rede privada → recusa', async () => {
    dublê({ 'publico.exemplo': ['93.184.216.34'], 'interno.exemplo': ['fdaa:0:1::3'] }, (url) =>
      url.startsWith('http://publico.exemplo')
        ? new Response(null, { status: 302, headers: { location: 'http://interno.exemplo/' } })
        : new Response('<html><body><article><p>interno</p></article></body></html>'),
    )
    await expect(extractArticle('http://publico.exemplo/artigo')).rejects.toSatisfy(ehDestinoBloqueado)
    expect(alvosConectados).toEqual(['http://publico.exemplo/artigo'])
  })

  /* CACHE DE DoH POR ISOLATE (Fase 4, T7): só resolução bem-sucedida e toda pública, por 60 s. */
  /** Quantas consultas DoH (A e AAAA contam separadas) o dublê recebeu para `nome`. */
  function consultasDoh(nome: string): number {
    const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    return f.mock.calls.filter((c) => {
      const u = new URL(String(c[0]))
      return u.pathname === '/dns-query' && u.searchParams.get('name') === nome
    }).length
  }

  it('cache: o mesmo host público dentro do TTL consulta o DoH uma vez só', async () => {
    dublê({ 'cache.exemplo': ['93.184.216.34'] })
    await fetchSeguro('https://cache.exemplo/a', {})
    await fetchSeguro('https://cache.exemplo/b', {})
    expect(consultasDoh('cache.exemplo')).toBe(2) // A + AAAA, da primeira vez só
    expect(alvosConectados).toEqual(['https://cache.exemplo/a', 'https://cache.exemplo/b'])
  })

  it('cache: resposta privada nunca é guardada — a próxima consulta vai ao DoH e, pública, passa', async () => {
    const dns: Record<string, string[]> = { 'vira.exemplo': ['10.0.0.7'] }
    dublê(dns)
    await expect(fetchSeguro('https://vira.exemplo/', {})).rejects.toSatisfy(ehDestinoBloqueado)
    expect(consultasDoh('vira.exemplo')).toBe(2)
    dns['vira.exemplo'] = ['93.184.216.34']
    const r = await fetchSeguro('https://vira.exemplo/', {})
    expect(r.status).toBe(200)
    expect(consultasDoh('vira.exemplo')).toBe(4)
    expect(alvosConectados).toEqual(['https://vira.exemplo/'])
  })

  it('cache: entrada vencida (61 s) consulta de novo e, se agora privada, recusa', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const dns: Record<string, string[]> = { 'rebind-lento.exemplo': ['93.184.216.34'] }
    dublê(dns)
    await fetchSeguro('https://rebind-lento.exemplo/', {})
    dns['rebind-lento.exemplo'] = ['127.0.0.1']
    vi.advanceTimersByTime(61_000)
    await expect(fetchSeguro('https://rebind-lento.exemplo/', {})).rejects.toSatisfy(ehDestinoBloqueado)
    expect(consultasDoh('rebind-lento.exemplo')).toBe(4)
    expect(alvosConectados).toEqual(['https://rebind-lento.exemplo/'])
  })

  it('cache: no máximo 512 hosts — o 513º tira o mais antigo', async () => {
    const dns: Record<string, string[]> = {}
    for (let i = 1; i <= 513; i++) dns[`h${i}.exemplo`] = ['93.184.216.34']
    dublê(dns)
    for (let i = 1; i <= 513; i++) await fetchSeguro(`https://h${i}.exemplo/`, {})
    expect(consultasDoh('h1.exemplo')).toBe(2)
    await fetchSeguro('https://h2.exemplo/', {})
    expect(consultasDoh('h2.exemplo'), 'o segundo mais antigo continua no cache').toBe(2)
    await fetchSeguro('https://h1.exemplo/', {})
    expect(consultasDoh('h1.exemplo'), 'o mais antigo saiu e foi consultado de novo').toBe(4)
  })
})

describe('todo fetch para URL do usuário passa por fetchSeguro', () => {
  /* Estrutural, como o bloco acima: no Worker o `dispatcher` não existe, e só o `fetchSeguro` confere o IP.
     Um `fetch(` cru ao lado de um `despachanteSeguro` seria um destino do usuário sem guarda no Worker. */
  for (const arquivo of [
    'server/ai/proxy.ts',
    'server/ai/cascataDeStt.ts',
    'server/import/web.ts',
    'server/ai/nucleo/sintetizarVoz.ts',
  ]) {
    it(arquivo, () => {
      const fonte = readFileSync(arquivo, 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '')
      expect(fonte.match(/\bfetchSeguro\(/g)?.length ?? 0).toBeGreaterThan(0)
      expect(fonte, '`fetch(` cru para destino do usuário').not.toMatch(/(?<![\w.])fetch\(/)
    })
  }
})
