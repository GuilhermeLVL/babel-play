// @vitest-environment jsdom
/**
 * BOMBA DE PIXELS: as dimensões saem do CABEÇALHO (puro) e o teto vale ANTES de `createImageBitmap`.
 */
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dimensoesDaImagem } from '../src/core/livros/imagemDeCapa'
import { reduzirParaCapa } from '../src/lib/livros/capasLocais'

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const png = (w: number, h: number) =>
  new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0,
    0,
    0,
    13,
    0x49,
    0x48,
    0x44,
    0x52,
    ...be32(w),
    ...be32(h),
    8,
    6,
    0,
    0,
    0,
  ])
const base = (chunk: string, n: number) => {
  const b = new Uint8Array(n)
  b.set(new TextEncoder().encode('RIFF'), 0)
  b.set(new TextEncoder().encode('WEBP'), 8)
  b.set(new TextEncoder().encode(chunk), 12)
  return b
}

describe('dimensoesDaImagem', () => {
  it('PNG: lê o IHDR, inclusive 40000 x 40000 em poucos bytes', () => {
    expect(dimensoesDaImagem(png(600, 900))).toEqual({ largura: 600, altura: 900 })
    expect(dimensoesDaImagem(png(40000, 40000))).toEqual({ largura: 40000, altura: 40000 })
  })
  it('PNG truncado, sem IHDR ou com dimensão zero: null', () => {
    expect(dimensoesDaImagem(png(1, 1).slice(0, 20))).toBeNull()
    expect(dimensoesDaImagem(png(0, 5))).toBeNull()
    const semIhdr = png(5, 5)
    semIhdr[12] = 0x58
    expect(dimensoesDaImagem(semIhdr)).toBeNull()
  })
  it('GIF: little-endian; truncado é null', () => {
    const g = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]
    expect(dimensoesDaImagem(new Uint8Array([...g, 0x2c, 0x01, 0x90, 0x01, 0, 0]))).toEqual({
      largura: 300,
      altura: 400,
    })
    expect(dimensoesDaImagem(new Uint8Array(g))).toBeNull()
  })
  it('JPEG: pula marcadores até o SOF (altura antes da largura)', () => {
    const j = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x03, 0x84, 0x02, 0x58, 3, 0, 0, 0, 0, 0, 0, 0,
    ])
    expect(dimensoesDaImagem(j)).toEqual({ largura: 600, altura: 900 })
    expect(dimensoesDaImagem(j.slice(0, 12))).toBeNull()
    expect(dimensoesDaImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0, 0]))).toBeNull()
    expect(dimensoesDaImagem(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBeNull()
  })
  it('WebP: VP8X, VP8L e VP8; truncado ou chunk desconhecido: null', () => {
    const x = base('VP8X', 30)
    x.set([0x1f, 0x4e, 0], 24)
    x.set([0x1f, 0x4e, 0], 27)
    expect(dimensoesDaImagem(x)).toEqual({ largura: 20000, altura: 20000 })
    const l = base('VP8L', 30)
    l[20] = 0x2f
    l.set([99, 0, 0, 0], 21)
    expect(dimensoesDaImagem(l)).toEqual({ largura: 100, altura: 1 })
    const v = base('VP8 ', 30)
    v.set([0x9d, 0x01, 0x2a, 0x2c, 0x01, 0x90, 0x01], 23)
    expect(dimensoesDaImagem(v)).toEqual({ largura: 300, altura: 400 })
    expect(dimensoesDaImagem(base('VP8X', 20))).toBeNull()
    expect(dimensoesDaImagem(base('ABCD', 40))).toBeNull()
  })
  it('SVG e texto: null', () => {
    expect(dimensoesDaImagem(new TextEncoder().encode('<svg width="99999"/>'))).toBeNull()
  })
})

describe('reduzirParaCapa antes de decodificar', () => {
  const espiao = vi.fn(async () => ({ width: 600, height: 900, close: vi.fn() }))
  beforeEach(() => {
    espiao.mockClear()
    vi.stubGlobal('createImageBitmap', espiao)
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ fillRect: vi.fn(), drawImage: vi.fn() })) as never
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, tipo?: string) {
      cb(new Blob(['x'.repeat(3000)], { type: tipo }))
    } as never
  })
  afterEach(() => vi.unstubAllGlobals())

  it('PNG 40000 x 40000 é recusado SEM chamar createImageBitmap', async () => {
    await expect(reduzirParaCapa(new Blob([png(40000, 40000)]))).rejects.toMatchObject({ motivo: 'pixels' })
    expect(espiao).not.toHaveBeenCalled()
  })
  it('cabeçalho ilegível (JPEG truncado) é recusado como inválido, sem decodificar', async () => {
    const j = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])])
    await expect(reduzirParaCapa(j)).rejects.toMatchObject({ motivo: 'invalida' })
    expect(espiao).not.toHaveBeenCalled()
  })
  it('PNG pequeno e válido passa', async () => {
    expect((await reduzirParaCapa(new Blob([png(600, 900)]))).size).toBeGreaterThan(0)
    expect(espiao).toHaveBeenCalledOnce()
  })
})
