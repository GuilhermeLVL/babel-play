// @vitest-environment jsdom
/**
 * AS CAPAS NA TELA: o cartão com imagem (e a queda silenciosa para a tipográfica), o detalhe com crédito e o
 * fluxo "Trocar capa" (sucesso, recusa, voltar ao original).
 */
import 'fake-indexeddb/auto'

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CartaoDoLivro from '../src/components/views/livros/CartaoDoLivro'
import DetalheDoLivro from '../src/components/views/livros/DetalheDoLivro'
import type { LivroDoCatalogo } from '../src/core/livros/tipos'

const CAPA = {
  origem: 'standard-ebooks' as const,
  url: 'https://standardebooks.org/ebooks/herman-melville/moby-dick/downloads/cover-thumbnail.jpg',
  licenca: 'CC0' as const,
  credito: 'Capa: Standard Ebooks (CC0)',
}

const livro = (o: Partial<LivroDoCatalogo> = {}): LivroDoCatalogo =>
  ({
    id: 'se-herman-melville-moby-dick',
    titulo: 'Moby Dick',
    autores: [{ nome: 'Herman Melville', anoMorte: 1891, idiomas: ['en'] }],
    tradutores: [],
    idioma: 'en',
    fonte: 'standard-ebooks',
    fonteId: 'herman-melville/moby-dick',
    formatos: {},
    categorias: [],
    classificacao: 'livre',
    nivel: 'B2',
    palavras: 200000,
    minutosEstimados: 900,
    popularidade: 1,
    downloads: 1,
    credito: '',
    licenca: '',
    capa: CAPA,
    ...o,
  }) as LivroDoCatalogo

const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe1, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x03, 0x84, 0x02, 0x58, 3, 0, 0, 0, 0, 0, 0, 0,
])
const imagem = (nome = 'foto.jpg', tipo = 'image/jpeg') => new File([JPEG], nome, { type: tipo })

let n = 0
beforeEach(() => {
  n = 0
  globalThis.URL.createObjectURL = vi.fn(() => `blob:t-${++n}`)
  globalThis.URL.revokeObjectURL = vi.fn()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 600, height: 900, close: vi.fn() })),
  )
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    set fillStyle(_v: string) {},
  })) as never
  HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, tipo?: string) {
    cb(new Blob(['x'.repeat(3000)], { type: tipo }))
  } as never
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('cartão com capa de imagem', () => {
  it('mostra a imagem da fonte com lazy, tamanho fixo, sem referrer e decorativa; a tipográfica fica por baixo', () => {
    const { container } = render(
      <ul>
        <CartaoDoLivro livro={livro()} aoAbrir={() => {}} />
      </ul>,
    )
    const img = container.querySelector('img.lv-capa-img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe(CAPA.url)
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('decoding')).toBe('async')
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(img.getAttribute('width')).toBe('350')
    expect(img.getAttribute('height')).toBe('525')
    expect(img.getAttribute('alt')).toBe('')
    expect(container.querySelector('.lv-capa')?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.lv-capa')?.getAttribute('data-capa')).toBe('catalogo')
    expect(container.querySelector('svg.lv-capa-tip')).toBeTruthy()
    // o botão do cartão continua com o data-livro de sempre
    expect(container.querySelector('[data-livro="se-herman-melville-moby-dick"]')).toBeTruthy()
  })

  it('se a imagem falhar, some em silêncio e fica a capa tipográfica', () => {
    const { container } = render(
      <ul>
        <CartaoDoLivro livro={livro()} aoAbrir={() => {}} />
      </ul>,
    )
    fireEvent.error(container.querySelector('img.lv-capa-img') as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.lv-capa')?.getAttribute('data-capa')).toBe('tipografica')
    expect(container.querySelector('svg.lv-capa-tip')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('livro sem capa no catálogo: só a tipográfica, com o título desenhado', () => {
    const { container } = render(
      <ul>
        <CartaoDoLivro livro={livro({ capa: undefined, titulo: 'Dom Casmurro', idioma: 'pt' })} aoAbrir={() => {}} />
      </ul>,
    )
    expect(container.querySelector('img')).toBeNull()
    const linhas = [...container.querySelectorAll('[data-testid="capa-linha"]')].map((x) => x.textContent)
    expect(linhas.join(' ')).toBe('Dom Casmurro')
    expect(container.querySelector('svg .cp-selo-texto')?.textContent).toBe('PT')
  })
})

describe('detalhe e "Trocar capa"', () => {
  const montar = () => render(<DetalheDoLivro livro={livro()} aoVoltar={() => {}} aoLer={() => {}} />)

  it('a capa do detalhe tem alt útil e o crédito da fonte aparece', () => {
    const { container } = montar()
    expect(container.querySelector('img.lv-capa-img')?.getAttribute('alt')).toBe('Capa de Moby Dick')
    expect(screen.getByText('Capa: Standard Ebooks (CC0)')).toBeTruthy()
  })

  it('troca a capa por uma imagem do aparelho e depois volta à original', async () => {
    const { container } = montar()
    fireEvent.click(screen.getByTestId('trocar-capa-abrir'))
    const caixa = screen.getByRole('dialog')
    expect(within(caixa).getByText(/Use uma imagem que você tem direito de usar/)).toBeTruthy()
    expect((screen.getByTestId('capa-usar') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByTestId('capa-arquivo'), { target: { files: [imagem()] } })
    await screen.findByTestId('capa-previa')
    await act(async () => fireEvent.click(screen.getByTestId('capa-usar')))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(container.querySelector('.lv-capa')?.getAttribute('data-capa')).toBe('local'))
    expect(container.querySelector('img.lv-capa-img')?.getAttribute('src')).toMatch(/^blob:/)
    // com a capa da pessoa, o crédito da fonte sai
    expect(screen.queryByText('Capa: Standard Ebooks (CC0)')).toBeNull()

    fireEvent.click(screen.getByTestId('trocar-capa-abrir'))
    const voltar = await screen.findByRole('button', { name: /Voltar à capa original/ })
    await act(async () => fireEvent.click(voltar))
    await waitFor(() => expect(container.querySelector('.lv-capa')?.getAttribute('data-capa')).toBe('catalogo'))
    expect(container.querySelector('img.lv-capa-img')?.getAttribute('src')).toBe(CAPA.url)
  })

  it('recusa SVG com uma mensagem clara e não habilita "Usar esta capa"', async () => {
    montar()
    fireEvent.click(screen.getByTestId('trocar-capa-abrir'))
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'a.svg', { type: 'image/svg+xml' })
    fireEvent.change(screen.getByTestId('capa-arquivo'), { target: { files: [svg] } })
    expect((await screen.findByTestId('capa-erro')).textContent).toMatch(/JPG, PNG, WebP ou GIF/)
    expect((screen.getByTestId('capa-usar') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByTestId('capa-previa')).toBeNull()
  })

  it('Esc e Cancelar fecham sem guardar nada', async () => {
    const { container } = montar()
    fireEvent.click(screen.getByTestId('trocar-capa-abrir'))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByTestId('trocar-capa-abrir'))
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(container.querySelector('.lv-capa')?.getAttribute('data-capa')).toBe('catalogo')
  })
})
