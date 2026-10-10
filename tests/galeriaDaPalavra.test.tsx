// @vitest-environment jsdom
/**
 * A GALERIA DA FOLHA DA PALAVRA — a principal, as miniaturas e o crédito.
 *
 * O relato (10/10/2026): uma imagem só, e errada, confunde. A folha mostra até quatro; tocar numa
 * miniatura a troca com a principal; cada uma leva o seu crédito; e sem imagem que ilustre a palavra
 * o componente não desenha nada (a coluna some da folha).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import GaleriaDaPalavra from '../src/components/GaleriaDaPalavra'
import type { ImagemDaPalavra } from '../src/lib/imagens/criterios'

afterEach(cleanup)

const imagem = (n: number, extra: Partial<ImagemDaPalavra> = {}): ImagemDaPalavra => ({
  id: `img-${n}`,
  url: `https://exemplo.test/${n}.jpg`,
  titulo: `Cachorro ${n}`,
  autor: `Autora ${n}`,
  licenca: 'CC BY-SA 4.0',
  pagina: `https://exemplo.test/pagina/${n}`,
  acervo: 'Wikimedia Commons',
  fonte: 'verbete',
  ...extra,
})
const QUATRO = [1, 2, 3, 4].map((n) => imagem(n))

const principal = () => document.querySelector('.qp-imagem img') as HTMLImageElement
const miniaturas = () =>
  within(screen.getByRole('group', { name: 'Outras imagens de cachorro' })).getAllByRole('button')
const fontes = (lista: HTMLElement[]) => lista.map((b) => b.querySelector('img')?.getAttribute('src'))

describe('GaleriaDaPalavra', () => {
  it('a primeira é a principal; as outras três são miniaturas com nome para o leitor de tela', () => {
    render(<GaleriaDaPalavra palavra="cachorro" imagens={QUATRO} carregando={false} />)
    expect(principal().getAttribute('src')).toBe('https://exemplo.test/1.jpg')
    expect(principal().getAttribute('alt')).toBe('cachorro: Cachorro 1')
    expect(fontes(miniaturas())).toEqual([
      'https://exemplo.test/2.jpg',
      'https://exemplo.test/3.jpg',
      'https://exemplo.test/4.jpg',
    ])
    expect(miniaturas()[0].getAttribute('aria-label')).toBe(
      'Mostrar em cima a imagem 2 de 4: Cachorro 2. Autora 2, CC BY-SA 4.0, Wikimedia Commons',
    )
    // A imagem da miniatura é decorativa: o nome está no botão.
    expect(miniaturas()[0].querySelector('img')?.getAttribute('alt')).toBe('')
  })

  it('tocar numa miniatura troca com a principal: a de cima desce para o lugar da que subiu', () => {
    render(<GaleriaDaPalavra palavra="cachorro" imagens={QUATRO} carregando={false} />)
    const terceiro = miniaturas()[2]
    fireEvent.click(terceiro)
    expect(principal().getAttribute('src')).toBe('https://exemplo.test/4.jpg')
    expect(fontes(miniaturas())).toEqual([
      'https://exemplo.test/2.jpg',
      'https://exemplo.test/3.jpg',
      'https://exemplo.test/1.jpg',
    ])
    // O botão é o mesmo elemento (o foco do teclado fica onde estava) e agora traz a que desceu.
    expect(miniaturas()[2]).toBe(terceiro)
    expect(terceiro.getAttribute('aria-label')).toContain('Cachorro 1')
    // De novo no mesmo botão: volta ao que era.
    fireEvent.click(terceiro)
    expect(principal().getAttribute('src')).toBe('https://exemplo.test/1.jpg')
  })

  it('funciona pelo teclado: a miniatura é um botão de verdade, e o foco fica nele depois da troca', () => {
    render(<GaleriaDaPalavra palavra="cachorro" imagens={QUATRO} carregando={false} />)
    const primeiro = miniaturas()[0]
    expect(primeiro.tagName).toBe('BUTTON')
    expect(primeiro.getAttribute('type')).toBe('button')
    primeiro.focus()
    expect(document.activeElement).toBe(primeiro)
    fireEvent.click(primeiro)
    expect(document.activeElement).toBe(miniaturas()[0])
    expect(principal().getAttribute('src')).toBe('https://exemplo.test/2.jpg')
  })

  it('o crédito é o da imagem que está em cima: acervo, licença, autor e o link para conferir', () => {
    const lista = [
      imagem(1),
      imagem(2, { autor: 'monicatenerife', licenca: 'CC BY-NC 2.0', acervo: 'Flickr', fonte: 'busca' }),
    ]
    render(<GaleriaDaPalavra palavra="cachorro" imagens={lista} carregando={false} />)
    const credito = () => screen.getByTestId('credito-da-imagem')
    expect(credito().getAttribute('aria-live')).toBe('polite')
    expect(credito().textContent).toContain('Wikimedia Commons · CC BY-SA 4.0')
    expect(credito().textContent).toContain('imagem de Autora 1')
    expect(within(credito()).getByRole('link').getAttribute('href')).toBe('https://exemplo.test/pagina/1')
    fireEvent.click(within(credito()).getByRole('button', { name: /o que isso significa/ }))
    expect(credito().textContent).toContain('Quem editou o verbete do Wikcionário escolheu esta imagem')

    fireEvent.click(miniaturas()[0])
    expect(credito().textContent).toContain('Flickr · CC BY-NC 2.0')
    expect(credito().textContent).toContain('imagem de monicatenerife')
    expect(within(credito()).getByRole('link').getAttribute('href')).toBe('https://exemplo.test/pagina/2')
    expect(credito().textContent).toContain('Imagem livre cujo título é a própria palavra')
  })

  it('imagem sem autor nem licença informados: o crédito diz o acervo e mantém o link', () => {
    render(
      <GaleriaDaPalavra
        palavra="banco"
        imagens={[imagem(1, { autor: undefined, licenca: undefined })]}
        carregando={false}
      />,
    )
    const credito = screen.getByTestId('credito-da-imagem')
    expect(credito.textContent).toContain('Wikimedia Commons · licença na página da imagem')
    expect(credito.textContent).not.toContain('imagem de')
    expect(within(credito).getByRole('link')).toBeTruthy()
    // Uma imagem só: não há fila de miniaturas.
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('SEM IMAGEM não desenha nada: a coluna some da folha', () => {
    const { container } = render(<GaleriaDaPalavra palavra="concordado" imagens={[]} carregando={false} />)
    expect(container.innerHTML).toBe('')
  })

  it('buscando: o lugar da imagem avisa, sem miniaturas nem crédito', () => {
    const { container } = render(<GaleriaDaPalavra palavra="cachorro" imagens={[]} carregando />)
    expect(within(container.querySelector('.qp-imagem') as HTMLElement).getByRole('status').textContent).toContain(
      'Buscando imagem',
    )
    expect(container.querySelector('.qp-miniaturas')).toBeNull()
    expect(screen.queryByTestId('credito-da-imagem')).toBeNull()
  })

  it('a imagem que não abre sai da galeria; se era a única, a coluna some', () => {
    const { container, rerender } = render(<GaleriaDaPalavra palavra="cachorro" imagens={QUATRO} carregando={false} />)
    fireEvent.error(principal())
    expect(principal().getAttribute('src')).toBe('https://exemplo.test/2.jpg')
    expect(miniaturas()).toHaveLength(2)

    rerender(<GaleriaDaPalavra key="outra" palavra="cachorro" imagens={[imagem(9)]} carregando={false} />)
    fireEvent.error(principal())
    expect(container.innerHTML).toBe('')
  })
})
