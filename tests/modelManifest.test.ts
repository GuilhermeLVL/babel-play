/**
 * Regressão de A-P0-4 (docs/discovery/A-model-download.md).
 *
 * `areModelsCached` respondia `true` quando UMA entrada qualquer do Cache Storage continha o id
 * do modelo. Medido em produção: com 12 entradas / 62,38 MB e apenas 1 dos 4 pesos `.onnx`
 * presentes, a função devolveu `true` e a UI afirmou "os pesos já estão no seu navegador — nada é
 * baixado de novo" enquanto ~113 MB ainda precisavam descer.
 *
 * A correção é um MANIFESTO gravado ao fim de uma carga bem-sucedida: só está em cache quando
 * todos os arquivos do manifesto existem E o tamanho de cada um bate.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  chaveDoManifesto,
  gravarManifesto,
  lerManifesto,
  modeloEstaCompleto,
  type ManifestoDeModelo,
} from '../src/gateway/modelManifest'

/** Cache Storage falso, fiel ao que usamos: keys() + match() + put(). */
function criarCacheFalso(entradas: Record<string, number>) {
  const mapa = new Map<string, number>(Object.entries(entradas))
  const cache = {
    keys: async () => [...mapa.keys()].map((url) => ({ url })),
    match: async (req: string | { url: string }) => {
      const url = typeof req === 'string' ? req : req.url
      if (!mapa.has(url)) return undefined
      const bytes = mapa.get(url)!
      return { headers: { get: (h: string) => (h.toLowerCase() === 'content-length' ? String(bytes) : null) }, blob: async () => ({ size: bytes }) }
    },
    put: async (req: string | { url: string }, res: { _bytes: number }) => {
      mapa.set(typeof req === 'string' ? req : req.url, res._bytes)
    },
    delete: async (req: string | { url: string }) => mapa.delete(typeof req === 'string' ? req : req.url),
  }
  return { cache, mapa }
}

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
})

const MANIFESTO: ManifestoDeModelo = {
  modelId: 'onnx-community/whisper-base',
  dtype: 'hybrid',
  device: 'wasm',
  arquivos: [
    { url: 'https://huggingface.co/onnx-community/whisper-base/resolve/main/config.json', bytes: 1508 },
    { url: 'https://huggingface.co/onnx-community/whisper-base/resolve/main/onnx/encoder_model.onnx', bytes: 32_904_992 },
    { url: 'https://huggingface.co/onnx-community/whisper-base/resolve/main/onnx/decoder_model_merged_q4.onnx', bytes: 51_000_000 },
  ],
  bytesTotais: 83_906_500,
  gravadoEm: 1_786_200_000_000,
}

describe('chaveDoManifesto', () => {
  it('distingue dtype e device — trocar qualquer um muda os arquivos baixados', () => {
    const a = chaveDoManifesto('m', 'hybrid', 'wasm')
    expect(chaveDoManifesto('m', 'q8', 'wasm')).not.toBe(a)
    expect(chaveDoManifesto('m', 'hybrid', 'webgpu')).not.toBe(a)
    expect(chaveDoManifesto('m', 'hybrid', 'wasm')).toBe(a)
  })
})

