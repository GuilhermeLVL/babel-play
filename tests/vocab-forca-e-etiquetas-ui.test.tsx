// @vitest-environment jsdom
/**
 * A FORÇA e as ETIQUETAS na tela (openspec `vocab-forca-e-etiquetas`): os quatro tracinhos com texto acessível, o
 * filtro de força e de etiqueta do catálogo e o editor de etiquetas do cartão da palavra.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  salvar: vi.fn(async (_id: string, e: string[]) => e as string[] | null),
  emUso: vi.fn(async () => [{ etiqueta: 'filme', cartoes: 3 }]),
}))
vi.mock('../src/data/api', () => ({
  salvarEtiquetasDoCartao: api.salvar,
  fetchEtiquetasEmUso: api.emUso,
}))

import CatalogoDoQuest from '../src/components/views/vocab/quest/CatalogoDoQuest'
import EtiquetasDoCartao from '../src/components/vocab/EtiquetasDoCartao'
import ForcaDaPalavra from '../src/components/vocab/ForcaDaPalavra'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ForcaDaPalavra', () => {
  it('diz a força por extenso e enche tantos tracinhos quanto a força', () => {
    const { container } = render(<ForcaDaPalavra forca={3} />)
    expect(screen.getByRole('img', { name: 'Força 3 de 4: familiar' })).toBeTruthy()
    expect(container.querySelectorAll('i')).toHaveLength(4)
    expect(container.querySelectorAll('i.cheio')).toHaveLength(3)
  })
})

function catalogo(extra: Partial<React.ComponentProps<typeof CatalogoDoQuest>> = {}) {
  const aoAlternarForca = vi.fn()
  const aoAlternarEtiqueta = vi.fn()
  render(
    <CatalogoDoQuest
      carregando={false}
      carregandoMais={false}
      erro={null}
      total={1}
      geral={1}
      busca=""
      aoBuscar={() => {}}
      refDaBusca={{ current: null }}
      ordem="recentes"
      ordens={[
        { id: 'recentes', rotulo: 'Mais recentes' },
        { id: 'forca', rotulo: 'Mais fracas primeiro' },
      ]}
      aoOrdenar={() => {}}
      niveis={[]}
      aoAlternarNivel={() => {}}
      origens={[]}
      aoAlternarOrigem={() => {}}
      forcas={[1, 2, 3, 4].map((f) => ({
        id: String(f),
        rotulo: `${f} · x`,
        qtd: null,
        ativo: f === 2,
        desligado: false,
      }))}
      aoAlternarForca={aoAlternarForca}
      etiquetas={[{ id: 'filme', rotulo: 'filme', qtd: 3, ativo: false, desligado: false }]}
      aoAlternarEtiqueta={aoAlternarEtiqueta}
      temFiltro={false}
      aoLimpar={() => {}}
      linhas={[
        {
          id: 'c1',
          palavra: 'river',
          traducao: 'rio',
          nivel: 'A2',
          dicaDoNivel: '',
          fonteDoNivel: '',
          origem: 'Sessão',
          estado: { rotulo: 'Em revisão', tom: 'ok' },
          forca: 4,
          etiquetas: ['filme', 'viagem'],
        },
      ]}
      aoAbrir={() => {}}
      temMais={false}
      aoMostrarMais={() => {}}
      aoTentarDeNovo={() => {}}
      {...extra}
    />,
  )
  return { aoAlternarForca, aoAlternarEtiqueta }
}

describe('CatalogoDoQuest: força e etiqueta', () => {
  it('a linha mostra a força e as etiquetas; "Filtros" abre os grupos Força e Etiquetas', () => {
    const { aoAlternarForca, aoAlternarEtiqueta } = catalogo()
    expect(screen.getByRole('img', { name: 'Força 4 de 4: firme' })).toBeTruthy()
    expect(screen.getByText('viagem')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Filtros/ }))
    const forca = screen.getByRole('group', { name: 'Força' })
    expect(within(forca).getByRole('button', { name: /2 · x/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(forca).getByRole('button', { name: /3 · x/ }))
    expect(aoAlternarForca).toHaveBeenCalledWith('3')

    fireEvent.click(within(screen.getByRole('group', { name: 'Etiquetas' })).getByRole('button', { name: /filme/ }))
    expect(aoAlternarEtiqueta).toHaveBeenCalledWith('filme')
  })

  it('o contador de "Filtros" soma força e etiqueta ligadas; a ordem por força está na lista', () => {
    catalogo()
    expect(screen.getByRole('button', { name: /Filtros/ }).textContent).toContain('1')
    expect(screen.getByRole('option', { name: 'Mais fracas primeiro' })).toBeTruthy()
  })

  it('sem etiquetas em uso o grupo Etiquetas não aparece', () => {
    catalogo({ etiquetas: [] })
    fireEvent.click(screen.getByRole('button', { name: /Filtros/ }))
    expect(screen.queryByRole('group', { name: 'Etiquetas' })).toBeNull()
  })
})

describe('EtiquetasDoCartao', () => {
  it('mostra os chips, acrescenta uma etiqueta normalizada e grava a lista inteira', async () => {
    render(<EtiquetasDoCartao cardId="c1" inicial={['viagem']} />)
    expect(screen.getByText('viagem')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Adicionar etiqueta'), { target: { value: '  #Filme ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(api.salvar).toHaveBeenCalledWith('c1', ['viagem', 'filme']))
    expect(await screen.findByText('filme')).toBeTruthy()
  })

  it('remove uma etiqueta pelo botão acessível', async () => {
    render(<EtiquetasDoCartao cardId="c1" inicial={['viagem', 'filme']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remover a etiqueta viagem' }))
    await waitFor(() => expect(api.salvar).toHaveBeenCalledWith('c1', ['filme']))
  })

  it('o servidor não gravou: a lista fica como estava e o aviso diz', async () => {
    api.salvar.mockResolvedValueOnce(null)
    render(<EtiquetasDoCartao cardId="c1" inicial={['viagem']} />)
    fireEvent.change(screen.getByPlaceholderText('Adicionar etiqueta'), { target: { value: 'filme' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(await screen.findByText('Não deu para salvar as etiquetas agora.')).toBeTruthy()
    expect(screen.queryByText('filme')).toBeNull()
  })

  it('recusa etiqueta inválida e passa do teto de 10 sem chamar o servidor', async () => {
    const dez = Array.from({ length: 10 }, (_, i) => `e${i}`)
    render(<EtiquetasDoCartao cardId="c1" inicial={dez} />)
    fireEvent.change(screen.getByPlaceholderText('Adicionar etiqueta'), { target: { value: 'mais' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(await screen.findByText('Até 10 etiquetas por palavra.')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Adicionar etiqueta'), { target: { value: '!!!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(await screen.findByText(/Use letras, números/)).toBeTruthy()
    expect(api.salvar).not.toHaveBeenCalled()
  })
})
