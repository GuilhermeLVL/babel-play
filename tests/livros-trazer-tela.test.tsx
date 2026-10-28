// @vitest-environment jsdom
/**
 * A TELA "TRAZER O SEU": zona de soltar, link de livro (válido, página, release), DRM, aviso de direitos, guia de
 * fontes (sem pirataria, links seguros), ajuda do Kindle (sem ensinar a tirar proteção) e o aviso de volta.
 * A leitura de verdade (EPUB/PDF) tem teste próprio em `livros-trazer.test.ts`; aqui o leitor é simulado.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ErroDoLivro } from '../src/core/livros/trazer'

const lib = vi.hoisted(() => ({
  lerArquivoTrazido: vi.fn(),
  baixarLivroDoLink: vi.fn(),
}))
vi.mock('../src/lib/livros/trazer', async (original) => ({
  ...(await original<typeof import('../src/lib/livros/trazer')>()),
  lerArquivoTrazido: lib.lerArquivoTrazido,
  baixarLivroDoLink: lib.baixarLivroDoLink,
}))
vi.mock('../src/lib/livros/meusLivros', () => ({
  guardarConteudo: vi.fn(async () => ({ guardado: true })),
  guardarEmMemoria: vi.fn(),
  guardarMeuLivro: vi.fn((l: Record<string, unknown>) => ({ ...l, adicionadoEm: 1, etiquetas: [], progresso: null })),
  lerMeusLivros: vi.fn(() => []),
  novoIdDeLivroTrazido: vi.fn(() => 'meu-teste'),
}))
vi.mock('../src/data/rotas/importacao', () => ({ importWeb: vi.fn() }))

import TrazerOSeu from '../src/components/views/livros/TrazerOSeu'
import { FONTES_LEGAIS } from '../src/core/livros/fontesLegais'

const LIDO = { formato: 'epub', titulo: 'Livro de Teste', capitulos: [{ titulo: 'Parte 1', texto: 'Era uma vez.' }] }
const PROIBIDOS = /z-?\s?lib|zlibrary|libgen|library genesis|anna['’]?s|annas-archive|sci-?hub|pirat|torrent|dedrm/i

beforeEach(() => {
  lib.lerArquivoTrazido.mockReset()
  lib.baixarLivroDoLink.mockReset()
})
afterEach(cleanup)

const voltarParaAAba = () => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

const arquivo = (nome = 'livro.epub') => new File(['x'], nome)

describe('Trazer o seu: arquivo', () => {
  it('soltar um arquivo na zona abre o livro direto no leitor', async () => {
    lib.lerArquivoTrazido.mockResolvedValue(LIDO)
    const aoAbrir = vi.fn()
    render(<TrazerOSeu aoAbrir={aoAbrir} />)
    fireEvent.drop(screen.getByTestId('zona-de-soltar'), { dataTransfer: { files: [arquivo()] } })
    await waitFor(() => expect(aoAbrir).toHaveBeenCalledTimes(1))
    expect(aoAbrir.mock.calls[0][0]).toMatchObject({ id: 'meu-teste', titulo: 'Livro de Teste', origem: 'arquivo' })
  })

  it('escolher pelo seletor funciona igual', async () => {
    lib.lerArquivoTrazido.mockResolvedValue(LIDO)
    const aoAbrir = vi.fn()
    render(<TrazerOSeu aoAbrir={aoAbrir} />)
    fireEvent.change(screen.getByTestId('arquivo-do-livro'), { target: { files: [arquivo()] } })
    await waitFor(() => expect(aoAbrir).toHaveBeenCalled())
  })

  it('arquivo com proteção (DRM): mensagem gentil que aponta a ajuda, nada abre', async () => {
    lib.lerArquivoTrazido.mockRejectedValue(new ErroDoLivro('drm'))
    const aoAbrir = vi.fn()
    render(<TrazerOSeu aoAbrir={aoAbrir} />)
    fireEvent.drop(screen.getByTestId('zona-de-soltar'), { dataTransfer: { files: [arquivo()] } })
    const erro = await screen.findByTestId('erro-do-trazer')
    expect(erro.textContent).toMatch(/proteção \(DRM\) e o Frasy não consegue abrir/)
    expect(erro.textContent).toMatch(/Não é culpa sua/)
    expect(erro.textContent).toMatch(/Comprei na Amazon/)
    expect(aoAbrir).not.toHaveBeenCalled()
  })

  it.each([
    ['pdf-imagem', /só imagem/],
    ['grande', /grande demais/],
    ['corrompido', /incompleto ou danificado/],
    ['formato', /EPUB, um PDF ou um TXT/],
  ] as const)('erro %s tem frase própria', async (motivo, esperado) => {
    lib.lerArquivoTrazido.mockRejectedValue(new ErroDoLivro(motivo))
    render(<TrazerOSeu aoAbrir={vi.fn()} />)
    fireEvent.drop(screen.getByTestId('zona-de-soltar'), { dataTransfer: { files: [arquivo()] } })
    expect((await screen.findByTestId('erro-do-trazer')).textContent).toMatch(esperado)
  })
})

describe('Trazer o seu: link de livro', () => {
  const colar = (valor: string) => {
    fireEvent.change(screen.getByTestId('link-do-livro'), { target: { value: valor } })
    fireEvent.submit(screen.getByTestId('form-link-de-livro'))
  }

  it('link do raw do GitHub: baixa no navegador e abre', async () => {
    const url = 'https://raw.githubusercontent.com/u/r/main/o-livro.epub'
    lib.baixarLivroDoLink.mockResolvedValue(arquivo('o-livro.epub'))
    lib.lerArquivoTrazido.mockResolvedValue(LIDO)
    const aoAbrir = vi.fn()
    render(<TrazerOSeu aoAbrir={aoAbrir} />)
    colar(url)
    await waitFor(() => expect(aoAbrir).toHaveBeenCalled())
    expect(lib.baixarLivroDoLink).toHaveBeenCalledWith(url)
    expect(aoAbrir.mock.calls[0][0]).toMatchObject({ origem: 'link', url })
  })

  it('página que não é arquivo: mensagem útil e nenhum download', () => {
    render(<TrazerOSeu aoAbrir={vi.fn()} />)
    colar('https://www.amazon.com.br/dp/B000')
    expect(screen.getByTestId('erro-do-trazer').textContent).toMatch(/uma página, não um arquivo de livro/)
    expect(lib.baixarLivroDoLink).not.toHaveBeenCalled()
  })

  it('release do GitHub: explica e manda baixar e soltar', () => {
    render(<TrazerOSeu aoAbrir={vi.fn()} />)
    colar('https://github.com/u/r/releases/download/v1/livro.epub')
    expect(screen.getByTestId('erro-do-trazer').textContent).toMatch(/release/)
    expect(lib.baixarLivroDoLink).not.toHaveBeenCalled()
  })

  it('endereço sem sentido: pede o endereço completo', () => {
    render(<TrazerOSeu aoAbrir={vi.fn()} />)
    colar('livro')
    expect(screen.getByTestId('erro-do-trazer').textContent).toMatch(/endereço completo/)
  })

  it('o arquivo baixado com DRM também é recusado com a mensagem de DRM', async () => {
    lib.baixarLivroDoLink.mockResolvedValue(arquivo('o-livro.epub'))
    lib.lerArquivoTrazido.mockRejectedValue(new ErroDoLivro('drm'))
    render(<TrazerOSeu aoAbrir={vi.fn()} />)
    colar('https://raw.githubusercontent.com/u/r/main/o-livro.epub')
    expect((await screen.findByTestId('erro-do-trazer')).textContent).toMatch(/DRM/)
  })
})

describe('Trazer o seu: avisos, guia e ajuda', () => {
  it('o aviso de direitos está na zona de soltar e no campo de link', () => {
    render(<TrazerOSeu aoAbrir={vi.fn()} />)
    for (const id of ['aviso-de-direitos', 'aviso-de-direitos-link']) {
      expect(screen.getByTestId(id).textContent).toMatch(/Traga só livros que você tem o direito de ler/)
      expect(screen.getByTestId(id).textContent).toMatch(/O arquivo fica só no seu aparelho/)
    }
  })

  it('o guia lista as fontes com link externo seguro e nada de pirataria (textos e links)', () => {
    const { container } = render(<TrazerOSeu aoAbrir={vi.fn()} />)
    const guia = screen.getByTestId('onde-achar-livros')
    const links = within(guia).getAllByRole('link')
    expect(links).toHaveLength(FONTES_LEGAIS.length)
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
      expect(FONTES_LEGAIS.some((f) => f.url === a.getAttribute('href'))).toBe(true)
    }
    /* A tela toda (textos, hrefs, testids) sem nome de site pirata nem ferramenta de tirar proteção. */
    expect(container.innerHTML).not.toMatch(PROIBIDOS)
    expect(container.textContent).not.toMatch(PROIBIDOS)
    expect(guia.textContent).toMatch(/70 anos depois da morte do autor/)
  })

  it('a ajuda da Amazon explica o DRM e não ensina a tirar a proteção', () => {
    const { container } = render(<TrazerOSeu aoAbrir={vi.fn()} />)
    const ajuda = screen.getByTestId('ajuda-kindle').textContent ?? ''
    expect(ajuda).toMatch(/Comprei na Amazon, posso trazer\?/)
    expect(ajuda).toMatch(/proteção \(DRM\) e não abre no Frasy/)
    expect(ajuda).toMatch(/domínio público/)
    expect(container.textContent).not.toMatch(/remov(er|a|endo) (o )?drm|tirar (o )?drm|quebrar (o )?drm|desproteg/i)
  })

  it('ao voltar para a aba depois de abrir uma fonte, avisa e leva o foco à zona de soltar', () => {
    render(<TrazerOSeu aoAbrir={vi.fn()} />)
    expect(screen.queryByTestId('lembrete-de-volta')).toBeNull()
    /* Voltar à aba sem ter saído por um link do guia: nada. */
    voltarParaAAba()
    expect(screen.queryByTestId('lembrete-de-volta')).toBeNull()
    const primeiro = within(screen.getByTestId('onde-achar-livros')).getAllByRole('link')[0]
    primeiro.addEventListener('click', (e) => e.preventDefault())
    fireEvent.click(primeiro)
    voltarParaAAba()
    const aviso = screen.getByTestId('lembrete-de-volta')
    expect(aviso.textContent).toMatch(/Baixou um livro\? Solte o arquivo aqui/)
    fireEvent.click(within(aviso).getByRole('button'))
    expect(document.activeElement).toBe(screen.getByTestId('zona-de-soltar'))
    expect(screen.queryByTestId('lembrete-de-volta')).toBeNull()
  })
})