describe('modeloEstaCompleto', () => {
  it('REGRESSÃO A-P0-4: cache parcial NÃO conta como completo', async () => {
    // Exatamente o estado medido: só o encoder presente, decoder ausente.
    const { cache } = criarCacheFalso({
      [MANIFESTO.arquivos[0].url]: 1508,
      [MANIFESTO.arquivos[1].url]: 32_904_992,
    })
    gravarManifesto(MANIFESTO)
    const r = await modeloEstaCompleto(cache as never, MANIFESTO.modelId, 'hybrid', 'wasm')
    expect(r.completo).toBe(false)
    expect(r.faltando).toContain(MANIFESTO.arquivos[2].url)
    expect(r.bytesFaltando).toBe(51_000_000)
  })

  it('arquivo TRUNCADO (tamanho não bate) invalida o cache', async () => {
    const { cache } = criarCacheFalso({
      [MANIFESTO.arquivos[0].url]: 1508,
      [MANIFESTO.arquivos[1].url]: 32_904_992,
      [MANIFESTO.arquivos[2].url]: 12_000_000, // download interrompido no meio
    })
    gravarManifesto(MANIFESTO)
    const r = await modeloEstaCompleto(cache as never, MANIFESTO.modelId, 'hybrid', 'wasm')
    expect(r.completo).toBe(false)
    expect(r.truncados).toContain(MANIFESTO.arquivos[2].url)
  })

  it('todos os arquivos presentes e íntegros ⇒ completo', async () => {
    const { cache } = criarCacheFalso(Object.fromEntries(MANIFESTO.arquivos.map((a) => [a.url, a.bytes])))
    gravarManifesto(MANIFESTO)
    const r = await modeloEstaCompleto(cache as never, MANIFESTO.modelId, 'hybrid', 'wasm')
    expect(r.completo).toBe(true)
    expect(r.faltando).toEqual([])
  })

  it('sem manifesto ⇒ NÃO está em cache (nunca assume por presença de URL)', async () => {
    const { cache } = criarCacheFalso(Object.fromEntries(MANIFESTO.arquivos.map((a) => [a.url, a.bytes])))
    const r = await modeloEstaCompleto(cache as never, MANIFESTO.modelId, 'hybrid', 'wasm')
    expect(r.completo).toBe(false)
    expect(r.motivo).toBe('sem-manifesto')
  })

  it('REGRESSÃO A-P0-4: manifesto de OUTRO dtype não vale — o fallback q8 baixa outros arquivos', async () => {
    const { cache } = criarCacheFalso(Object.fromEntries(MANIFESTO.arquivos.map((a) => [a.url, a.bytes])))
    gravarManifesto(MANIFESTO) // gravado para dtype 'hybrid'
    const r = await modeloEstaCompleto(cache as never, MANIFESTO.modelId, 'q8', 'wasm')
    expect(r.completo).toBe(false)
    expect(r.motivo).toBe('sem-manifesto')
  })

  it('informa quantos bytes ainda faltam, para a UI ser honesta', async () => {
    const { cache } = criarCacheFalso({ [MANIFESTO.arquivos[0].url]: 1508 })
    gravarManifesto(MANIFESTO)
    const r = await modeloEstaCompleto(cache as never, MANIFESTO.modelId, 'hybrid', 'wasm')
    expect(r.bytesFaltando).toBe(32_904_992 + 51_000_000)
  })
})

describe('gravarManifesto / lerManifesto', () => {
  it('sobrevive ao round-trip', () => {
    gravarManifesto(MANIFESTO)
    expect(lerManifesto(MANIFESTO.modelId, 'hybrid', 'wasm')).toEqual(MANIFESTO)
  })

  it('JSON corrompido no localStorage não derruba a leitura', () => {
    store.set(chaveDoManifesto(MANIFESTO.modelId, 'hybrid', 'wasm'), '{ isto não é json')
    expect(lerManifesto(MANIFESTO.modelId, 'hybrid', 'wasm')).toBeNull()
  })
})

describe('bytesEsperados — gravação parcial no cache não pode virar "completo"', () => {
  it('REGRESSÃO (achada pela suíte de mecanismo, cenário 11/quota): manifesto que descreve menos bytes do que o download entregou é INCOMPLETO', async () => {
    // Sob quota estourada, o `cache.put` falha em alguns arquivos. O manifesto era montado a
    // partir do que ESTAVA no cache, então descrevia o estado parcial como se fosse o total —
    // e a checagem seguinte dizia "completo" porque todos os arquivos do manifesto existiam.
    const parcial: ManifestoDeModelo = {
      ...MANIFESTO,
      arquivos: MANIFESTO.arquivos.slice(0, 1),   // só o config.json foi gravado
      bytesTotais: 1508,
      bytesEsperados: MANIFESTO.bytesTotais,      // mas o download entregou 83,9 MB
    }
    const { cache } = criarCacheFalso({ [MANIFESTO.arquivos[0].url]: 1508 })
    gravarManifesto(parcial)
    const r = await modeloEstaCompleto(cache as never, MANIFESTO.modelId, 'hybrid', 'wasm')
    expect(r.completo).toBe(false)
    expect(r.motivo).toBe('gravacao-parcial')
    expect(r.bytesFaltando).toBe(MANIFESTO.bytesTotais - 1508)
  })

  it('manifesto sem bytesEsperados (legado) continua válido', async () => {
    const { cache } = criarCacheFalso(Object.fromEntries(MANIFESTO.arquivos.map((a) => [a.url, a.bytes])))
    gravarManifesto(MANIFESTO)   // sem bytesEsperados
    expect((await modeloEstaCompleto(cache as never, MANIFESTO.modelId, 'hybrid', 'wasm')).completo).toBe(true)
  })

  it('bytesEsperados batendo com o gravado ⇒ completo', async () => {
    const { cache } = criarCacheFalso(Object.fromEntries(MANIFESTO.arquivos.map((a) => [a.url, a.bytes])))
    gravarManifesto({ ...MANIFESTO, bytesEsperados: MANIFESTO.bytesTotais })
    expect((await modeloEstaCompleto(cache as never, MANIFESTO.modelId, 'hybrid', 'wasm')).completo).toBe(true)
  })
})
