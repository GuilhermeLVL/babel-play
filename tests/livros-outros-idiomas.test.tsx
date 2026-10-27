// @vitest-environment jsdom
/**
 * A MESMA OBRA EM OUTROS IDIOMAS na tela: o bloco "Ler esta obra em outros idiomas", os idiomas no cartão e o
 * "Há N resultados em <idioma>" que conta obras (não edições) e leva à edição certa.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import CartaoDoLivro from '../src/components/views/livros/CartaoDoLivro'
import OutrosIdiomasDaObra from '../src/components/views/livros/OutrosIdiomasDaObra'
import Vitrine from '../src/components/views/livros/Vitrine'
import type { LivroDoCatalogo } from '../src/core/livros/tipos'

afterEach(cleanup)

let n = 0
const livro = (o: Partial<LivroDoCatalogo> = {}): LivroDoCatalogo => {
  n++
  return {
    id: `x${n}`,
    titulo: `Livro ${n}`,
    autores: [{ nome: 'Miguel de Cervantes', anoMorte: 1616, idiomas: ['es'] }],
    tradutores: [],
    idioma: 'es',
    fonte: 'gutenberg-curado',
    fonteId: `${n}`,
    formatos: {},
    categorias: [],
    classificacao: 'livre',
    nivel: 'B1',
    palavras: 50_000,
    minutosEstimados: 280,
    popularidade: 0.5,
    downloads: 1,
    credito: '',
    licenca: '',
    ...o,
  }
}

const quixoteEs = livro({ id: 'pg-2000', titulo: 'Don Quijote', idioma: 'es', obra: 'Q480' })
const quixoteEn = livro({
  id: 'pg-996',
  titulo: 'Don Quixote',
  idioma: 'en',
  obra: 'Q480',
  tradutores: [{ nome: 'John Ormsby', anoMorte: 1895, idiomas: ['en'] }],
})
const quixotePt = livro({ id: 'ws-pt-dq', titulo: 'Dom Quixote', idioma: 'pt', obra: 'Q480' })
const outroEs = livro({ id: 'pg-3', titulo: 'La Galatea', idioma: 'es', obra: 'Q9' })

describe('bloco "Ler esta obra em outros idiomas"', () => {
  it('lista cada edição com idioma, tradutor †ano e o botão Ler', () => {
    const aoLer = vi.fn()
    const aoAbrir = vi.fn()
    render(<OutrosIdiomasDaObra edicoes={[quixoteEn, quixotePt]} aoAbrir={aoAbrir} aoLer={aoLer} />)
    const bloco = screen.getByTestId('outros-idiomas')
    expect(within(bloco).getByRole('heading', { name: 'Ler esta obra em outros idiomas' })).toBeTruthy()
    const linha = bloco.querySelector('[data-edicao="pg-996"]') as HTMLElement
    expect(linha.textContent).toContain('Inglês')
    expect(linha.textContent).toContain('John Ormsby (†1895)')
    fireEvent.click(within(linha).getByTestId('ler-outra-edicao'))
    expect(aoLer).toHaveBeenCalledWith(quixoteEn)
    fireEvent.click(within(linha).getByRole('button', { name: 'Don Quixote' }))
    expect(aoAbrir).toHaveBeenCalledWith(quixoteEn)
  })

  it('sem outras edições não desenha nada', () => {
    const { container } = render(<OutrosIdiomasDaObra edicoes={[]} aoAbrir={() => {}} aoLer={() => {}} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('cartão com os idiomas da obra', () => {
  it('mostra os outros idiomas, e nada quando só há uma edição', () => {
    const { rerender } = render(<CartaoDoLivro livro={quixoteEs} aoAbrir={() => {}} tambemEm={['en', 'pt']} />)
    expect(screen.getByTestId('tambem-em').textContent).toContain('Também em inglês, português')
    rerender(<CartaoDoLivro livro={quixoteEs} aoAbrir={() => {}} />)
    expect(screen.queryByTestId('tambem-em')).toBeNull()
  })
})

describe('vitrine: o fallback conta obras e leva à edição certa', () => {
  const props = {
    exclusoes: [],
    ano: 2026,
    anoLimite: 1955,
    nivel: 'B1' as const,
    aoTrocarNivel: () => {},
    menor: false,
    aoTrazer: () => {},
  }

  it('busca por título traduzido sem edição no idioma atual: 1 obra em outro idioma abre a edição direto', () => {
    const aoAbrir = vi.fn()
    const aoTrocarIdioma = vi.fn()
    render(
      <Vitrine
        {...props}
        livros={[quixoteEn, outroEs]}
        idioma="es"
        aoTrocarIdioma={aoTrocarIdioma}
        aoAbrir={aoAbrir}
      />,
    )
    fireEvent.change(screen.getByTestId('busca-de-livros'), { target: { value: 'quixote' } })
    expect(screen.getByRole('heading', { name: 'Nenhum livro encontrado' })).toBeTruthy()
    expect(screen.getByText(/Há 1 resultado em inglês/)).toBeTruthy()
    fireEvent.click(screen.getByTestId('abrir-em-outro-idioma'))
    expect(aoAbrir).toHaveBeenCalledWith(quixoteEn)
    expect(aoTrocarIdioma).not.toHaveBeenCalled()
  })

  it('a obra com edição no idioma atual aparece UMA vez e não entra na contagem de "outros idiomas"', () => {
    render(
      <Vitrine
        {...props}
        livros={[quixoteEs, quixoteEn, quixotePt, outroEs]}
        idioma="es"
        aoTrocarIdioma={() => {}}
        aoAbrir={() => {}}
      />,
    )
    fireEvent.change(screen.getByTestId('busca-de-livros'), { target: { value: 'dom quixote' } })
    const resultados = screen.getByTestId('resultados-de-livros')
    expect(within(resultados).getAllByRole('button', { name: /Don Quijote/ })).toHaveLength(1)
    expect(within(resultados).queryByText(/Há \d+ resultado/)).toBeNull()
    expect(within(resultados).getByTestId('tambem-em').textContent).toContain('Também em inglês, português')
  })

  it('várias obras em outro idioma: oferece trocar de idioma e conta obras, não edições', () => {
    const outraEn = livro({ id: 'pg-1', titulo: 'Quixote Jr.', idioma: 'en', obra: 'Q7' })
    const segundaEdicaoEn = { ...quixoteEn, id: 'pg-997' }
    const aoTrocarIdioma = vi.fn()
    render(
      <Vitrine
        {...props}
        livros={[quixoteEn, segundaEdicaoEn, outraEn, outroEs]}
        idioma="es"
        aoTrocarIdioma={aoTrocarIdioma}
        aoAbrir={() => {}}
      />,
    )
    fireEvent.change(screen.getByTestId('busca-de-livros'), { target: { value: 'quixote' } })
    expect(screen.getByText(/Há 2 resultados em inglês/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver em inglês' }))
    expect(aoTrocarIdioma).toHaveBeenCalledWith('en')
  })
})
