// @vitest-environment jsdom
/**
 * A TELA "MEUS LIVROS": capa, barra de progresso (derivada da posição do leitor), capítulo, última leitura,
 * tempo que falta, anotações, busca, filtro, estado vazio e o filtro de quem é menor.
 *
 * A armadilha de id: a posição do leitor é gravada com o id DA ESTANTE (`cat:<id>` no catálogo; o próprio
 * `meu-…` no trazido), e o `MeuLivro` do catálogo guarda só `<id>`.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LivroDoCatalogo } from '../src/core/livros/tipos'

const anotacoesPorLivro = vi.hoisted(() => ({ dados: {} as Record<string, Array<{ apagadoEm: number | null }>> }))
vi.mock('../src/lib/livros/armazem', async (orig) => ({
  ...(await orig<typeof import('../src/lib/livros/armazem')>()),
  estante: {
    anotacoes: async (id: string) => anotacoesPorLivro.dados[id] ?? [],
    apagarLivro: async () => undefined,
  },
}))

import MeusLivros from '../src/components/views/livros/MeusLivros'
import { guardarMeuLivro, idNaEstante, type MeuLivro } from '../src/lib/livros/meusLivros'
import { posicoes } from '../src/lib/livros/posicoesDoAparelho'

const ficha = (id: string, minutos: number) => ({ id, minutosEstimados: minutos }) as unknown as LivroDoCatalogo

function guardar(l: Partial<MeuLivro> & Pick<MeuLivro, 'id' | 'titulo' | 'origem'>) {
  return guardarMeuLivro({ adicionadoEm: 1000, ...l })
}

function lerAte(livro: Pick<MeuLivro, 'id' | 'origem'>, fracao: number, capitulo?: string, quando = 5_000_000) {
  posicoes.gravar({
    livroId: idNaEstante(livro),
    cfi: 'epubcfi(/6/4!/4/2)',
    secao: 3,
    fracao,
    capitulo,
    atualizadaEm: quando,
  })
}

function montar(props: Partial<React.ComponentProps<typeof MeusLivros>> = {}) {
  const aoAbrir = vi.fn()
  const aoTrazer = vi.fn()
  const aoCatalogo = vi.fn()
  render(<MeusLivros aoAbrir={aoAbrir} aoTrazer={aoTrazer} aoCatalogo={aoCatalogo} visivel={() => true} {...props} />)
  return { aoAbrir, aoTrazer, aoCatalogo }
}

beforeEach(async () => {
  localStorage.clear()
  anotacoesPorLivro.dados = {}
  // Esvazia a lista em memória (o cache do módulo acompanha o `localStorage` por evento).
  const { lerMeusLivros, removerMeuLivro } = await import('../src/lib/livros/meusLivros')
  for (const l of lerMeusLivros()) await removerMeuLivro(l.id)
})
afterEach(cleanup)

describe('estado vazio', () => {
  it('convida a ir ao catálogo e a trazer o seu', () => {
    const { aoCatalogo, aoTrazer } = montar()
    expect(screen.getByRole('heading', { name: 'Nenhum livro guardado ainda' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver o catálogo' }))
    fireEvent.click(screen.getByRole('button', { name: /Trazer o seu/ }))
    expect(aoCatalogo).toHaveBeenCalledOnce()
    expect(aoTrazer).toHaveBeenCalledOnce()
  })
})

describe('progresso derivado da posição do leitor', () => {
  it('livro do catálogo: lê a posição por `cat:<id>` e mostra % , capítulo, tempo que falta e capa', () => {
    const l = guardar({ id: 'pg-1342', titulo: 'Pride and Prejudice', autor: 'Jane Austen', origem: 'catalogo' })
    expect(idNaEstante(l)).toBe('cat:pg-1342')
    lerAte(l, 0.5, 'Chapter 20')
    montar({ catalogo: [ficha('pg-1342', 600)] })

    const item = document.querySelector('[data-livro="pg-1342"]') as HTMLElement
    const barra = within(item).getByRole('progressbar')
    expect(barra.getAttribute('aria-valuenow')).toBe('50')
    expect(item.textContent).toContain('50% lido')
    expect(item.textContent).toContain('Capítulo atual: Chapter 20')
    expect(item.textContent).toContain('Faltam cerca de 5 h')
    expect(item.querySelector('.lv-capa')).toBeTruthy()
  })

  it('livro trazido: a posição está sob o próprio id, e não há tempo estimado', () => {
    const l = guardar({ id: 'meu-abc123', titulo: 'Meu PDF', origem: 'arquivo' })
    lerAte(l, 0.25)
    montar()
    const item = document.querySelector('[data-livro="meu-abc123"]') as HTMLElement
    expect(within(item).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25')
    expect(item.textContent).not.toContain('Faltam')
  })

  it('a posição gravada sob o id CRU do catálogo (sem `cat:`) não vale', () => {
    guardar({ id: 'pg-84', titulo: 'Frankenstein', origem: 'catalogo' })
    posicoes.gravar({ livroId: 'pg-84', cfi: 'epubcfi(/6/2)', secao: 1, fracao: 0.9, atualizadaEm: 1 })
    montar({ catalogo: [ficha('pg-84', 300)] })
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByText('Ainda sem progresso salvo')).toBeTruthy()
  })

  it('sem posição: texto de "ainda sem progresso", sem barra', () => {
    guardar({ id: 'meu-novo', titulo: 'Novo', origem: 'arquivo' })
    montar()
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByText('Ainda sem progresso salvo')).toBeTruthy()
  })

  it('o campo antigo `progresso` não manda: dado velho no disco continua válido', () => {
    localStorage.setItem(
      'frasy.livros.meus.v1',
      JSON.stringify([
        {
          id: 'meu-velho',
          titulo: 'Velho',
          origem: 'arquivo',
          adicionadoEm: 1,
          status: 'lendo',
          etiquetas: [],
          progresso: 0.9,
        },
      ]),
    )
    montar()
    // Outra aba gravou o registro antigo: o módulo relê do disco.
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'frasy.livros.meus.v1' }))
    })
    expect(screen.getByText('Velho', { selector: 'b' })).toBeTruthy()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})

describe('status e anotações', () => {
  it('chegou ao fim e não está "Lido": sugere, e um clique marca', () => {
    const l = guardar({ id: 'meu-fim', titulo: 'Quase', origem: 'arquivo', status: 'lendo' })
    lerAte(l, 0.99)
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como lido' }))
    expect((screen.getByLabelText('Status de Quase') as HTMLSelectElement).value).toBe('lido')
    expect(screen.queryByRole('button', { name: /Marcar como/ })).toBeNull()
  })

  it('mostra a contagem de anotações vivas (sem as apagadas), sem travar a lista', async () => {
    const l = guardar({ id: 'meu-nota', titulo: 'Com notas', origem: 'arquivo' })
    anotacoesPorLivro.dados[idNaEstante(l)] = [{ apagadoEm: null }, { apagadoEm: null }, { apagadoEm: 5 }]
    montar()
    expect(screen.getByText('Com notas', { selector: 'b' })).toBeTruthy()
    await waitFor(() => expect(document.body.textContent).toContain('2 anotações'))
  })
})

describe('busca, filtro e ordem', () => {
  function tresLivros() {
    guardar({ id: 'meu-a', titulo: 'Alfa', autor: 'Machado de Assis', origem: 'arquivo', status: 'lendo' })
    guardar({ id: 'meu-b', titulo: 'Beta', origem: 'arquivo', status: 'quero-ler' })
    const c = guardar({ id: 'meu-c', titulo: 'Gama', origem: 'arquivo', status: 'lido' })
    lerAte(c, 1, undefined, 9_000_000)
  }

  it('busca por título e por autor, e some tudo com um termo sem resultado', () => {
    tresLivros()
    montar()
    const busca = screen.getByTestId('busca-meus-livros')
    fireEvent.change(busca, { target: { value: 'machado' } })
    expect(screen.queryByText('Beta')).toBeNull()
    expect(screen.getByText('Alfa', { selector: 'b' })).toBeTruthy()
    fireEvent.change(busca, { target: { value: 'zzz' } })
    expect(screen.getByTestId('meus-livros-sem-resultado')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.getByText('Beta', { selector: 'b' })).toBeTruthy()
  })

  it('filtra por status e mostra os números', () => {
    tresLivros()
    montar()
    fireEvent.click(screen.getByRole('button', { name: /^Lido/ }))
    expect(screen.getByText('Gama', { selector: 'b' })).toBeTruthy()
    expect(screen.queryByText('Alfa')).toBeNull()
    expect(screen.getByRole('button', { name: /^Lido/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('o lido por último vem primeiro', () => {
    tresLivros()
    montar()
    const titulos = Array.from(document.querySelectorAll('.lv-meu-texto b')).map((b) => b.textContent)
    expect(titulos[0]).toBe('Gama')
  })
})

describe('quem é menor', () => {
  it('o guardado do catálogo que o perfil não vê some (e o trazido continua)', () => {
    guardar({ id: 'pg-proibido', titulo: 'Livro Adulto', origem: 'catalogo' })
    guardar({ id: 'meu-meu', titulo: 'Do Aluno', origem: 'arquivo' })
    montar({ visivel: () => false })
    expect(screen.queryByText('Livro Adulto')).toBeNull()
    expect(screen.getByText('Do Aluno', { selector: 'b' })).toBeTruthy()
  })
})

describe('ler e remover', () => {
  it('"Ler" entrega o livro; remover tira da lista e esquece a posição sob o id da ESTANTE', async () => {
    const l = guardar({ id: 'pg-11', titulo: 'Alice', origem: 'catalogo' })
    lerAte(l, 0.3)
    const { aoAbrir } = montar({ catalogo: [ficha('pg-11', 100)] })
    fireEvent.click(screen.getByRole('button', { name: /Ler/ }))
    expect(aoAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 'pg-11' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Tirar Alice/ }))
    })
    expect(posicoes.ler('cat:pg-11')).toBeNull()
    expect(screen.queryByText('Alice')).toBeNull()
  })
})
