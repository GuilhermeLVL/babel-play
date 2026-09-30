/**
 * "PROCURAR ATUALIZAÇÃO" DO MODELO NO DISPOSITIVO (protótipo, C9) — e o manifesto que a torna possível.
 *
 * Os modelos vêm do Hugging Face, que publica o commit (`sha`) e a data da última mudança de cada
 * repositório em `/api/models/:id`. O download guarda o commit no manifesto; a busca compara.
 * Manifestos antigos, sem commit, comparam a data da mudança com a data do download.
 *
 * E o defeito que escondia tudo isto: o manifesto é registrado DENTRO dos Web Workers, que não têm
 * localStorage — a gravação falhava em silêncio. Lá dentro, ele agora vai para a janela por mensagem.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  gravarManifesto,
  lerManifesto,
  type ManifestoDeModelo,
  MENSAGEM_DO_MANIFESTO,
  situacaoDaVersao,
} from '../src/gateway/modelManifest'

const store = new Map<string, string>()
const localStorageFalso = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
}

const ID = 'onnx-community/whisper-tiny'
const GRAVADO_EM = Date.parse('2026-09-02T12:00:00Z')

function manifesto(extra: Partial<ManifestoDeModelo> = {}): ManifestoDeModelo {
  return {
    modelId: ID,
    dtype: 'hybrid',
    device: 'wasm',
    arquivos: [{ url: `https://huggingface.co/${ID}/resolve/main/config.json`, bytes: 10 }],
    bytesTotais: 10,
    gravadoEm: GRAVADO_EM,
    ...extra,
  }
}

const publicado = (sha: string, lastModified: string) =>
  vi.fn(async () => ({ ok: true, json: async () => ({ sha, lastModified }) }))

beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', localStorageFalso)
})
afterEach(() => vi.unstubAllGlobals())

describe('situacaoDaVersao', () => {
  it('sem cópia no navegador não há o que comparar', async () => {
    expect(await situacaoDaVersao(ID, publicado('abc', '2026-01-01T00:00:00Z'))).toBe('sem-copia')
  })

  it('mesmo commit publicado → versão atual', async () => {
    gravarManifesto(manifesto({ revisao: 'abc' }))
    expect(await situacaoDaVersao(ID, publicado('abc', '2026-09-20T00:00:00Z'))).toBe('atual')
  })

  it('commit publicado diferente → desatualizado', async () => {
    gravarManifesto(manifesto({ revisao: 'abc' }))
    expect(await situacaoDaVersao(ID, publicado('def', '2026-01-01T00:00:00Z'))).toBe('desatualizado')
  })

  it('manifesto antigo (sem commit): o repositório mudou depois do download → desatualizado', async () => {
    gravarManifesto(manifesto())
    expect(await situacaoDaVersao(ID, publicado('x', '2026-09-10T00:00:00Z'))).toBe('desatualizado')
    expect(await situacaoDaVersao(ID, publicado('x', '2025-06-19T13:56:43Z'))).toBe('atual')
  })

  it('sem rede nunca vira "atual": responde que não deu para conferir', async () => {
    gravarManifesto(manifesto({ revisao: 'abc' }))
    const falha = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await situacaoDaVersao(ID, falha)).toBe('sem-rede')
    const erro = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    expect(await situacaoDaVersao(ID, erro)).toBe('sem-rede')
  })

  it('consulta a API pública do modelo', async () => {
    gravarManifesto(manifesto({ revisao: 'abc' }))
    const buscar = publicado('abc', '2026-01-01T00:00:00Z')
    await situacaoDaVersao(ID, buscar)
    expect(buscar).toHaveBeenCalledWith(`https://huggingface.co/api/models/${ID}`, expect.anything())
  })
})

describe('gravarManifesto dentro de um Web Worker', () => {
  it('sem localStorage, manda o manifesto para a janela em vez de perdê-lo', () => {
    const postMessage = vi.fn()
    vi.stubGlobal('localStorage', undefined)
    vi.stubGlobal('postMessage', postMessage)
    const m = manifesto({ revisao: 'abc' })
    gravarManifesto(m)
    expect(postMessage).toHaveBeenCalledWith({ type: MENSAGEM_DO_MANIFESTO, manifesto: m })
  })

  it('na janela, grava direto no localStorage', () => {
    gravarManifesto(manifesto({ revisao: 'abc' }))
    expect(lerManifesto(ID, 'hybrid', 'wasm')?.revisao).toBe('abc')
  })
})

/* O Bergamot não vem do Hugging Face: a versão é a execução de treino FIXADA no código
   (`modelosDoBergamot.json`), e o manifesto guarda a que baixou. Comparar é local — nada de rede. */
describe('situacaoDaVersao — versão fixada no código (Bergamot)', () => {
  const B = 'bergamot/pt-en'
  const doBergamot = (revisao: string) => manifesto({ modelId: B, dtype: 'int8', revisao })

  it('a cópia é da execução que o código pede: atual, sem perguntar ao Hub', async () => {
    gravarManifesto(doBergamot('run_atual'))
    const buscar = vi.fn()
    expect(await situacaoDaVersao(B, buscar as never, 'run_atual')).toBe('atual')
    expect(buscar).not.toHaveBeenCalled()
  })

  it('o código passou a pedir outra execução: desatualizado ("Atualizar" apaga a velha)', async () => {
    gravarManifesto(doBergamot('run_velha'))
    expect(await situacaoDaVersao(B, vi.fn() as never, 'run_nova')).toBe('desatualizado')
  })

  it('sem cópia continua "sem-copia"', async () => {
    expect(await situacaoDaVersao(B, vi.fn() as never, 'run_atual')).toBe('sem-copia')
  })
})
