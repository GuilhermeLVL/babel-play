// @vitest-environment jsdom
/**
 * AS CAPAS DESTE APARELHO: validar e reduzir a imagem da pessoa (SVG e tipos estranhos recusados), guardar no
 * IndexedDB, "voltar à capa original", remover com o livro e o teto (LRU).
 */
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TETO_DA_IMAGEM_DE_ORIGEM } from '../src/core/livros/imagemDeCapa'
import {
  capaLocalDe,
  ErroDaCapa,
  faltaTentarCapa,
  garantirCapaDoArquivo,
  guardarCapaDoUsuario,
  reduzirParaCapa,
  removerCapa,
  voltarAoOriginal,
} from '../src/lib/livros/capasLocais'

const JPEG = [0xff, 0xd8, 0xff, 0xe1, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x03, 0x84, 0x02, 0x58, 3, 0, 0, 0, 0, 0, 0, 0]
const arquivo = (bytes: number[] | string, tipo = 'image/jpeg') =>
  new Blob([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], { type: tipo })

let criadas = 0
const desenhos: unknown[][] = []

beforeEach(() => {
  criadas = 0
  desenhos.length = 0
  globalThis.URL.createObjectURL = vi.fn(() => `blob:capa-${++criadas}`)
  globalThis.URL.revokeObjectURL = vi.fn()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })),
  )
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(),
    drawImage: (...a: unknown[]) => void desenhos.push(a),
    set fillStyle(_v: string) {},
  })) as never
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, tipo?: string) {
    cb(new Blob(['x'.repeat(4000)], { type: tipo }))
  } as never
})
afterEach(() => vi.unstubAllGlobals())

describe('reduzirParaCapa', () => {
  it('imagem válida vira um WebP de 300 x 450 recortado no centro', async () => {
    const saida = await reduzirParaCapa(arquivo(JPEG))
    expect(saida.type).toBe('image/webp')
    expect(saida.size).toBeLessThanOrEqual(120 * 1024)
    // 800x600 -> recorte 2:3 central de 400x600, desenhado em 300x450
    expect(desenhos[0].slice(1)).toEqual([200, 0, 400, 600, 0, 0, 300, 450])
  })

  it('cai para JPEG onde o navegador não codifica WebP', async () => {
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, tipo?: string) {
      cb(new Blob(['x'], { type: tipo === 'image/webp' ? 'image/png' : tipo }))
    } as never
    expect((await reduzirParaCapa(arquivo(JPEG))).type).toBe('image/jpeg')
  })

  it.each([
    ['SVG', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'image/svg+xml', 'tipo'],
    ['SVG disfarçado de JPEG', '<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/jpeg', 'tipo'],
    ['PDF', '%PDF-1.7 ...', 'application/pdf', 'tipo'],
    ['vazio', '', 'image/png', 'vazia'],
  ])('recusa %s', async (_n, conteudo, tipo, motivo) => {
    await expect(reduzirParaCapa(arquivo(conteudo, tipo))).rejects.toMatchObject({ motivo })
  })

  it('recusa arquivo maior que o teto sem decodificar', async () => {
    const grande = arquivo(JPEG)
    Object.defineProperty(grande, 'size', { value: TETO_DA_IMAGEM_DE_ORIGEM + 1 })
    await expect(reduzirParaCapa(grande)).rejects.toMatchObject({ motivo: 'grande' })
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('recusa imagem que o navegador não decodifica e imagem com pixels demais', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('corrompida')))
    await expect(reduzirParaCapa(arquivo(JPEG))).rejects.toBeInstanceOf(ErroDaCapa)
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 20000, height: 20000, close: vi.fn() })),
    )
    await expect(reduzirParaCapa(arquivo(JPEG))).rejects.toMatchObject({ motivo: 'pixels' })
  })
})

describe('guardar, voltar ao original e remover', () => {
  it('guarda a capa da pessoa, lê de volta e volta ao original', async () => {
    expect(await capaLocalDe('meu-1')).toBeNull()
    expect(await guardarCapaDoUsuario('meu-1', await reduzirParaCapa(arquivo(JPEG)))).toBe(true)
    expect(await capaLocalDe('meu-1')).toEqual({ url: 'blob:capa-1', origem: 'usuario' })
    await voltarAoOriginal('meu-1')
    expect(await capaLocalDe('meu-1')).toBeNull()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:capa-1')
  })

  it('a capa da pessoa vale mais que a do arquivo; voltar mostra a do arquivo de novo', async () => {
    const livro = new File([new Uint8Array(JPEG)], 'a.pdf')
    vi.doMock('../src/lib/leitor/foliate/view.js', () => ({
      makeBook: async () => ({ getCover: async () => arquivo(JPEG), destroy: () => undefined }),
    }))
    expect(await faltaTentarCapa('meu-2')).toBe(true)
    await garantirCapaDoArquivo('meu-2', livro)
    expect(await faltaTentarCapa('meu-2')).toBe(false)
    expect((await capaLocalDe('meu-2'))?.origem).toBe('arquivo')
    await guardarCapaDoUsuario('meu-2', await reduzirParaCapa(arquivo(JPEG)))
    expect((await capaLocalDe('meu-2'))?.origem).toBe('usuario')
    await voltarAoOriginal('meu-2')
    expect((await capaLocalDe('meu-2'))?.origem).toBe('arquivo')
    vi.doUnmock('../src/lib/leitor/foliate/view.js')
  })

  it('livro sem capa no arquivo: tenta uma vez só e fica sem imagem', async () => {
    vi.doMock('../src/lib/leitor/foliate/view.js', () => ({
      makeBook: async () => ({ getCover: async () => null }),
    }))
    await garantirCapaDoArquivo('meu-3', new File(['x'], 'a.epub'))
    expect(await faltaTentarCapa('meu-3')).toBe(false)
    expect(await capaLocalDe('meu-3')).toBeNull()
    vi.doUnmock('../src/lib/leitor/foliate/view.js')
  })

  it('remover apaga tudo do livro', async () => {
    await guardarCapaDoUsuario('meu-4', await reduzirParaCapa(arquivo(JPEG)))
    await removerCapa('meu-4')
    expect(await capaLocalDe('meu-4')).toBeNull()
    expect(await faltaTentarCapa('meu-4')).toBe(true)
  })
})
