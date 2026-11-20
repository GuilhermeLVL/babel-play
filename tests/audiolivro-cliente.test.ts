// @vitest-environment jsdom
/**
 * O CLIENTE DO AUDIOLIVRO (F2): o ponteiro `atual.json` + o manifesto + os tempos do CDN (qualquer falha = `null`, e o
 * narrador local lê), a escolha da faixa pelo que o navegador toca (Safari sem Opus) e o capítulo baixado no
 * aparelho (Cache Storage `frasy-audiolivros-v1`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { type ManifestoDeAudio } from '../src/core/leitura/audiolivro'
import {
  apagarCapitulo,
  baixarCapitulo,
  capituloBaixado,
  tamanhoLegivel,
  urlParaTocar,
} from '../src/lib/leitor/audiolivro/capituloOffline'
import { escolherFaixa } from '../src/lib/leitor/audiolivro/faixa'
import { carregarManifesto, carregarTempos, urlDoAudio } from '../src/lib/leitor/audiolivro/manifesto'

/* O manifesto do capítulo 1 do Dom Casmurro gerado para a demonstração (válido em `validarManifesto`). */
const MANIFESTO: ManifestoDeAudio = {
  versao: 1,
  livroId: 'ws-pt-dom-casmurro',
  idioma: 'pt',
  voz: 'F1',
  motor: 'supertonic-3',
  versaoDoMotor: 'supertonic-3@724fb5abbf55',
  versaoDoPreprocessador: '1',
  hashDoTexto: '18caa9e688e5050c',
  capitulos: [
    {
      nn: 1,
      duracaoS: 147.317,
      bytes: 563880,
      sha256: 'd92023bf93cfdc1c0ee88c15fd7dc78c6da7ee2f2af6dd811ff7711c683689c2',
      frases: 22,
      hashDasFrases: '01b9208992c4a60f',
    },
  ],
  criadoEm: '2026-11-02T04:49:27.318Z',
  rotulo: 'voz sintetizada',
  licencaDoTexto: 'Domínio público no Brasil (Lei 9.610, art. 41): Machado de Assis †1908.',
  classificacao: '12',
  formato: { codec: 'opus', kbps: 32, canais: 1 },
}

const BASE = 'https://audio.exemplo.dev'
const resposta = (corpo: unknown, status = 200) =>
  new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status })

/** Um `fetch` falso que responde por caminho e anota o que foi pedido. */
function cdn(rotas: Record<string, () => Promise<Response> | Response>) {
  const pedidos: string[] = []
  const f = vi.fn(async (u: RequestInfo | URL) => {
    const url = String(u)
    pedidos.push(url)
    const rota = rotas[url.replace(BASE, '')]
    return rota ? rota() : resposta('não achou', 404)
  }) as unknown as typeof fetch
  return { f, pedidos }
}

const CAMINHO = '/audiolivros/ws-pt-dom-casmurro/F1'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('urlDoAudio', () => {
  it('null sem a variável; sem a barra final com ela', () => {
    vi.stubEnv('VITE_AUDIO_URL', '')
    expect(urlDoAudio()).toBeNull()
    vi.stubEnv('VITE_AUDIO_URL', 'http://localhost:3176/')
    expect(urlDoAudio()).toBe('http://localhost:3176')
  })
})

