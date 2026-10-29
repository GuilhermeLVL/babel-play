import { describe, expect, it } from 'vitest'

import { TETO_DO_MODELO_BYTES } from '../src/core/avatar/tiers'
import { carregarAvatar, ErroDeAvatar } from '../src/lib/avatar/carregador'

/** Um GLB procedural mínimo: uma malha de `vertices / 3` triângulos soltos, sem textura, sem binário no repo. */
export function glbProcedural(vertices = 3): ArrayBuffer {
  const posicoes = new Float32Array(vertices * 3)
  for (let i = 0; i < vertices; i++) posicoes.set([i % 3, Math.floor((i % 9) / 3), 0], i * 3)
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: vertices, type: 'VEC3', min: [0, 0, 0], max: [2, 2, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: posicoes.byteLength }],
    buffers: [{ byteLength: posicoes.byteLength }],
  }
  let texto = JSON.stringify(json)
  while (texto.length % 4) texto += ' '
  const jsonBytes = new TextEncoder().encode(texto)
  const total = 12 + 8 + jsonBytes.length + 8 + posicoes.byteLength
  const out = new ArrayBuffer(total)
  const v = new DataView(out)
  v.setUint32(0, 0x46546c67, true)
  v.setUint32(4, 2, true)
  v.setUint32(8, total, true)
  v.setUint32(12, jsonBytes.length, true)
  v.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(out, 20, jsonBytes.length).set(jsonBytes)
  const o = 20 + jsonBytes.length
  v.setUint32(o, posicoes.byteLength, true)
  v.setUint32(o + 4, 0x004e4942, true)
  new Uint8Array(out, o + 8, posicoes.byteLength).set(new Uint8Array(posicoes.buffer))
  return out
}

describe('carregarAvatar', () => {
  it('carrega um GLB procedural e conta os triângulos', async () => {
    const a = await carregarAvatar(glbProcedural(3), { tier: 'fraco' })
    expect(a.triangulos).toBe(1)
    expect(a.vrm).toBeNull()
    expect(a.meta).toBeNull()
    expect(a.acimaDoTeto).toBe(false)
    expect(() => a.dispose()).not.toThrow()
  })

  it('aceita Blob e informa quando passa do teto de triângulos do tier', async () => {
    const grande = glbProcedural(60_003) // 20 001 triângulos
    const fraco = await carregarAvatar(new Blob([grande]), { tier: 'fraco' })
    expect(fraco.triangulos).toBe(20_001)
    expect(fraco.acimaDoTeto).toBe(true)
    const medio = await carregarAvatar(grande, { tier: 'medio' })
    expect(medio.acimaDoTeto).toBe(false)
    fraco.dispose()
    medio.dispose()
  })

  it('recusa o que não é GLB antes de decodificar', async () => {
    const texto = new TextEncoder().encode('{"não":"é glb"} e mais um pouco de texto').buffer
    await expect(carregarAvatar(texto, { tier: 'forte' })).rejects.toMatchObject({ codigo: 'formato' })
    await expect(carregarAvatar(new ArrayBuffer(4), { tier: 'forte' })).rejects.toMatchObject({ codigo: 'formato' })
  })

  it('recusa arquivo acima do teto de bytes sem ler o conteúdo', async () => {
    await expect(carregarAvatar(new ArrayBuffer(TETO_DO_MODELO_BYTES + 1), { tier: 'forte' })).rejects.toMatchObject({
      codigo: 'acima_do_teto',
    })
    const blobGrande = { size: TETO_DO_MODELO_BYTES + 1, arrayBuffer: () => Promise.reject(new Error('leu!')) }
    await expect(carregarAvatar(blobGrande as unknown as Blob, { tier: 'forte' })).rejects.toMatchObject({
      codigo: 'acima_do_teto',
    })
  })

  it('por URL: recusa pelo Content-Length sem baixar o corpo; HTTP de erro vira "rede"', async () => {
    let corpoLido = false
    const gigante = (async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': String(TETO_DO_MODELO_BYTES + 1) }),
      body: { cancel: async () => undefined },
      arrayBuffer: async () => {
        corpoLido = true
        return new ArrayBuffer(0)
      },
    })) as unknown as typeof fetch
    await expect(carregarAvatar('/x.vrm', { tier: 'forte', buscar: gigante })).rejects.toMatchObject({
      codigo: 'acima_do_teto',
    })
    expect(corpoLido).toBe(false)
    const quatrocentosEQuatro = (async () => new Response('nada', { status: 404 })) as unknown as typeof fetch
    await expect(carregarAvatar('/x.vrm', { tier: 'forte', buscar: quatrocentosEQuatro })).rejects.toMatchObject({
      codigo: 'rede',
    })
  })

  it('por URL: pede sem credenciais e sem referer, e carrega', async () => {
    let init: RequestInit | undefined
    const buscar = (async (_u: string, i?: RequestInit) => {
      init = i
      return new Response(glbProcedural(), { status: 200 })
    }) as unknown as typeof fetch
    const a = await carregarAvatar('/avatares/dev/x.glb', { tier: 'fraco', buscar })
    expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' })
    expect(a.triangulos).toBe(1)
    a.dispose()
  })

  it('respeita o sinal de aborto, antes e durante', async () => {
    const c = new AbortController()
    c.abort()
    await expect(carregarAvatar(glbProcedural(), { tier: 'fraco', sinalDeAborto: c.signal })).rejects.toMatchObject({
      codigo: 'abortado',
    })
    const c2 = new AbortController()
    const buscar = ((_u: string, i?: RequestInit) =>
      new Promise((_, rejeitar) => {
        i?.signal?.addEventListener('abort', () => rejeitar(new DOMException('abortou', 'AbortError')))
      })) as unknown as typeof fetch
    const p = carregarAvatar('/x.glb', { tier: 'fraco', sinalDeAborto: c2.signal, buscar })
    c2.abort()
    await expect(p).rejects.toBeInstanceOf(ErroDeAvatar)
    await expect(p).rejects.toMatchObject({ codigo: 'abortado' })
  })

  it('GLB com JSON quebrado vira erro de leitura, não exceção solta', async () => {
    const bom = glbProcedural()
    const ruim = bom.slice(0)
    new Uint8Array(ruim)[24] = 0x7e // estraga o JSON
    await expect(carregarAvatar(ruim, { tier: 'fraco' })).rejects.toMatchObject({ codigo: 'leitura' })
  })
})
