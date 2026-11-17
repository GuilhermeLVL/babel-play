/**
 * O SERVICE WORKER MÍNIMO (DISP-02, change `modelos-confiaveis-e-offline`, 4.2 e 4.4).
 *
 * O gerador (`scripts/vite/serviceWorker.ts`) e o próprio `sw.js`, executado aqui contra um `self`, um Cache
 * Storage e um `fetch` de mentira: precache sem `/api` e sem pesos; navegação do app com reserva no cache;
 * `/api`, outras origens e o site público passam direto; o interruptor gera o SW que se desregistra.
 */
import { describe, expect, it, vi } from 'vitest'

import { gerarServiceWorker, listaDePrecache, PREFIXO_DO_CACHE } from '../scripts/vite/serviceWorker'
import { decidirRotaDoSite } from '../server/http/siteNoWorker'
import { decisaoDoSw } from '../src/lib/registrarSw'

const bundle = [
  {
    fileName: 'assets/index-a.js',
    type: 'chunk' as const,
    isEntry: true,
    imports: ['assets/vendor-react-b.js'],
    viteMetadata: { importedCss: new Set(['assets/index-c.css']) },
  },
  { fileName: 'assets/vendor-react-b.js', type: 'chunk' as const, imports: [] },
  { fileName: 'assets/LiveCapture-d.js', type: 'chunk' as const, imports: ['assets/pecas-e.js'] },
  { fileName: 'assets/pecas-e.js', type: 'chunk' as const },
  { fileName: 'assets/whisperWorker-f.js', type: 'asset' as const },
  { fileName: 'assets/Jogos-g.js', type: 'chunk' as const },
  { fileName: 'assets/whisperWorker-f.js.br', type: 'asset' as const },
  { fileName: 'models/x/onnx/m.onnx', type: 'asset' as const },
]

describe('listaDePrecache', () => {
  it('a casca (entrada + imports + CSS) e os chunks da captura; nada de /api, pesos ou .br', () => {
    const l = listaDePrecache(bundle)
    expect(l).toEqual([
      'assets/LiveCapture-d.js',
      'assets/index-a.js',
      'assets/index-c.css',
      'assets/pecas-e.js',
      'assets/vendor-react-b.js',
      'assets/whisperWorker-f.js',
      'silero_vad_legacy.onnx',
      'vad.worklet.bundle.min.js',
    ])
    expect(l.some((p) => /api\/|models\/|\.br$/.test(p))).toBe(false)
    expect(l).not.toContain('assets/Jogos-g.js')
  })
})

/** Uma resposta do mesmo domínio, como o navegador a entrega ao SW (`type: 'basic'`). */
const basica = (corpo: string) => Object.defineProperty(new Response(corpo), 'type', { value: 'basic' })

/** Roda o `sw.js` gerado num escopo falso e devolve os ganchos. */
function rodarSw(
  fonte: string,
  opcoes: { base?: string; cachesIniciais?: string[]; rede?: (url: string) => Promise<Response> } = {},
) {
  const ouvintes: Record<string, (e: any) => void> = {}
  const lojas = new Map<string, Map<string, Response>>()
  for (const k of opcoes.cachesIniciais ?? []) lojas.set(k, new Map())
  const loja = (nome: string) => {
    if (!lojas.has(nome)) lojas.set(nome, new Map())
    const m = lojas.get(nome)!
    const chave = (r: string | Request) => new URL(typeof r === 'string' ? r : r.url, 'https://frasy.test').pathname
    return {
      async addAll(urls: string[]) {
        for (const u of urls) m.set(chave(u), new Response(`conteudo de ${u}`))
      },
      async put(r: string | Request, resp: Response) {
        m.set(chave(r), resp)
      },
      async match(r: string | Request) {
        return m.get(chave(r))?.clone()
      },
    }
  }
  const caches = {
    open: async (n: string) => loja(n),
    keys: async () => [...lojas.keys()],
    delete: async (n: string) => lojas.delete(n),
  }
  const claim = vi.fn(async () => {})
  const unregister = vi.fn(async () => true)
  const self = {
    location: {
      href: `https://frasy.test/sw.js?base=${encodeURIComponent(opcoes.base ?? '/app')}`,
      origin: 'https://frasy.test',
    },
    addEventListener: (tipo: string, f: (e: any) => void) => (ouvintes[tipo] = f),
    clients: { claim },
    registration: { unregister },
    skipWaiting: vi.fn(),
  }
  const fetch = vi.fn(opcoes.rede ?? (async (u: string) => new Response(`rede ${u}`, { status: 200 })))
  new Function('self', 'caches', 'fetch', fonte)(self, caches, (r: Request | string) =>
    fetch(typeof r === 'string' ? r : r.url),
  )

  const esperar = async (tipo: string) => {
    let p: Promise<unknown> = Promise.resolve()
    ouvintes[tipo]({ waitUntil: (x: Promise<unknown>) => (p = x) })
    await p
  }
  /** Um `fetch` do navegador: devolve a resposta do SW, ou `null` se ele deixou passar. */
  const pedir = async (url: string, modo: 'navigate' | 'no-cors' = 'no-cors', method = 'GET') => {
    let resposta = null as Promise<Response> | null
    ouvintes.fetch({ request: { url, method, mode: modo }, respondWith: (r: Promise<Response>) => (resposta = r) })
    return resposta ? await resposta : null
  }
  return { esperar, pedir, lojas, fetch, claim, unregister }
}

