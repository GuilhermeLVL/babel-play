import { describe, expect, it } from 'vitest'

import { epubParaBaixar } from '../src/core/livros/epubDaFonte'

describe('Baixar EPUB do catálogo: só Standard Ebooks (CC0), link direto à fonte', () => {
  const epub = 'https://standardebooks.org/ebooks/a/b/downloads/a_b.epub'
  it('Standard Ebooks ganha o link da própria fonte', () => {
    expect(epubParaBaixar({ fonte: 'standard-ebooks', formatos: { epub } })).toBe(`${epub}?source=download`)
  })
  it('Gutenberg, Wikisource e Internet Archive NÃO ganham', () => {
    for (const fonte of ['gutenberg-curado', 'wikisource', 'internet-archive-aberto']) {
      expect(epubParaBaixar({ fonte, formatos: { epub } })).toBeNull()
    }
  })
  it('host que não é da Standard Ebooks, http ou sem EPUB: nada', () => {
    expect(epubParaBaixar({ fonte: 'standard-ebooks', formatos: { epub: 'https://evil.exemplo/a.epub' } })).toBeNull()
    expect(
      epubParaBaixar({ fonte: 'standard-ebooks', formatos: { epub: 'http://standardebooks.org/a.epub' } }),
    ).toBeNull()
    expect(epubParaBaixar({ fonte: 'standard-ebooks', formatos: {} })).toBeNull()
  })
})