describe('carregarManifesto', () => {
  const o = (f: typeof fetch, timeoutMs?: number) => ({ fetch: f, base: BASE, timeoutMs })

  it('lê o ponteiro atual.json e depois o manifesto válido', async () => {
    const { f, pedidos } = cdn({
      [`${CAMINHO}/atual.json`]: () => resposta({ versao: 1 }),
      [`${CAMINHO}/manifesto.json`]: () => resposta(MANIFESTO),
    })
    expect(await carregarManifesto('ws-pt-dom-casmurro', 'F1', o(f))).toEqual({ manifesto: MANIFESTO, versao: 1 })
    expect(pedidos).toEqual([`${BASE}${CAMINHO}/atual.json`, `${BASE}${CAMINHO}/manifesto.json`])
  })

  it('null com fetch que rejeita', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('rede')
    }) as unknown as typeof fetch
    expect(await carregarManifesto('ws-pt-dom-casmurro', 'F1', o(f))).toBeNull()
  })

  it('null com 404 (no ponteiro ou no manifesto)', async () => {
    expect(await carregarManifesto('ws-pt-dom-casmurro', 'F1', o(cdn({}).f))).toBeNull()
    const { f } = cdn({ [`${CAMINHO}/atual.json`]: () => resposta({ versao: 1 }) })
    expect(await carregarManifesto('ws-pt-dom-casmurro', 'F1', o(f))).toBeNull()
  })

  it('null com timeout (fetch pendente)', async () => {
    const f = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch
    expect(await carregarManifesto('ws-pt-dom-casmurro', 'F1', o(f, 10))).toBeNull()
  })

  it('null com manifesto inválido ou de outro livro', async () => {
    for (const ruim of [{ ...MANIFESTO, rotulo: 'humano' }, { ...MANIFESTO, livroId: 'outro' }, 'não é json']) {
      const { f } = cdn({
        [`${CAMINHO}/atual.json`]: () => resposta({ versao: 1 }),
        [`${CAMINHO}/manifesto.json`]: () => resposta(ruim),
      })
      expect(await carregarManifesto('ws-pt-dom-casmurro', 'F1', o(f))).toBeNull()
    }
  })

  it('null com ponteiro inválido, sem pedir o manifesto', async () => {
    for (const ruim of [{ versao: 0 }, { versao: 1.5 }, { versao: '1' }, {}, []]) {
      const { f, pedidos } = cdn({
        [`${CAMINHO}/atual.json`]: () => resposta(ruim),
        [`${CAMINHO}/manifesto.json`]: () => resposta(MANIFESTO),
      })
      expect(await carregarManifesto('ws-pt-dom-casmurro', 'F1', o(f))).toBeNull()
      expect(pedidos).toHaveLength(1)
    }
  })

  it('sem base (VITE_AUDIO_URL ausente) ou com id fora do padrão: null sem rede', async () => {
    vi.stubEnv('VITE_AUDIO_URL', '')
    const { f, pedidos } = cdn({})
    expect(await carregarManifesto('ws-pt-dom-casmurro', 'F1', { fetch: f })).toBeNull()
    expect(await carregarManifesto('../segredo', 'F1', o(f))).toBeNull()
    expect(await carregarManifesto('ws-pt-dom-casmurro', 'F1/../x', o(f))).toBeNull()
    expect(pedidos).toEqual([])
  })
})

describe('carregarTempos', () => {
  const url = `${BASE}${CAMINHO}/1/01.json`
  it('devolve os tempos válidos com o total de frases esperado', async () => {
    const tempos = [
      { i: 0, t0: 0, t1: 1.3 },
      { i: 1, t0: 1.7, t1: 3 },
    ]
    const { f } = cdn({ [`${CAMINHO}/1/01.json`]: () => resposta(tempos) })
    expect(await carregarTempos(url, 2, { fetch: f })).toEqual(tempos)
  })
  it('null com tempos fora de ordem, sobrepostos, contagem diferente ou 404', async () => {
    for (const ruim of [
      [{ i: 1, t0: 0, t1: 1 }],
      [
        { i: 0, t0: 0, t1: 2 },
        { i: 1, t0: 1, t1: 3 },
      ],
      [{ i: 0, t0: 2, t1: 1 }],
    ]) {
      const { f } = cdn({ [`${CAMINHO}/1/01.json`]: () => resposta(ruim) })
      expect(await carregarTempos(url, ruim.length, { fetch: f })).toBeNull()
    }
    const { f } = cdn({ [`${CAMINHO}/1/01.json`]: () => resposta([{ i: 0, t0: 0, t1: 1 }]) })
    expect(await carregarTempos(url, 2, { fetch: f })).toBeNull()
    expect(await carregarTempos(url, 1, { fetch: cdn({}).f })).toBeNull()
  })
})