const fonte = gerarServiceWorker({
  versao: 'v2',
  precache: ['assets/index-a.js', 'silero_vad_legacy.onnx'],
  ligado: true,
})

describe('sw.js', () => {
  it('instala com a base do app e o precache, e assume a página na primeira instalação', async () => {
    const sw = rodarSw(fonte)
    await sw.esperar('install')
    const loja = sw.lojas.get(`${PREFIXO_DO_CACHE}v2`)!
    expect([...loja.keys()].sort()).toEqual(['/app', '/assets/index-a.js', '/silero_vad_legacy.onnx'])
    await sw.esperar('activate')
    expect(sw.claim).toHaveBeenCalled()
  })

  it('atualização: apaga a versão velha e NÃO assume a página (a captura em curso continua)', async () => {
    const sw = rodarSw(fonte, { cachesIniciais: [`${PREFIXO_DO_CACHE}v1`, 'transformers-cache'] })
    await sw.esperar('install')
    await sw.esperar('activate')
    expect([...sw.lojas.keys()].sort()).toEqual([`${PREFIXO_DO_CACHE}v2`, 'transformers-cache'])
    expect(sw.claim).not.toHaveBeenCalled()
  })

  it('/api, outra origem, POST, pesos e o site público passam direto', async () => {
    const sw = rodarSw(fonte)
    expect(await sw.pedir('https://frasy.test/api/flags')).toBeNull()
    expect(await sw.pedir('https://huggingface.co/x/resolve/main/m.onnx')).toBeNull()
    expect(await sw.pedir('https://frasy.test/assets/index-a.js', 'no-cors', 'POST')).toBeNull()
    expect(await sw.pedir('https://frasy.test/models/x/m.onnx')).toBeNull()
    expect(await sw.pedir('https://frasy.test/planos', 'navigate')).toBeNull()
  })

  it('recarregar offline: a navegação do app cai no HTML guardado (sem tela branca)', async () => {
    const sw = rodarSw(fonte, { rede: async () => Promise.reject(new TypeError('Failed to fetch')) })
    await sw.esperar('install')
    const r = await sw.pedir('https://frasy.test/app/capturar', 'navigate')
    expect(await r!.text()).toBe('conteudo de /app')
  })

  it('estático do app: o que passou pela rede volta do cache sem ela', async () => {
    let online = true
    const sw = rodarSw(fonte, {
      rede: async (u) => (online ? basica(`rede ${u}`) : Promise.reject(new TypeError('Failed to fetch'))),
    })
    await sw.esperar('install')
    expect(await (await sw.pedir('https://frasy.test/assets/vadWorker-x.js'))!.text()).toMatch(/^rede/)
    online = false
    expect(await (await sw.pedir('https://frasy.test/assets/vadWorker-x.js'))!.text()).toMatch(/vadWorker-x\.js/)
  })

  it('o interruptor (VITE_SERVICE_WORKER=0): o SW apaga os caches dele e se desregistra', async () => {
    const sw = rodarSw(gerarServiceWorker({ versao: 'v3', precache: [], ligado: false }), {
      cachesIniciais: [`${PREFIXO_DO_CACHE}v2`, 'transformers-cache'],
    })
    await sw.esperar('activate')
    expect([...sw.lojas.keys()]).toEqual(['transformers-cache'])
    expect(sw.unregister).toHaveBeenCalled()
  })
})

describe('decisaoDoSw (registrarSw.ts)', () => {
  const prod = { PROD: true, VITE_AUTH_REQUIRED: '1' }
  it('só produção e staging (o build do Worker), com o interruptor ligado', () => {
    expect(decisaoDoSw(prod, '')).toBe('registrar')
    expect(decisaoDoSw({ PROD: false, VITE_AUTH_REQUIRED: '1' }, '')).toBe('nada')
    expect(decisaoDoSw({ PROD: true }, '')).toBe('nada') // self-host, edição estática
    expect(decisaoDoSw({ ...prod, VITE_SERVICE_WORKER: '0' }, '')).toBe('desligar')
  })
  it('?sw=desligar na URL desregistra', () => {
    expect(decisaoDoSw(prod, '?sw=desligar')).toBe('desligar')
  })
})

describe('siteNoWorker', () => {
  it('/sw.js é servido como asset (sem redirecionar para /app); o no-cache vem do _headers', () => {
    expect(decidirRotaDoSite(new URL('https://frasy.com.br/sw.js'))).toEqual({ tipo: 'asset', caminho: '/sw.js' })
  })
})
