/**
 * O CACHE DE PESOS QUE SE CONFERE E SE CURA (DISP-01, change `modelos-confiaveis-e-offline`, 2.2 e 2.3).
 *
 * O caso da auditoria: um `.onnx` do moonshine chega pela metade, com 200 e sem `content-length`. Antes ele
 * ia ao Cache Storage e a legenda morria para sempre; agora não é gravado, a cópia velha com tamanho errado é
 * apagada no `match`, e a sessão que não abre apaga o modelo e baixa de novo UMA vez.
 */
import { createHash } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  _zerarCacheDePesos,
  apagarModeloDoCache,
  arquivoDoModelo,
  carregarComCura,
  criarCacheDePesos,
} from '../src/gateway/cacheDePesos'
import { REVISOES_DOS_MODELOS } from '../src/gateway/revisoesDosModelos'

const MODELO = 'onnx-community/moonshine-tiny-ONNX'
const SHA = REVISOES_DOS_MODELOS[MODELO]
const ARQUIVO = 'onnx/encoder_model_quantized.onnx'
const CHAVE = `https://huggingface.co/${MODELO}/resolve/main/${ARQUIVO}`

const integro = new Uint8Array(4096).map((_, i) => i % 251)
const sha = createHash('sha256').update(integro).digest('hex')
const manifesto = {
  [`${MODELO}@${SHA}`]: { [ARQUIVO]: [integro.byteLength, sha] as [number, string], 'config.json': [10] as [number] },
}

/** Um Cache Storage de mentira, com a mesma API que o cache usa. */
function cacheFalso() {
  const mapa = new Map<string, Response>()
  const c = {
    mapa,
    async match(k: string) {
      return mapa.get(k)?.clone()
    },
    async put(k: string, r: Response) {
      mapa.set(k, r)
    },
    async delete(k: string | Request) {
      return mapa.delete(typeof k === 'string' ? k : k.url)
    },
    async keys() {
      return [...mapa.keys()].map((url) => ({ url }) as Request)
    },
  }
  return c
}

beforeEach(() => _zerarCacheDePesos())

describe('arquivoDoModelo', () => {
  it('lê a chave do Hub e a do mesmo domínio, na revisão fixada', () => {
    expect(arquivoDoModelo(CHAVE, manifesto)?.entrada?.[0]).toBe(4096)
    expect(arquivoDoModelo(`/models/${MODELO}/${ARQUIVO}`, manifesto)?.modelo).toBe(MODELO)
    expect(arquivoDoModelo('/ort-wasm-simd-threaded.asyncify.wasm', manifesto)).toBeNull()
  })
})

describe('put', () => {
  it('corpo truncado com 200 e sem content-length NÃO é gravado (DISP-01)', async () => {
    const c = cacheFalso()
    const aoRecusar = vi.fn()
    const cache = criarCacheDePesos({ abrir: async () => c as unknown as Cache, manifesto, aoRecusar })
    await cache.put(CHAVE, new Response(integro.slice(0, 2000), { status: 200 }))
    expect([...c.mapa.keys()]).not.toContain(CHAVE)
    expect(aoRecusar).toHaveBeenCalledWith(expect.objectContaining({ motivo: 'tamanho', modelo: MODELO }))
  })

  it('mesmo tamanho com conteúdo trocado também não (sha256)', async () => {
    const c = cacheFalso()
    const cache = criarCacheDePesos({ abrir: async () => c as unknown as Cache, manifesto })
    await cache.put(CHAVE, new Response(new Uint8Array(4096), { status: 200 }))
    expect(c.mapa.size).toBe(0)
  })

  it('o íntegro é gravado, com o content-length certo', async () => {
    const c = cacheFalso()
    const cache = criarCacheDePesos({ abrir: async () => c as unknown as Cache, manifesto })
    await cache.put(CHAVE, new Response(integro, { status: 200 }))
    expect(c.mapa.get(CHAVE)?.headers.get('content-length')).toBe('4096')
  })

  it('fora do manifesto: grava se o content-length bater; recusa se não', async () => {
    const c = cacheFalso()
    const cache = criarCacheDePesos({ abrir: async () => c as unknown as Cache, manifesto })
    await cache.put('/ort.wasm', new Response(new Uint8Array(10), { headers: { 'content-length': '10' } }))
    expect(c.mapa.has('/ort.wasm')).toBe(true)
    const cortado = new Response(new Uint8Array(5))
    Object.defineProperty(cortado, 'headers', { value: new Headers({ 'content-length': '10' }) })
    await cache.put('/ort2.wasm', cortado)
    expect(c.mapa.has('/ort2.wasm')).toBe(false)
  })
})