describe('escolherFaixa', () => {
  const toca = (o: Record<string, string>) => (t: string) => o[t] ?? ''
  it('Opus quando o navegador toca Opus em WebM ou Ogg', () => {
    expect(escolherFaixa(MANIFESTO, toca({ 'audio/webm; codecs="opus"': 'probably' }))).toEqual({
      ext: 'opus',
      mime: 'audio/webm; codecs="opus"',
    })
    expect(escolherFaixa(MANIFESTO, toca({ 'audio/ogg; codecs="opus"': 'maybe' }))?.ext).toBe('opus')
  })
  it('Safari sem Opus: a faixa AAC quando o manifesto a traz; senão null', () => {
    const aac = { ...MANIFESTO, formato: { codec: 'aac' as const, kbps: 48, canais: 1 as const } }
    const safari = toca({ 'audio/mp4; codecs="mp4a.40.2"': 'maybe' })
    expect(escolherFaixa(aac, safari)).toEqual({ ext: 'm4a', mime: 'audio/mp4; codecs="mp4a.40.2"' })
    expect(escolherFaixa(MANIFESTO, safari)).toBeNull()
    expect(escolherFaixa(aac, toca({}))).toBeNull()
  })
})

describe('capítulo offline (Cache Storage)', () => {
  function cachesFalsos() {
    const guardados = new Map<string, Response>()
    const nomes: string[] = []
    const cache = {
      match: async (u: string) => guardados.get(u)?.clone(),
      put: async (u: string, r: Response) => void guardados.set(u, r),
      delete: async (u: string) => guardados.delete(u),
    }
    vi.stubGlobal('caches', {
      open: async (nome: string) => {
        nomes.push(nome)
        return cache
      },
    })
    return { guardados, nomes }
  }
  const url = `${BASE}${CAMINHO}/1/01.opus`

  it('baixar guarda, capituloBaixado vê, apagar tira; progresso chega a 1', async () => {
    const { guardados, nomes } = cachesFalsos()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(1000), { headers: { 'content-length': '1000' } })),
    )
    expect(await capituloBaixado(url)).toBe(false)
    const progresso: number[] = []
    await baixarCapitulo(url, (f) => progresso.push(f))
    expect(await capituloBaixado(url)).toBe(true)
    expect(progresso.at(-1)).toBe(1)
    expect((await guardados.get(url)!.clone().arrayBuffer()).byteLength).toBe(1000)
    expect(new Set(nomes)).toEqual(new Set(['frasy-audiolivros-v1']))
    await apagarCapitulo(url)
    expect(await capituloBaixado(url)).toBe(false)
  })

  it('baixar recusa resposta de erro sem guardar nada', async () => {
    cachesFalsos()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x', { status: 503 })),
    )
    await expect(baixarCapitulo(url)).rejects.toThrow()
    expect(await capituloBaixado(url)).toBe(false)
  })

  it('urlParaTocar: o capítulo baixado vira blob:, o outro segue a URL do CDN; sem Cache Storage, a URL', async () => {
    cachesFalsos()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:capitulo' }))
    expect(await urlParaTocar(url)).toBe(url)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(10))),
    )
    await baixarCapitulo(url)
    expect(await urlParaTocar(url)).toBe('blob:capitulo')
    vi.stubGlobal('caches', undefined)
    expect(await capituloBaixado(url)).toBe(false)
    expect(await urlParaTocar(url)).toBe(url)
  })

  it('tamanhoLegivel', () => {
    expect(tamanhoLegivel(6 * 1024 * 1024)).toBe('≈ 6 MB')
    expect(tamanhoLegivel(563880)).toBe('≈ 551 KB')
    expect(tamanhoLegivel(100)).toBe('≈ 1 KB')
  })
})