describe('match', () => {
  it('a cópia envenenada (gravada antes da conferência) é apagada e volta como ausente', async () => {
    const c = cacheFalso()
    c.mapa.set(CHAVE, new Response(integro.slice(0, 2000), { headers: { 'content-length': '2000' } }))
    const cache = criarCacheDePesos({ abrir: async () => c as unknown as Cache, manifesto })
    expect(await cache.match(CHAVE)).toBeUndefined()
    expect(c.mapa.has(CHAVE)).toBe(false)
  })

  it('a cópia boa volta', async () => {
    const c = cacheFalso()
    c.mapa.set(CHAVE, new Response(integro, { headers: { 'content-length': '4096' } }))
    const cache = criarCacheDePesos({ abrir: async () => c as unknown as Cache, manifesto })
    expect(await cache.match(CHAVE)).toBeTruthy()
  })
})

describe('apagarModeloDoCache', () => {
  it('apaga só as entradas do modelo', async () => {
    const c = cacheFalso()
    c.mapa.set(CHAVE, new Response('a'))
    c.mapa.set(`https://huggingface.co/${MODELO}/resolve/main/config.json`, new Response('b'))
    c.mapa.set('https://huggingface.co/onnx-community/whisper-tiny/resolve/main/config.json', new Response('c'))
    expect(await apagarModeloDoCache(MODELO, async () => c as unknown as Cache)).toBe(2)
    expect(c.mapa.size).toBe(1)
  })
})

describe('carregarComCura (cache envenenado simulado)', () => {
  const erroDeSessao = () => new Error("Can't create a session. ERROR_CODE: 7, ERROR_MESSAGE: protobuf parsing failed.")

  it('a sessão que não abre apaga o modelo e carrega de novo, uma vez', async () => {
    const apagar = vi.fn(async () => 1)
    let tentativas = 0
    const r = await carregarComCura(
      MODELO,
      async () => {
        tentativas += 1
        if (tentativas === 1) throw erroDeSessao()
        return 'pronto'
      },
      apagar,
    )
    expect(r).toBe('pronto')
    expect(apagar).toHaveBeenCalledWith(MODELO)
    expect(tentativas).toBe(2)
  })

  it('falhou de novo: marca "modelo-corrompido" e não entra em laço', async () => {
    const apagar = vi.fn(async () => 1)
    const carregar = vi.fn(async () => {
      throw erroDeSessao()
    })
    await expect(carregarComCura(MODELO, carregar, apagar)).rejects.toThrow(/^\[falha:modelo-corrompido\]/)
    expect(carregar).toHaveBeenCalledTimes(2)
    // A mesma página não cura de novo o mesmo modelo.
    await expect(carregarComCura(MODELO, carregar, apagar)).rejects.toThrow(/modelo-corrompido/)
    expect(carregar).toHaveBeenCalledTimes(3)
    expect(apagar).toHaveBeenCalledTimes(1)
  })

  it('com um arquivo recusado nesta página, a falha é de download, não de modelo', async () => {
    const c = cacheFalso()
    const cache = criarCacheDePesos({ abrir: async () => c as unknown as Cache, manifesto })
    await cache.put(CHAVE, new Response(integro.slice(0, 10)))
    await expect(
      carregarComCura(
        MODELO,
        async () => {
          throw erroDeSessao()
        },
        async () => 0,
      ),
    ).rejects.toThrow(/^\[falha:download-interrompido\]/)
  })

  it('erro que não é de sessão passa direto, sem cura', async () => {
    const apagar = vi.fn(async () => 0)
    await expect(
      carregarComCura(
        MODELO,
        async () => {
          throw new TypeError('Failed to fetch')
        },
        apagar,
      ),
    ).rejects.toThrow('Failed to fetch')
    expect(apagar).not.toHaveBeenCalled()
  })
})
